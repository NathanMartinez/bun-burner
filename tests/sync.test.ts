import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SyncEngine, type FileStore, type SyncState, type SyncEvent } from "../src/sync/engine.ts";
import { LocalFiles, allowed } from "../src/sync/local.ts";
import { RemoteFiles } from "../src/sync/remote.ts";
import { readSyncOptions } from "../src/sync/run.ts";
import { BitburnerClient } from "../src/bitburner/client.ts";
import { RpcClient } from "../src/rpc/client.ts";

class MemoryFiles implements FileStore {
  files = new Map<string, string>();
  writes = 0;
  async snapshot() { return new Map(this.files); }
  async read(name: string) { return this.files.get(name); }
  async write(name: string, content: string) { this.writes++; this.files.set(name, content); }
}
class MemoryState implements SyncState {
  baseline = new Map<string, string>();
  copies: string[] = [];
  async load() { return new Map(this.baseline); }
  async save(value: Map<string, string>) { this.baseline = new Map(value); }
  async backup(_name: string, _side: string, content: string) { this.copies.push(content); }
}
function fixture() {
  const local = new MemoryFiles(), remote = new MemoryFiles(), state = new MemoryState();
  const events: SyncEvent[] = [];
  const engine = new SyncEngine(local, remote, state, (event) => events.push(event));
  return { local, remote, state, events, engine };
}

test("source-preserving uploads/downloads settle without feedback loops", async () => {
  const { local, remote, engine, events } = fixture();
  local.files.set("ui.tsx", 'const title: string = "hello";\r\nconst ui = <div>{title}</div>;\n');
  remote.files.set("game.jsx", "const ui = <span />;\n");
  await engine.tick(); await engine.tick(); await engine.tick();
  expect(remote.files.get("ui.tsx")).toBe(local.files.get("ui.tsx"));
  expect(local.files.get("game.jsx")).toBe("const ui = <span />;\n");
  expect(local.writes).toBe(1); expect(remote.writes).toBe(1);
  expect(events.map((e) => e.kind).sort()).toEqual(["download", "upload"]);
});

test("persisted baselines allow later edits in either direction", async () => {
  const { local, remote, state, engine } = fixture();
  local.files.set("a.ts", "base"); remote.files.set("a.ts", "base");
  await engine.tick(); await engine.tick();
  local.files.set("a.ts", "local edit");
  const restarted = new SyncEngine(local, remote, state);
  await restarted.tick(); await restarted.tick();
  expect(remote.files.get("a.ts")).toBe("local edit");
  remote.files.set("a.ts", "game edit");
  await restarted.tick();
  expect(local.files.get("a.ts")).toBe("game edit");
  expect(state.copies).toContain("base");
});

test("different initial files and concurrent edits are preserved as conflicts", async () => {
  const { local, remote, engine, state, events } = fixture();
  local.files.set("a.ts", "local"); remote.files.set("a.ts", "remote");
  await engine.tick(); await engine.tick(); await engine.tick();
  expect(local.writes + remote.writes).toBe(0);
  expect(events).toEqual([{ kind: "conflict", filename: "a.ts" }]);
  expect(state.copies.sort()).toEqual(["local", "remote"]);
  remote.files.set("a.ts", "local"); await engine.tick();
  local.files.set("a.ts", "next local"); remote.files.set("a.ts", "next game");
  await engine.tick(); await engine.tick();
  expect(local.writes + remote.writes).toBe(0);
  expect(events.length).toBe(2);
});

test("deletions never delete or silently restore the opposite side", async () => {
  const { local, remote, engine, events } = fixture();
  local.files.set("a.ts", "base"); remote.files.set("a.ts", "base");
  await engine.tick(); await engine.tick();
  local.files.delete("a.ts");
  await engine.tick(); await engine.tick();
  expect(local.files.has("a.ts")).toBe(false);
  expect(remote.files.get("a.ts")).toBe("base");
  expect(events[0]?.kind).toBe("conflict");
});

test("a concurrent target edit is detected by the pre-write recheck", async () => {
  const { local, remote, engine } = fixture();
  local.files.set("a.ts", "base"); remote.files.set("a.ts", "base");
  await engine.tick(); await engine.tick();
  local.files.set("a.ts", "new"); await engine.tick();
  remote.read = async (name) => { remote.files.set(name, "late edit"); return "late edit"; };
  await engine.tick(); expect(remote.writes).toBe(0);
});

