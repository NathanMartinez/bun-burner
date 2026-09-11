import { readSyncOptions, runSync } from "./sync/run.ts";
import { readConfig } from "./config.ts";
import { BitburnerClient } from "./bitburner/client.ts";
import { RpcClient } from "./rpc/client.ts";

interface ConnectionData {
  rpc?: RpcClient;
  syncAbort?: AbortController;
}

const syncOptions = readSyncOptions(process.env);
let syncOwner = false;
let syncTask: Promise<void> | undefined;
let stopSync: (() => void) | undefined;
const clients = new Set<RpcClient>();

const decoder = new TextDecoder("utf-8", { fatal: true });
const server = Bun.serve({
  ...readConfig(process.env),

  fetch(request, server) {
    if (server.upgrade(request, { data: {} })) return;
    return new Response("Bun Burner");
  },

  websocket: {
    data: {} as ConnectionData,

    open(ws) {
      if (syncOptions && syncOwner) {
        ws.close(1013, "Sync workspace already has a connection");
        return;
      }
      console.log("Bitburner connected");
      const rpc = new RpcClient(ws);
      ws.data.rpc = rpc;
      clients.add(rpc);

      const bitburner = new BitburnerClient(rpc);
      if (syncOptions) {
        syncOwner = true;
        const controller = new AbortController();
        ws.data.syncAbort = controller;
        stopSync = () => controller.abort();
        console.log(`Sync enabled: ${syncOptions.root} <-> ${syncOptions.server}`);
        syncTask = runSync(bitburner, syncOptions, controller.signal, ({ kind, filename }) => {
          console.log(`[sync:${kind}] ${filename}`);
        }).catch(async (error: unknown) => {
          console.error("Sync paused; fix the problem and reconnect:", error);
          // Keep the connection paused; auto-reconnect must not blindly retry writes.
          if (!controller.signal.aborted) {
            await new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve(), { once: true }));
          }
        }).finally(() => { syncOwner = false; });
      }
      void bitburner.call("getFileNames", { server: "home" })
        .then((files) => console.log(JSON.stringify(files, null, 2)))
        .catch((error: unknown) => console.error("getFileNames failed:", error));
    },

    message(ws, message) {
      try {
        const text = typeof message === "string" ? message : decoder.decode(message);
        ws.data.rpc?.handleMessage(text);
      } catch (error) {
        console.error("Invalid RPC response:", error);
        ws.data.rpc?.disconnect(error);
        ws.close(1002, "Invalid JSON-RPC response");
      }
    },

    close(ws) {
      if (ws.data.rpc) clients.delete(ws.data.rpc);
      ws.data.syncAbort?.abort();
      ws.data.rpc?.disconnect();
      console.log("Bitburner disconnected");
    },
  },
});

console.log(`Bun Burner listening on ws://${server.hostname}:${server.port}`);

// Release workspace ownership on normal terminal/service shutdown.
async function shutdown(): Promise<void> {
  stopSync?.();
  for (const rpc of clients) rpc.disconnect(new Error("Bridge shutting down"));
  server.stop(true);
  await syncTask;
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void shutdown().catch((error: unknown) => console.error("Shutdown failed:", error)); });
}
