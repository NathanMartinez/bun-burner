export const ignored = new Set(["node_modules", "dist", "out", "coverage"]);
/** Only source files with canonical relative paths may cross the workspace boundary. */
export function allowed(filename: string): boolean {
  const parts = filename.split("/");
  return !filename.includes("\\") && !filename.includes("\0") &&
    parts.every((part) => part !== "" && !part.startsWith(".") && !ignored.has(part)) &&
    /\.(?:js|ts|jsx|tsx)$/.test(filename) && !filename.endsWith(".d.ts");
}
