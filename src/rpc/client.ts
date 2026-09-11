import type { PendingRequest, RpcTransport } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One connection's request lifecycle; the caller owns socket callbacks and closure. */
export class RpcClient {
  private nextId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private disconnected = false;

  /** The timeout is milliseconds, defaults to 30 seconds, and does not cancel remote work. */
  constructor(private readonly ws: RpcTransport, private readonly timeoutMs = 30_000) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
      throw new Error("RPC timeout must be a positive integer no greater than 2147483647");
    }
  }

  /** Send one request. Rejects on errors or timeout; never retries or assumes a write was cancelled. */
  call(method: string, params?: unknown): Promise<unknown> {
    if (this.disconnected) {
      return Promise.reject(new Error("RPC connection is closed"));
    }

    return new Promise<unknown>((resolve, reject) => {
      const id = this.allocateId();
      // Serialize before registering the request: serialization can throw.
      const request = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC request timed out: ${method} (${id})`));
      }, this.timeoutMs);

      const pending: PendingRequest = {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (reason) => { clearTimeout(timer); reject(reason); },
      };
      this.pendingRequests.set(id, pending);

      try {
        if (this.ws.send(request) === 0) {
          throw new Error("WebSocket dropped the RPC request");
        }
      } catch (error) {
        this.pendingRequests.delete(id);
        pending.reject(error);
      }
    });
  }

  /**
   * Settle the matching request from JSON text. Valid unknown IDs are ignored.
   * Throws for malformed envelopes; the adapter decides whether to close the socket.
   */
  handleMessage(message: string): void {
    const response: unknown = JSON.parse(message);
    if (!isRecord(response) || response.jsonrpc !== "2.0" ||
        typeof response.id !== "number" || !Number.isSafeInteger(response.id)) {
      throw new Error("Invalid JSON-RPC response envelope");
    }

    const hasResult = Object.hasOwn(response, "result");
    const hasError = Object.hasOwn(response, "error");
    if (hasResult === hasError) {
      throw new Error("JSON-RPC response must contain exactly one of result or error");
    }

    let rpcError: Error | undefined;
    if (hasError) {
      const error = response.error;
      if (typeof error === "string") {
        rpcError = Object.assign(new Error(error), { name: "RpcError" });
      } else {
        if (!isRecord(error) || typeof error.code !== "number" ||
            !Number.isInteger(error.code) || typeof error.message !== "string") {
          throw new Error("Invalid JSON-RPC error object");
        }
        rpcError = Object.assign(new Error(error.message), {
          name: "RpcError", code: error.code, data: error.data,
        });
      }
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) return; // Late, duplicate, or unrelated response.
    this.pendingRequests.delete(response.id);
    if (rpcError) pending.reject(rpcError);
    else pending.resolve(response.result);
  }

  /** Reject all outstanding requests and prohibit further calls. Does not close the socket. */
  disconnect(reason: unknown = new Error("Bitburner disconnected")): void {
    this.disconnected = true;
    for (const pending of this.pendingRequests.values()) pending.reject(reason);
    this.pendingRequests.clear();
  }

  private allocateId(): number {
    if (!Number.isSafeInteger(this.nextId)) throw new Error("RPC request IDs exhausted");
    return this.nextId++;
  }
}
