/** Minimal transport implemented by Bun sockets and test transports. */
export interface RpcTransport {
  /** Bun send semantics: 0 = dropped, -1 = queued, positive = sent. */
  send(message: string): number;
}

/** Promise controls retained until a response, failure, or timeout settles a request. */
export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}
