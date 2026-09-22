import { resolveConfig, type BunBurnerConfig, type BunBurnerOptions } from "./config.ts";
import { createHost, type Peer } from "./host.ts";
import { RpcClient } from "../rpc/client.ts";
import { BitburnerClient } from "../bitburner/client.ts";
import { runSync } from "../sync/run.ts";
import { syncFailureMessage } from "../sync/errors.ts";

export interface BunBurnerStatus {
  state: "stopped" | "starting" | "running" | "stopping";
  connections: number;
  sync: "disabled" | "idle" | "running" | "paused";
  config: Readonly<BunBurnerConfig>;
}
export interface BunBurnerApplication {
  /** Idempotent; lifecycle calls are serialized. Failed starts can be retried. */
  start(): Promise<void>;
  status(): Promise<BunBurnerStatus>;
  /** Disconnect clients, stop future transfers, and await workspace lock release. */
  stop(): Promise<void>;
}

/** Read/validate config and compose adapters; no listeners, sync, or filesystem writes. */
export async function createBunBurner(options: BunBurnerOptions = {}): Promise<BunBurnerApplication> {
  const config = await resolveConfig(options);
  const clients = new Map<Peer, { rpc: RpcClient; abort?: AbortController }>();
  let state: BunBurnerStatus["state"] = "stopped";
  let sync: BunBurnerStatus["sync"] = config.sync ? "idle" : "disabled";
  let syncOwner = false;
  let syncTask: Promise<void> | undefined;
  let stopSync: (() => void) | undefined;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const host = createHost(config.host, config.port, {
    error: error => console.error("WebSocket host error:", error),
    open(peer) {
      if (state === "stopping" || (config.sync && syncOwner)) {
        peer.close(1013, "Sync workspace already has a connection");
        return;
      }
      console.log("Bitburner connected");
      const rpc = new RpcClient(peer);
      const connection: { rpc: RpcClient; abort?: AbortController } = { rpc };
      clients.set(peer, connection);
      if (config.sync) {
        syncOwner = true;
        sync = "running";
        const controller = new AbortController();
        connection.abort = controller;
        stopSync = () => controller.abort();
        console.log(`Sync enabled: ${config.root} <-> ${config.server}`);
        syncTask = runSync(new BitburnerClient(rpc), config, controller.signal, ({ kind, filename }) => {
          console.log(`[sync:${kind}] ${filename}`);
        }).catch(async (error: unknown) => {
          sync = "paused";
          console.error(syncFailureMessage(error, config.root));
          // Preserve the pause until disconnect: no automatic retry of uncertain writes.
          if (!controller.signal.aborted) {
            await new Promise<void>(resolve => controller.signal.addEventListener("abort", () => resolve(), { once: true }));
          }
        }).finally(() => { syncOwner = false; sync = "idle"; });
      }
    },
    message(peer, message) {
      try { clients.get(peer)?.rpc.handleMessage(decoder.decode(message)); }
      catch (error) {
        console.error("Invalid RPC response:", error);
        clients.get(peer)?.rpc.disconnect(error);
        peer.close(1002, "Invalid JSON-RPC response");
      }
    },
    close(peer) {
      const connection = clients.get(peer);
      if (!connection) return;
      clients.delete(peer);
      connection.abort?.abort();
      connection.rpc.disconnect();
      console.log("Bitburner disconnected");
    },
  });
  let pending = Promise.resolve();
  function serialize(action: () => Promise<void>): Promise<void> {
    const next = pending.then(action);
    pending = next.catch(() => {});
    return next;
  }
  return {
    start: () => serialize(async () => {
      if (host.status().listening) return;
      state = "starting";
      try {
        await host.start();
        state = "running";
        const address = config.host.includes(":") ? `[${config.host}]` : config.host;
        console.log(`Bun Burner listening on ws://${address}:${config.port}`);
        if (config.debug) console.debug(`[debug] root=${config.root} server=${config.server} sync=${config.sync}`);
      } catch (error) { state = "stopped"; throw error; }
    }),
    status: async () => ({ state, connections: clients.size, sync, config }),
    stop: () => serialize(async () => {
      if (state === "stopped") return;
      state = "stopping";
      stopSync?.();
      for (const { rpc } of clients.values()) rpc.disconnect(new Error("Bridge shutting down"));
      try { await host.stop(); }
      finally {
        await syncTask;
        clients.clear();
        state = "stopped";
      }
    }),
  };
}
