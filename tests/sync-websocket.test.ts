import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RpcClient } from "../src/rpc/client.ts";
import { BitburnerClient } from "../src/bitburner/client.ts";
import { runSync } from "../src/sync/run.ts";

async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 6000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for synchronization");
    await Bun.sleep(20);
  }
}

test("two-way sync runs through real WebSockets with a simulated game", async () => {
  const root = await mkdtemp(join(tmpdir(), "bun-burner-wire-"));
  await writeFile(join(root, "local.ts"), "const value: number = 1;\r\n");
  const game = new Map([["remote.tsx", "const ui = <div>game</div>;\n"]]);
  const controller = new AbortController();
  let task: Promise<void> = Promise.resolve();
  let failure: unknown;
  let rpc: RpcClient | undefined;
  const messages: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request, server) { if (server.upgrade(request)) return; return new Response("test"); },
    websocket: {
      open(ws) {
        rpc = new RpcClient(ws);
        task = runSync(new BitburnerClient(rpc), { root, server: "home" }, controller.signal, () => {})
          .catch((error: unknown) => { failure = error; });
      },
      message(_ws, data) { rpc!.handleMessage(typeof data === "string" ? data : new TextDecoder().decode(data)); },
      close() { controller.abort(); rpc?.disconnect(); },
    },
  });
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  socket.onmessage = ({ data }) => {
    const request = JSON.parse(String(data));
    messages.push(request.method);
    let result: unknown;
    switch (request.method) {
      case "getAllFiles": result = [...game].map(([filename, content]) => ({ filename, content })); break;
      case "getFileNames": result = [...game.keys()]; break;
      case "getFile": result = game.get(request.params.filename); break;
      case "pushFile": game.set(request.params.filename, request.params.content); result = "OK"; break;
      default: failure = new Error(`Unexpected game mutation: ${request.method}`); return;
    }
    // Exercise binary response decoding as well as JSON/RPC correlation.
    socket.send(new TextEncoder().encode(JSON.stringify({ jsonrpc: "2.0", id: request.id, result })));
  };
  try {
    await until(async () => game.has("local.ts"));
    expect(game.get("local.ts")).toBe("const value: number = 1;\r\n");
    expect(await readFile(join(root, "remote.tsx"), "utf8")).toBe("const ui = <div>game</div>;\n");
    game.set("remote.tsx", "const ui = <div>edited</div>;\n");
    await until(async () => (await readFile(join(root, "remote.tsx"), "utf8")).includes("edited"));
    expect(failure).toBeUndefined();
    expect(messages.includes("deleteFile")).toBe(false);
  } finally {
    controller.abort();
    await task;
    socket.close();
    server.stop(true);
    await rm(root, { recursive: true, force: true });
  }
}, 10_000);
