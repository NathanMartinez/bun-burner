import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = mkdtempSync(join(tmpdir(), "bun-burner-consumer-"));
const env = { ...process.env, npm_config_cache: join(fixture, "npm-cache") };
function run(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, env, encoding: "utf8" });
}
// npm's lifecycle output precedes the JSON; silence it without skipping prepack.
const packArgs = ["pack", "--json", "--silent", "--pack-destination", fixture];
const dry = JSON.parse(run("npm", [...packArgs, "--dry-run"]));
assert(dry[0].files.every(({ path }) => path.startsWith("dist/") || ["package.json", "README.md", "LICENSE"].includes(path)));
const packed = JSON.parse(run("npm", packArgs));
cpSync(join(root, "tests/fixtures/node-consumer"), fixture, { recursive: true });
console.log(run("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", join(fixture, packed[0].filename)], fixture));
const manifest = JSON.parse(readFileSync(join(fixture, "node_modules/bun-burner/package.json")));
assert.equal(manifest.dependencies, undefined);
assert.equal(manifest.peerDependencies, undefined);
console.log(run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", join(fixture, "tsconfig.json")]));
// Only system Node/npm are on PATH; no repository or Bun dependencies in the fixture.
env.PATH = "/usr/bin:/bin";
delete env.NODE_PATH;
delete env.NODE_OPTIONS;
console.log(run(process.execPath, ["smoke.mjs"], fixture));
if (process.argv.includes("--isolate")) {
  // Linux-only stronger proof: expose system Node and this fixture, with no host home or Bun.
  console.log(run("bwrap", [
    "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib64", "/lib64",
    "--symlink", "usr/lib", "/lib", "--proc", "/proc", "--dev", "/dev",
    "--tmpfs", "/tmp", "--ro-bind", fixture, "/consumer", "--chdir", "/consumer",
    "--clearenv", "--setenv", "PATH", "/usr/bin:/bin", "/usr/bin/node", "smoke.mjs",
  ], fixture));
}
console.log(`Package dry run: ${dry[0].files.length} files. Isolated consumer and tarball retained at ${fixture}`);
