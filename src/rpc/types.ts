/** Minimal synchronous send contract; adapters may wrap any WebSocket implementation. */
export interface RpcTransport {
  /** Throw on failure or return 0 for a dropped message. Void/nonzero means accepted, not remotely acknowledged. */
  send(message: string): void | number;
}

/** Promise controls retained until a response, failure, or timeout settles a request. */
export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}
