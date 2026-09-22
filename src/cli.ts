import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { createBunBurner } from "./app.ts";
import type { BunBurnerOptions } from "./app.ts";

export const help = `Bun Burner — source-preserving Bitburner synchronization
Usage: bun-burner [options]

  --root <path>     Existing sync directory (default: ./scripts)
  --server <name>   Game server (default: home)
  --host <host>     Listener hostname/IP (default: 127.0.0.1)
  --port <number>   Listener port (default: 12525)
  --config <path>   JSONC configuration (default: bunburner.config.jsonc)
  --sync           Enable sync; --no-sync disables it
  --debug          Print lifecycle configuration; --no-debug disables it
  --help, -h       Show this help
  --version, -v    Show package version

Precedence: defaults < JSONC < optional .env < environment < flags.
Relative paths resolve from the current working directory.
Sync is disabled by default; no game scripts are compiled or deleted.`;

export function parseCli(args: string[]): { options: BunBurnerOptions; help: boolean; version: boolean } {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false,
    options: {
      root: { type: "string" }, server: { type: "string" }, host: { type: "string" },
      port: { type: "string" }, config: { type: "string" },
      sync: { type: "boolean" }, "no-sync": { type: "boolean" },
      debug: { type: "boolean" }, "no-debug": { type: "boolean" },
      help: { type: "boolean", short: "h" }, version: { type: "boolean", short: "v" },
    },
  });
  const options: BunBurnerOptions = {};
  for (const key of ["root", "server", "host", "config"] as const) {
    if (values[key] !== undefined) options[key] = values[key];
  }
  if (values.port !== undefined) options.port = /^\d+$/.test(values.port) ? Number(values.port) : NaN;
  for (const key of ["sync", "debug"] as const) {
    if (values[key] && values[`no-${key}`]) throw new Error(`Use only one of --${key} and --no-${key}`);
    if (values[key] !== undefined || values[`no-${key}`] !== undefined) options[key] = !values[`no-${key}`];
  }
  return { options, help: values.help ?? false, version: values.version ?? false };
}

/** Process frontend only; application construction never reads argv or installs handlers. */
export async function main(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseCli(args);
  if (parsed.help) { console.log(help); return; }
  if (parsed.version) {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    console.log(manifest.version);
    return;
  }
  const app = await createBunBurner(parsed.options);
  const shutdown = () => {
    void app.stop().catch(error => { console.error("Shutdown failed:", error); process.exitCode = 1; })
      .finally(() => { process.removeListener("SIGINT", shutdown); process.removeListener("SIGTERM", shutdown); });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try { await app.start(); }
  catch (error) {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    throw error;
  }
}
