import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile, readdir, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createBunBurner } from "bun-burner";

async function until(check) {
  const deadline = Date.now() + 8000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Application fixture timed out");
    await delay(10);
  }
}
const defaults = await createBunBurner();
assert.equal((await defaults.status()).state, "stopped");
assert.equal((await defaults.status()).config.port, 12525);
assert.equal((await defaults.status()).config.sync, false);
await defaults.stop();
const root = await mkdtemp(join(tmpdir(), "bb-packed-app-"));
const probe = createServer();
await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const { port } = probe.address();
const app = await createBunBurner({ config: false, root, host: "127.0.0.1", port, sync: true, debug: false });
let socket;
try {
  assert.equal((await app.status()).state, "stopped");
  assert.deepEqual(await readdir(root), []);
  await assert.rejects(app.start(), { code: "EADDRINUSE" });
  await new Promise(resolve => probe.close(resolve));
  await Promise.all([app.start(), app.start()]);
  assert.equal((await app.status()).state, "running");
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "Bun Burner");
  assert.deepEqual(await readdir(root), []);
  const game = new Map([["download.ts", "export const downloaded = true;"]]);
  await writeFile(join(root, "upload.ts"), "export const uploaded = true;");
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  let requests = 0;
  let fail = false;
  socket.onmessage = ({ data }) => {
    requests++;
    const { id, method, params } = JSON.parse(String(data));
    let result;
    switch (method) {
      case "getAllFiles": result = [...game].map(([filename, content]) => ({ filename, content })); break;
      case "getFileNames": result = [...game.keys()]; break;
      case "getFile": result = game.get(params.filename); break;
      case "pushFile": game.set(params.filename, params.content); result = "OK"; break;
      default: throw new Error(`Unexpected method: ${method}`);
    }
    socket.send(JSON.stringify(fail ? { jsonrpc: "2.0", id, error: "fixture failure" } : { jsonrpc: "2.0", id, result }));
  };
  await until(() => game.has("upload.ts"));
  assert.equal(await readFile(join(root, "download.ts"), "utf8"), game.get("download.ts"));
  assert.equal((await app.status()).connections, 1);
  const second = new WebSocket(`ws://127.0.0.1:${port}`);
  const rejected = await new Promise(resolve => { second.onclose = event => resolve(event.code); });
  assert.equal(rejected, 1013);
  fail = true;
  await until(async () => (await app.status()).sync === "paused");
  const pausedRequests = requests;
  await delay(1100);
  assert.equal(requests, pausedRequests, "paused sync must not retry");
  await Promise.all([app.stop(), app.stop()]);
  assert.equal((await app.status()).state, "stopped");
  await assert.rejects(access(join(root, ".bun-burner", "lock")), { code: "ENOENT" });
  await app.start();
  await app.stop();
  console.log("Packed application: construction, bind failure/retry, two-way sync, exclusive owner, pause, lock release and restart passed.");
} finally {
  socket?.close();
  await app.stop();
  if (probe.listening) await new Promise(resolve => probe.close(resolve));
  await rm(root, { recursive: true, force: true });
}
