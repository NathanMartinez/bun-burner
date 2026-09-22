import { createServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import type { RpcTransport } from "../rpc/types.ts";

/** Internal host seam: connection policy and sync belong to the application. */
export interface Peer extends RpcTransport { close(code: number, reason: string): void }
export interface HostStatus { listening: boolean }
export interface HostAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): HostStatus;
}
interface HostEvents {
  open(peer: Peer): void;
  message(peer: Peer, data: Uint8Array): void;
  close(peer: Peer): void;
  error(error: Error): void;
}

/** One Node-compatible host for both Node and Bun; construction opens no sockets. */
export function createHost(host: string, port: number, events: HostEvents): HostAdapter {
  let active: { http: ReturnType<typeof createServer>; ws: WebSocketServer } | undefined;
  return {
    status: () => ({ listening: active?.http.listening ?? false }),
    async start() {
      if (active) return;
      const http = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        response.end("Bun Burner");
      });
      const ws = new WebSocketServer({ server: http, maxPayload: 16 * 1024 * 1024 });
      // ws forwards HTTP errors; the startup promise handles bind failures.
      ws.on("error", error => { if (active) events.error(error); });
      ws.on("connection", socket => {
        const peer: Peer = {
          send(message) {
            if (socket.readyState !== WebSocket.OPEN) throw new Error("WebSocket is closed");
            socket.send(message, error => { if (error) socket.terminate(); });
          },
          close: (code, reason) => socket.close(code, reason),
        };
        socket.on("message", data => events.message(peer,
          Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : data));
        socket.on("close", () => events.close(peer));
        socket.on("error", () => socket.terminate());
        events.open(peer);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          http.once("error", reject);
          http.listen(port, host, () => { http.removeListener("error", reject); resolve(); });
        });
        active = { http, ws };
      } catch (error) {
        ws.close();
        http.close();
        throw error;
      }
    },
    async stop() {
      if (!active) return;
      const { http, ws } = active;
      const socketsClosed = new Promise<void>((resolve, reject) => ws.close(error => error ? reject(error) : resolve()));
      for (const socket of ws.clients) socket.terminate();
      const httpClosed = new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
      http.closeAllConnections();
      try { await Promise.all([socketsClosed, httpClosed]); }
      finally { active = undefined; }
    },
  };
}
