/** Format a sync failure without dumping an internal stack. The original error is not altered. */
export function syncFailureMessage(error: unknown, root: string): string {
  const record = error && typeof error === "object" ? error : {};
  const code = "code" in record && typeof record.code === "string" ? record.code : undefined;
  const path = "path" in record && typeof record.path === "string" ? ` Affected path: ${record.path}.` : "";
  let detail: string;
  switch (code) {
    case "ENOENT": detail = "The configured workspace or a required path no longer exists. Create or restore the directory, or correct BUN_BURNER_SYNC_ROOT."; break;
    case "EACCES":
    case "EPERM": detail = "The configured workspace cannot be accessed or written. Check permissions or BUN_BURNER_SYNC_ROOT."; break;
    case "ENOTDIR": detail = "The configured workspace path must be a directory. Check BUN_BURNER_SYNC_ROOT and its parent directories."; break;
    case "EEXIST": detail = "A required path already exists. If this is the workspace lock, check for another running instance before removing a stale lock."; break;
    default: detail = error instanceof Error ? error.message : String(error);
  }
  return `Sync paused for ${root}: ${detail}${code ? ` (${code})` : ""}${path} No remote deletion is inferred. After fixing the cause, restart Bun Burner and reconnect.`;
}
