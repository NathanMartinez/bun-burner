import { constants } from "node:fs";
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const help = `Bun Burner synchronizes original JavaScript, TypeScript, JSX and TSX
source between a local folder and Bitburner without compiling it.

Usage: bun run init [--help | -h]

init copies .env.example to .env in the repository only when .env is absent.
Existing configuration is never overwritten. Sync is disabled by default.

Configuration: .env

Next steps:
1. Review .env and choose your sync root.
2. Set BUN_BURNER_SYNC_ENABLED=true when ready.
3. Run: bun run start
4. In Bitburner, connect the Remote API to ws://127.0.0.1:12525
   (the default address; use your configured host/port if changed).`;

function parseArgs(args: string[]): { help: boolean } {
  const options = { help: false };
  for (const arg of args) {
    switch (arg) {
      case "--help": case "-h": options.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}. Use bun run init --help.`);
    }
  }
  return options;
}

async function main(args: string[]): Promise<void> {
  if (parseArgs(args).help) { console.log(help); return; }
  const root = fileURLToPath(new URL("..", import.meta.url));
  try {
    // Exclusive copy avoids a check-then-write race with another initializer.
    await copyFile(join(root, ".env.example"), join(root, ".env"), constants.COPYFILE_EXCL);
    console.log("Bun Burner initialized.");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    console.log("Existing .env preserved.");
  }
  console.log(`
Configuration:
.env

Next steps:
1. Review .env and choose your sync root.
2. Set BUN_BURNER_SYNC_ENABLED=true when ready.
3. Run: bun run start
4. In Bitburner, connect the Remote API to ws://127.0.0.1:12525
   (the default address; use your configured host/port if changed).`);
}

if (import.meta.main) {
  try { await main(Bun.argv.slice(2)); }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
