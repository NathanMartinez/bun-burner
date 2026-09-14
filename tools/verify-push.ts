import { runCommand, verify } from "./verification.ts";

const code = await verify();
process.exitCode = code === 0 ? await runCommand(["git", "push"]) : code;
