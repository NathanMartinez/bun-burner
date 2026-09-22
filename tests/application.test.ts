import { test, expect } from "bun:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { createBunBurner } from "../src/app.ts";

async function reserve() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { port, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("BUN_BURNER_")));
}

test("factory without arguments uses defaults in a clean directory and does not mutate files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "bb-defaults-"));
  try {
    const result = Bun.spawnSync([process.execPath, "--eval", `
      const { createBunBurner } = await import(${JSON.stringify(new URL("../src/app.ts", import.meta.url).href)});
      const app = await createBunBurner();
      console.log(JSON.stringify(await app.status()));
      await app.stop();
    `], { cwd, env: cleanEnv() });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toEqual({ state: "stopped", connections: 0, sync: "disabled",
      config: { root: join(cwd, "scripts"), host: "127.0.0.1", server: "home", port: 12525, sync: false, debug: false } });
    expect(await readdir(cwd)).toEqual([]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("construction opens no listener even with sync enabled; failed start is retryable; lifecycle serializes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "bb-lifecycle-"));
  const reserved = await reserve();
  const app = await createBunBurner({ config: false, root: join(cwd, "missing"), host: "127.0.0.1", port: reserved.port, sync: true, debug: false });
  try {
    expect((await app.status()).state).toBe("stopped");
    expect(await readdir(cwd)).toEqual([]);
    await expect(app.start()).rejects.toThrow();
    expect((await app.status()).state).toBe("stopped");
    await reserved.close();
    await Promise.all([app.start(), app.start()]);
    expect((await app.status()).state).toBe("running");
    expect(await (await fetch(`http://127.0.0.1:${reserved.port}`)).text()).toBe("Bun Burner");
    // Starting the host alone must still defer workspace initialization.
    expect(await readdir(cwd)).toEqual([]);
    await Promise.all([app.stop(), app.stop(), app.start(), app.stop()]);
    expect(await app.status()).toMatchObject({ state: "stopped", connections: 0, sync: "idle" });
    const probe = createServer();
    await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(reserved.port, "127.0.0.1", resolve); });
    await new Promise<void>(resolve => probe.close(() => resolve()));
  } finally { await app.stop(); await rm(cwd, { recursive: true, force: true }); }
});

test("Bun CLI help and version bypass invalid environment and config; flags validate", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "bb-cli-"));
  const path = new URL("../src/index.ts", import.meta.url).pathname;
  try {
    for (const [flag, expected] of [["--help", "Usage:"], ["--version", "0.1.0-beta.1"]]) {
      const child = Bun.spawnSync([process.execPath, path, flag!, "--config", "missing.jsonc"], { cwd, env: { ...cleanEnv(), BUN_BURNER_PORT: "bad" } });
      expect(child.exitCode).toBe(0);
      expect(child.stdout.toString()).toContain(expected!);
    }
    const child = Bun.spawnSync([process.execPath, path, "--port", "bad"], { cwd, env: cleanEnv() });
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toContain("port");
    expect(await readdir(cwd)).toEqual([]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
