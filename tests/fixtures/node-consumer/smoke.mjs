import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as core from "bun-burner";
import * as subpath from "bun-burner/core";

assert.equal(globalThis.Bun, undefined);
assert.equal(spawnSync("bun", ["--version"]).error?.code, "ENOENT");
assert.deepEqual(Object.keys(core).sort(), ["BitburnerClient", "RemoteFiles", "RpcClient", "SyncEngine"]);
for (const key of Object.keys(core)) assert.equal(core[key], subpath[key]);
await assert.rejects(import("bun-burner/dist/core.js"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });

const game = new Map([["hello.ts", "export const hello = 1;"]]);
const rpc = new core.RpcClient({ send(message) {
  const { id, method, params } = JSON.parse(message);
  let result;
  switch (method) {
    case "getAllFiles": result = [...game].map(([filename, content]) => ({ filename, content })); break;
    case "getFileNames": result = [...game.keys()]; break;
    case "getFile": result = game.get(params.filename); break;
    case "pushFile": game.set(params.filename, params.content); result = "OK"; break;
    default: throw new Error(`Unexpected method: ${method}`);
  }
  queueMicrotask(() => rpc.handleMessage(JSON.stringify({ jsonrpc: "2.0", id, result })));
} });
const remote = new core.RemoteFiles(new core.BitburnerClient(rpc), "home");
const local = new Map();
let saved = new Map();
const events = [];
const engine = new core.SyncEngine({
  snapshot: async () => new Map(local),
  read: async (name) => local.get(name),
  write: async (name, content) => { local.set(name, content); },
}, remote, {
  load: async () => new Map(),
  save: async (baseline) => { saved = new Map(baseline); },
  backup: async () => {},
}, (event) => events.push(event));
await engine.tick();
assert.equal(local.get("hello.ts"), game.get("hello.ts"));
assert.match(saved.get("hello.ts"), /^[a-f0-9]{64}$/);
local.set("upload.js", "export const upload = 2;");
await engine.tick();
await engine.tick();
assert.equal(game.get("upload.js"), local.get("upload.js"));
assert.deepEqual(events.map(e => e.kind), ["download", "upload"]);
engine.stop();
rpc.disconnect();
console.log(`Node ${process.version}: both public imports, RPC, remote files, sync and Web Crypto passed; Bun unavailable.`);
