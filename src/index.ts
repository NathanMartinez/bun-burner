import { BitburnerClient } from "./bitburner/client.ts";
import { RpcClient } from "./rpc/client.ts";

interface ConnectionData {
  rpc?: RpcClient;
}

const decoder = new TextDecoder("utf-8", { fatal: true });
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 12525,

  fetch(request, server) {
    if (server.upgrade(request, { data: {} })) return;
    return new Response("Bun Burner");
  },

  websocket: {
    data: {} as ConnectionData,

    open(ws) {
      console.log("Bitburner connected");
      const rpc = new RpcClient(ws);
      ws.data.rpc = rpc;

      const bitburner = new BitburnerClient(rpc);
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
      ws.data.rpc?.disconnect();
      console.log("Bitburner disconnected");
    },
  },
});

console.log(`Bun Burner listening on ws://${server.hostname}:${server.port}`);
