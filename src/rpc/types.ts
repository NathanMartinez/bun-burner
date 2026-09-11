export interface RpcTransport {
  // Bun send semantics: 0 = dropped, -1 = queued, positive = sent.
  send(message: string): number;
}

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}
