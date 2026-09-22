import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, writeFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { readFileSync } from "node:fs";

const bin = resolve("node_modules/bun-burner/dist/index.js");
const version = JSON.parse(readFileSync("node_modules/bun-burner/package.json", "utf8")).version;
const cwd = await mkdtemp(join(tmpdir(), "bb-packed-cli-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("BUN_BURNER_")));
for (const [flag, expected] of [["--help", "Usage:"], ["--version", version]]) {
  assert(execFileSync(process.execPath, [bin, flag, "--config", "missing.jsonc"], {
    cwd, env: { ...env, BUN_BURNER_PORT: "bad" }, encoding: "utf8",
  }).includes(expected));
}
const probe = createServer();
await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const { port } = probe.address();
await new Promise(resolve => probe.close(resolve));
await writeFile(join(cwd, "bunburner.config.jsonc"), '{ // config\n "port": 1, "sync": true, "root": "./missing" }');
const child = spawn(process.execPath, [bin, "--port", String(port), "--host", "127.0.0.1", "--no-sync"], {
  cwd, env: { ...env, BUN_BURNER_PORT: "2" }, stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "", stderr = "";
child.stdout.on("data", chunk => { stdout += chunk; });
child.stderr.on("data", chunk => { stderr += chunk; });
const exited = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
let socket;
try {
  const deadline = Date.now() + 5000;
  while (!stdout.includes("listening on")) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error(`CLI failed: ${stderr}`);
    await delay(10);
  }
  assert(stdout.includes(`:${port}`), "CLI flags must override environment and config");
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  let requests = 0;
  socket.onmessage = () => { requests++; };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  await delay(100);
  assert.equal(requests, 0);
  assert.deepEqual(await readdir(cwd), ["bunburner.config.jsonc"]);
  child.kill("SIGTERM");
  const result = await Promise.race([exited, delay(5000, undefined, { ref: false }).then(() => { throw new Error("CLI did not stop"); })]);
  assert.equal(result.code, 0);
  assert.equal(stderr, "");
  console.log(`Packed CLI (${process.versions.bun ? "Bun" : "Node"}): help, version, precedence, listener, no startup RPC, SIGTERM passed.`);
} finally {
  socket?.close();
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await exited;
  await rm(cwd, { recursive: true, force: true });
}
