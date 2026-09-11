import type { NS } from "@ns";

/** Type-checking example; not automatically uploaded or run. */
export function main(ns: NS): void {
  ns.tprint(ns.getHostname());
}

// Compile-time boundary checks; never executed or deployed.
function gameTypeChecks(ns: NS): void {
  // @ts-expect-error Netscript method names are checked.
  ns.notARealMethod();
  // @ts-expect-error The Bun host API must not leak into game scripts.
  Bun.serve({});
  // @ts-expect-error Node process globals are not game globals.
  process.cwd();
}
