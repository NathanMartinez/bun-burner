import type { BitburnerClient } from "../bitburner/client.ts";
import { SyncEngine, type SyncEvent } from "./engine.ts";
import { LocalFiles } from "./local.ts";
import { RemoteFiles } from "./remote.ts";

export interface SyncOptions { root: string; server: string }
/** Sync is opt-in. The selected directory maps directly to one game server. */
export function readSyncOptions(env: Record<string, string | undefined>): SyncOptions | undefined {
  const enabled = env.BUN_BURNER_SYNC_ENABLED ?? "false";
  if (enabled !== "true" && enabled !== "false") throw new Error("BUN_BURNER_SYNC_ENABLED must be true or false");
  if (enabled === "false") return undefined;
  const root = env.BUN_BURNER_SYNC_ROOT ?? "./scripts";
  if (!root.trim()) throw new Error("BUN_BURNER_SYNC_ROOT must be a directory path");
  const server = env.BUN_BURNER_SYNC_SERVER ?? "home";
  if (!server.trim()) throw new Error("BUN_BURNER_SYNC_SERVER must not be empty");
  return { root, server };
}

/** Poll sequentially every second. Any scan/transfer failure pauses until reconnect. */
export async function runSync(
  api: BitburnerClient,
  options: SyncOptions,
  signal: AbortSignal,
  report: (event: SyncEvent) => void,
): Promise<void> {
  if (signal.aborted) return;
  const local = await LocalFiles.create(options.root, options.server);
  const release = await local.lock();
  const engine = new SyncEngine(local, new RemoteFiles(api, options.server), local, report);
  const stop = () => engine.stop();
  signal.addEventListener("abort", stop, { once: true });
  try {
    while (!signal.aborted) {
      await engine.tick();
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, 1000);
        signal.addEventListener("abort", done, { once: true });
        if (signal.aborted) done();
      });
    }
  } finally {
    engine.stop();
    signal.removeEventListener("abort", stop);
    await release();
  }
}
