import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = mkdtempSync(join(tmpdir(), "bun-burner-consumer-"));
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("BUN_BURNER_"))),
  npm_config_cache: join(fixture, "npm-cache") };
function run(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, env, encoding: "utf8" });
}
// npm's lifecycle output precedes the JSON; silence it without skipping prepack.
const packArgs = ["pack", "--json", "--silent", "--pack-destination", fixture];
const dry = JSON.parse(run("npm", [...packArgs, "--dry-run"]));
assert(dry[0].files.every(({ path }) => path.startsWith("dist/") || ["package.json", "README.md", "LICENSE", "bunburner.config.jsonc"].includes(path)));
const packed = JSON.parse(run("npm", packArgs));
cpSync(join(root, "tests/fixtures/node-consumer"), fixture, { recursive: true });
console.log(run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(fixture, packed[0].filename)], fixture));
const manifest = JSON.parse(readFileSync(join(fixture, "node_modules/bun-burner/package.json")));
assert.deepEqual(Object.keys(manifest.dependencies).sort(), ["jsonc-parser", "ws"]);
assert.equal(manifest.bin["bun-burner"], "./dist/index.js");
assert.equal(manifest.peerDependencies, undefined);
// Audit emitted runtime and declaration graphs: /core must never import a host or dependency.
const checked = new Set();
function checkCore(path) {
  if (checked.has(path)) return;
  checked.add(path);
  const source = readFileSync(path, "utf8");
  assert(!/\bBun\b|bun:|node:/.test(source), `Runtime-specific reference in ${path}`);
  for (const [, specifier] of source.matchAll(/(?:from\s*|import\s*\(?\s*)["']([^"']+)["']/g)) {
    assert(specifier.startsWith("."), `External core dependency: ${specifier}`);
    const target = fileURLToPath(new URL(specifier, pathToFileURL(path)));
    checkCore(path.endsWith(".d.ts") ? target.replace(/\.(?:ts|js)$/, ".d.ts") : target);
  }
}
for (const name of ["core.js", "core.d.ts"]) checkCore(join(fixture, "node_modules/bun-burner/dist", name));
console.log(run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", join(fixture, "tsconfig.json")]));
// Check the actual local bin link through npm exec; never fetch a registry bun-burner.
assert(run("npm", ["exec", "--offline", "--", "bun-burner", "--help"], fixture).includes("Usage:"));
if (process.argv.includes("--bun")) {
  for (const flags of [[], ["--bun"]]) {
    assert(run("bun", ["x", ...flags, "--no-install", "bun-burner", "--help"], fixture).includes("Usage:"));
  }
  console.log(run("bun", ["cli-smoke.mjs"], fixture));
}
// Only system Node/npm are on PATH; no repository or Bun dependencies in the fixture.
env.PATH = "/usr/bin:/bin";
delete env.NODE_PATH;
delete env.NODE_OPTIONS;
for (const check of ["smoke.mjs", "app-smoke.mjs", "cli-smoke.mjs"]) {
  console.log(run(process.execPath, [check], fixture));
}
if (process.argv.includes("--isolate")) {
  // Linux-only stronger proof: expose system Node and this fixture, with no host home or Bun.
  for (const check of ["smoke.mjs", "app-smoke.mjs", "cli-smoke.mjs"]) console.log(run("bwrap", [
    "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib64", "/lib64",
    "--symlink", "usr/lib", "/lib", "--proc", "/proc", "--dev", "/dev",
    "--tmpfs", "/tmp", "--ro-bind", fixture, "/consumer", "--chdir", "/consumer",
    "--clearenv", "--setenv", "PATH", "/usr/bin:/bin", "/usr/bin/node", check,
  ], fixture));
}
console.log(`Package dry run: ${dry[0].files.length} files. Isolated consumer and tarball retained at ${fixture}`);
