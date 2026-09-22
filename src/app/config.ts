import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isIP } from "node:net";
import { parseEnv } from "node:util";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";

export interface BunBurnerConfig {
  /** Absolute local path, resolved from the working directory at construction. */
  root: string;
  server: string;
  host: string;
  port: number;
  sync: boolean;
  debug: boolean;
}

export interface BunBurnerOptions extends Partial<BunBurnerConfig> {
  /** Default: bunburner.config.jsonc in cwd. False disables JSONC discovery. */
  config?: string | false;
}

const defaults: BunBurnerConfig = {
  root: "./scripts", server: "home", host: "127.0.0.1", port: 12525, sync: false, debug: false,
};
const envKeys = {
  root: "BUN_BURNER_SYNC_ROOT", server: "BUN_BURNER_SYNC_SERVER",
  host: "BUN_BURNER_HOST", port: "BUN_BURNER_PORT",
  sync: "BUN_BURNER_SYNC_ENABLED", debug: "BUN_BURNER_DEBUG",
} as const;

async function readOptional(path: string, required = false): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    if (!required && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Cannot read configuration ${path}: ${(error as Error).message}`, { cause: error });
  }
}

function objectOptions(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(defaults, key)) throw new Error(`Unknown ${label} option: ${key}`);
  }
  return Object.fromEntries(Object.entries(value).filter(([, value]) => value !== undefined));
}

/** Internal resolution inputs make precedence testable without mutating process.env. */
export async function resolveConfig(options: BunBurnerOptions = {}, context: {
  cwd?: string;
  env?: Record<string, string | undefined>;
  cli?: Partial<BunBurnerConfig>;
} = {}): Promise<Readonly<BunBurnerConfig>> {
  const cwd = context.cwd ?? process.cwd();
  const { config, ...explicit } = options;
  if (config !== undefined && config !== false && (typeof config !== "string" || !config.trim())) {
    throw new Error("config must be a nonempty path or false");
  }
  let file: Record<string, unknown> = {};
  if (config !== false) {
    const path = resolve(cwd, config ?? "bunburner.config.jsonc");
    const source = await readOptional(path, config !== undefined);
    if (source !== undefined) {
      const errors: ParseError[] = [];
      const value: unknown = parse(source, errors, { allowTrailingComma: true });
      if (errors.length) throw new Error(`Invalid JSONC configuration ${path}: ${printParseErrorCode(errors[0]!.error)} at offset ${errors[0]!.offset}`);
      file = objectOptions(value, "config file");
    }
  }
  const dotenv = await readOptional(resolve(cwd, ".env"));
  const environment = { ...(dotenv === undefined ? {} : parseEnv(dotenv)),
    ...Object.fromEntries(Object.entries(context.env ?? process.env).filter(([, value]) => value !== undefined)) };
  const env: Record<string, unknown> = {};
  for (const [key, name] of Object.entries(envKeys)) {
    if (environment[name] !== undefined) {
      const value = environment[name]!;
      env[key] = key === "port" ? (/^\d+$/.test(value) ? Number(value) : value)
        : key === "sync" || key === "debug" ? (value === "true" ? true : value === "false" ? false : value)
        : value;
    }
  }
  const merged = { ...defaults, ...file, ...env,
    ...objectOptions(context.cli ?? {}, "CLI"), ...objectOptions(explicit, "programmatic") };
  if (typeof merged.port !== "number" || !Number.isInteger(merged.port) || merged.port < 1 || merged.port > 65535) {
    throw new Error("port (BUN_BURNER_PORT) must be an integer from 1 to 65535");
  }
  if (typeof merged.host !== "string" || (!isIP(merged.host) &&
      !(merged.host.length <= 253 && merged.host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))))) {
    throw new Error("host (BUN_BURNER_HOST) must be a hostname or IP address without a URL scheme or port");
  }
  for (const key of ["root", "server"] as const) {
    if (typeof merged[key] !== "string" || !merged[key].trim() || merged[key].includes("\0")) throw new Error(`${key} must be a nonempty string without NUL`);
  }
  for (const key of ["sync", "debug"] as const) {
    if (typeof merged[key] !== "boolean") throw new Error(`${key} (${envKeys[key]}) must be true or false`);
  }
  return Object.freeze({ ...merged, root: resolve(cwd, merged.root) });
}
