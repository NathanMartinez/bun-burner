import { runCommand, verify } from "./verify.ts";

const code = await verify();
process.exitCode = code === 0 ? await runCommand(["git", "push"]) : code;
