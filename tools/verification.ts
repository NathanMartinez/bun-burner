import { release } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Run an argument vector in the repository, inheriting terminal output. */
export async function runCommand(command: string[]): Promise<number> {
  console.log(`> ${command.join(" ")}`);
  return await Bun.spawn(command, { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exited;
}

/** Stop at the first failed check; print platform and Git context on success. */
export async function verify(): Promise<number> {
  for (const command of [
    ["git", "diff", "--check"],
    [process.execPath, "test"],
    [process.execPath, "run", "typecheck"],
    [process.execPath, "run", "typecheck:core"],
    [process.execPath, "run", "typecheck:game"],
  ]) {
    const code = await runCommand(command);
    if (code !== 0) return code;
  }
  console.log(`Verified on ${process.platform} ${process.arch} (${release()}), Bun ${Bun.version}`);
  const status = await runCommand(["git", "status", "--short"]);
  if (status !== 0) return status;
  return await runCommand(["git", "log", "--oneline", "--decorate", "-10"]);
}
