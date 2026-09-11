import { createHash } from "node:crypto";

/** A complete snapshot of selected source files. Absence must not mean read failure. */
export type Snapshot = Map<string, string>;
/** File operations used by the reconciler. Implementations must enforce path boundaries. */
export interface FileStore {
  snapshot(): Promise<Snapshot>;
  read(filename: string): Promise<string | undefined>;
  write(filename: string, content: string): Promise<void>;
}
/** Persistent state and observed-version recovery storage, owned by the local workspace. */
export interface SyncState {
  load(): Promise<Map<string, string>>;
  save(baseline: Map<string, string>): Promise<void>;
  backup(filename: string, side: "local" | "game", content: string): Promise<void>;
}
export interface SyncEvent { kind: "upload" | "download" | "conflict"; filename: string }
export function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Serial, content-based two-way reconciliation. Never propagates deletions.
 * Rechecks reduce stale writes but cannot provide atomic cross-process/game writes.
 * Errors stop a pass; callers must pause rather than blindly retry a failed write.
 */
export class SyncEngine {
  private baseline?: Map<string, string>;
  private previousLocal = new Map<string, string>();
  private conflicts = new Map<string, string>();
  private busy = false;
  private stopped = false;

  constructor(
    private readonly local: FileStore,
    private readonly remote: FileStore,
    private readonly state: SyncState,
    private readonly report: (event: SyncEvent) => void = () => {},
  ) {}

  /** Cancel subsequent transfers. An already-sent remote write cannot be cancelled. */
  stop(): void { this.stopped = true; }

  /** Run one scan; local content must be unchanged across two scans before transfer. */
  async tick(): Promise<void> {
    if (this.busy) throw new Error("A synchronization scan is already running");
    if (this.stopped) return;
    this.busy = true;
    try {
      this.baseline ??= await this.state.load();
      const local = await this.local.snapshot();
      const remote = await this.remote.snapshot();
      const current = new Map([...local].map(([name, content]) => [name, hash(content)]));
      const previous = this.previousLocal;
      this.previousLocal = current;
      const names = new Set([...local.keys(), ...remote.keys(), ...this.baseline.keys()]);
      for (const filename of [...names].sort()) {
        if (this.stopped) return;
        const left = local.get(filename), right = remote.get(filename);
        const lh = left === undefined ? undefined : hash(left);
        const rh = right === undefined ? undefined : hash(right);
        const base = this.baseline.get(filename);
        if (lh !== previous.get(filename)) continue;
        if (lh === rh) {
          if (lh !== undefined) this.baseline.set(filename, lh);
          else this.baseline.delete(filename);
          this.conflicts.delete(filename);
          continue;
        }
        let direction: "upload" | "download" | undefined;
        if (base === undefined) {
          if (left === undefined) direction = "download";
          else if (right === undefined) direction = "upload";
        } else if (left !== undefined && right !== undefined) {
          if (rh === base) direction = "upload";
          else if (lh === base) direction = "download";
        }
        if (!direction) {
          const signature = `${lh}:${rh}`;
          if (this.conflicts.get(filename) !== signature) {
            if (left !== undefined) await this.state.backup(filename, "local", left);
            if (right !== undefined) await this.state.backup(filename, "game", right);
            this.conflicts.set(filename, signature);
            this.report({ kind: "conflict", filename });
          }
          continue;
        }
        // Observe both versions again immediately before deciding to overwrite.
        if (await this.local.read(filename) !== left || await this.remote.read(filename) !== right) continue;
        if (left !== undefined) await this.state.backup(filename, "local", left);
        if (right !== undefined) await this.state.backup(filename, "game", right);
        if (this.stopped) return;
        const content = direction === "upload" ? left! : right!;
        const target = direction === "upload" ? this.remote : this.local;
        await target.write(filename, content);
        if (await target.read(filename) !== content) {
          throw new Error(`Sync verification failed for ${filename}; synchronization paused`);
        }
        this.baseline.set(filename, hash(content));
        await this.state.save(this.baseline);
        this.conflicts.delete(filename);
        this.report({ kind: direction, filename });
      }
      await this.state.save(this.baseline);
    } finally { this.busy = false; }
  }
}