test("overlapping scans are rejected and stopping prevents pending transfers", async () => {
  const { local, remote, engine } = fixture();
  const gate = Promise.withResolvers<Map<string, string>>();
  local.snapshot = () => gate.promise;
  const scan = engine.tick();
  await rejects(engine.tick(), /already running/);
  engine.stop(); gate.resolve(new Map([["a.ts", "content"]]));
  await scan; expect(remote.writes).toBe(0);
});

test("failed writes do not advance the persisted baseline", async () => {
  const { local, remote, state, engine } = fixture();
  local.files.set("a.ts", "base"); remote.files.set("a.ts", "base");
  await engine.tick(); await engine.tick(); const baseline = state.baseline.get("a.ts");
  local.files.set("a.ts", "new"); await engine.tick();
  remote.write = async () => { throw new Error("timeout"); };
  await rejects(engine.tick(), /timeout/);
  expect(state.baseline.get("a.ts")).toBe(baseline);
});

test("real local storage preserves text, locks the root, and rejects escaping paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "bun-burner-sync-"));
  const outside = await mkdtemp(join(tmpdir(), "bun-burner-outside-"));
  try {
    const local = await LocalFiles.create(root, "home");
    const release = await local.lock();
    await rejects(local.lock());
    await release();
    const content = '\ufeffconst x: string = "😀";\r\n';
    await local.write("nested/a.ts", content);
    expect(await local.read("nested/a.ts")).toBe(content);
    const state = new Map([["nested/a.ts", "a".repeat(64)]]);
    await local.save(state); expect(await local.load()).toEqual(state);
    await rejects(local.write("../escape.ts", "bad"));
    await symlink(outside, join(root, "escape"));
    await rejects(local.write("escape/a.ts", "bad"), /Symlinks/);
    await rejects(local.snapshot(), /Symlinks/);
    await rejects((await LocalFiles.create(root, "other")).load(), /different game server/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("filters and opt-in configuration keep source selection explicit", () => {
  for (const name of ["../a.ts", "/a.ts", "node_modules/a.ts", ".git/a.js", "foo/../../a.ts", "a.d.ts", "a.json"]) expect(allowed(name)).toBe(false);
  for (const name of ["a.ts", "lib/a.tsx", "a.jsx", "a.js"]) expect(allowed(name)).toBe(true);
  expect(readSyncOptions({})).toBeUndefined();
  expect(readSyncOptions({ BUN_BURNER_SYNC_ENABLED: "true" })).toEqual({ root: "./scripts", server: "home" });
  expect(readSyncOptions({ BUN_BURNER_SYNC_ENABLED: "true", BUN_BURNER_SYNC_ROOT: "/custom/scripts" })?.root).toBe("/custom/scripts");
  expect(() => readSyncOptions({ BUN_BURNER_SYNC_ENABLED: "yes" })).toThrow();
});

test("remote adapter sends source unchanged through the real typed RPC client", async () => {
  const game = new Map([["a.tsx", "const a = <div />;"]]);
  const sent: string[] = [];
  const rpc = new RpcClient({ send(message) {
    sent.push(message);
    const request = JSON.parse(message);
    let result: unknown;
    if (request.method === "getAllFiles") result = [...game].map(([filename, content]) => ({ filename, content }));
    else if (request.method === "getFileNames") result = [...game.keys()];
    else if (request.method === "getFile") result = game.get(request.params.filename);
    else if (request.method === "pushFile") { game.set(request.params.filename, request.params.content); result = "OK"; }
    else throw new Error("Unexpected method");
    queueMicrotask(() => rpc.handleMessage(JSON.stringify({ jsonrpc: "2.0", id: request.id, result })));
    return 1;
  } });
  const remote = new RemoteFiles(new BitburnerClient(rpc), "home");
  expect((await remote.snapshot()).get("a.tsx")).toBe(game.get("a.tsx"));
  await remote.write("new.ts", "const x: number = 1;\r\n");
  expect(await remote.read("new.ts")).toBe("const x: number = 1;\r\n");
  expect(await remote.read("missing.ts")).toBeUndefined();
  expect(sent.some((s) => JSON.parse(s).method === "deleteFile")).toBe(false);
});
