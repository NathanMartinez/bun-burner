/** JavaScript uses the same Netscript declarations through JSDoc. */
/** @param {import("@ns").NS} ns */
export function main(ns) {
  ns.tprint(ns.getHostname());
}
