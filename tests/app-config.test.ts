import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "../src/app/config.ts";
import { parseCli } from "../src/cli.ts";

async function fixture(check: (cwd: string) => Promise<void>) {
  const cwd = await mkdtemp(join(tmpdir(), "bb-config-"));
  try { await check(cwd); } finally { await rm(cwd, { recursive: true, force: true }); }
}

test("config defaults, programmatic options and absolute root normalization", () => fixture(async cwd => {
  expect(await resolveConfig({}, { cwd, env: {} })).toEqual({
    root: join(cwd, "scripts"), server: "home", host: "127.0.0.1", port: 12525, sync: false, debug: false,
  });
  expect(await resolveConfig({ root: "./other", server: "n00dles", host: "::1", port: 13337, sync: true, debug: true }, { cwd, env: {} }))
    .toEqual({ root: join(cwd, "other"), server: "n00dles", host: "::1", port: 13337, sync: true, debug: true });
}));

test("JSONC supports comments, trailing commas and strings containing comment markers", () => fixture(async cwd => {
  await writeFile(join(cwd, "bunburner.config.jsonc"), '{ // comment\n "port": 13337, /* block */ "server": "a//b", }');
  expect((await resolveConfig({}, { cwd, env: {} })).port).toBe(13337);
  expect((await resolveConfig({}, { cwd, env: {} })).server).toBe("a//b");
  expect((await resolveConfig({ config: false }, { cwd, env: {} })).port).toBe(12525);
}));

test("each configuration layer overrides the previous layer; explicit options win", () => fixture(async cwd => {
  const file = join(cwd, "custom.jsonc");
  await writeFile(file, '{"port":12526,"sync":true,"root":"file-root"}');
  const base = { cwd, env: {} };
  expect((await resolveConfig({ config: file }, base)).port).toBe(12526);
  await writeFile(join(cwd, ".env"), 'BUN_BURNER_PORT=12527\nBUN_BURNER_DEBUG=true\n');
  expect((await resolveConfig({ config: file }, base)).port).toBe(12527);
  const context = { cwd, env: { BUN_BURNER_PORT: "12528", BUN_BURNER_SYNC_ENABLED: "false" } };
  expect((await resolveConfig({ config: file }, context)).port).toBe(12528);
  const { options } = parseCli(["--port", "12529", "--root", "cli-root", "--sync", "--no-debug"]);
  const config = await resolveConfig({ config: file }, { ...context, cli: options });
  expect(config).toMatchObject({ port: 12529, root: join(cwd, "cli-root"), sync: true, debug: false });
  expect((await resolveConfig({ config: file, port: 12530, sync: false }, { ...context, cli: options })))
    .toMatchObject({ port: 12530, sync: false });
  // Validation applies to the effective values, so a valid higher-priority value wins.
  expect((await resolveConfig({ port: 12530 }, { cwd, env: { BUN_BURNER_PORT: "bad" } })).port).toBe(12530);
}));

test("invalid ports, hosts, booleans, paths and unknown options reject", () => fixture(async cwd => {
  for (const port of [0, -1, 65536, 1.5, NaN, "12525", null]) {
    await expect(resolveConfig({ port } as never, { cwd, env: {} })).rejects.toThrow("port");
  }
  for (const host of ["", " ", "ws://localhost", "localhost/path", "localhost:12525", "bad_host", "-host", "a..b"]) {
    await expect(resolveConfig({ host }, { cwd, env: {} })).rejects.toThrow("host");
  }
  for (const env of [{ BUN_BURNER_SYNC_ENABLED: "yes" }, { BUN_BURNER_DEBUG: "1" }, { BUN_BURNER_PORT: "1e3" }]) {
    await expect(resolveConfig({}, { cwd, env })).rejects.toThrow();
  }
  for (const options of [{ root: "" }, { server: "" }, { root: "a\0b" }, { sync: "false" }, { debug: null }, { typo: true }]) {
    await expect(resolveConfig(options as never, { cwd, env: {} })).rejects.toThrow();
  }
}));

test("explicit missing/unreadable config paths and malformed JSONC fail; absent default is optional", () => fixture(async cwd => {
  await expect(resolveConfig({ config: "missing.jsonc" }, { cwd, env: {} })).rejects.toThrow("Cannot read configuration");
  await expect(resolveConfig({ config: "" }, { cwd, env: {} })).rejects.toThrow("config");
  await mkdir(join(cwd, "directory"));
  await expect(resolveConfig({ config: "directory" }, { cwd, env: {} })).rejects.toThrow();
  for (const source of ['{"port":}', '{"host":"abc}', '{/* unfinished', '[]', '{"hostname":"localhost"}']) {
    await writeFile(join(cwd, "bunburner.config.jsonc"), source);
    await expect(resolveConfig({}, { cwd, env: {} })).rejects.toThrow();
  }
}));

test("CLI maps every flag, rejects unknown inputs, and supports help/version without configuration", () => {
  expect(parseCli(["--root", "src", "--server", "home", "--host", "localhost", "--port", "12526", "--config", "x.jsonc", "--debug", "--sync"]).options)
    .toEqual({ root: "src", server: "home", host: "localhost", port: 12526, config: "x.jsonc", debug: true, sync: true });
  expect(parseCli(["-h"]).help).toBe(true);
  expect(parseCli(["-v"]).version).toBe(true);
  expect(() => parseCli(["--unknown"])).toThrow();
  expect(() => parseCli(["--port"])).toThrow();
  expect(() => parseCli(["--sync", "--no-sync"])).toThrow();
  expect(() => parseCli(["extra"])).toThrow();
});
