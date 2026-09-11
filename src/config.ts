/** Validated WebSocket listener configuration. */
export interface ServerConfig { hostname: string; port: number }

/** Read optional environment settings; reject invalid values before opening a socket. */
export function readConfig(env: Record<string, string | undefined>): ServerConfig {
  const hostname = env.BUN_BURNER_HOST ?? "127.0.0.1";
  const rawPort = env.BUN_BURNER_PORT ?? "12525";
  if (!hostname.trim() || hostname !== hostname.trim() || /[\s/]/.test(hostname)) {
    throw new Error("BUN_BURNER_HOST must be a hostname or IP address without a URL scheme");
  }
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error("BUN_BURNER_PORT must be an integer from 1 to 65535");
  }
  return { hostname, port: Number(rawPort) };
}
