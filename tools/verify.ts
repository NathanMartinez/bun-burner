import { verify } from "./verification.ts";

process.exitCode = await verify();
