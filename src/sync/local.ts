import { lstat, mkdir, readdir, readFile, writeFile, rename, unlink, open, realpath } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { hash, type FileStore, type SyncState, type Snapshot } from "./engine.ts";

import { allowed, ignored } from "./paths.ts";
export { allowed } from "./paths.ts";

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Source workspace plus private state. Static symlinks are rejected, never followed. */
export class LocalFiles implements FileStore, SyncState {
  private constructor(private readonly root: string, private readonly server: string) {}
  private get stateDir(): string { return join(this.root, ".bun-burner"); }

  /** The root must already exist. Use a dedicated source workspace, not the connector repo. */
  static async create(root: string, server: string): Promise<LocalFiles> {
    const path = await realpath(resolve(root));
    if (!(await lstat(path)).isDirectory()) throw Object.assign(new Error("Sync root must be a directory"), { code: "ENOTDIR", path });
    const local = new LocalFiles(path, server);
    try { await mkdir(local.stateDir); }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
    if ((await lstat(local.stateDir)).isSymbolicLink()) throw new Error("Sync state must not be a symlink");
    return local;
  }

  /** Hold one workspace lock across a connection; stale locks require manual inspection. */
  async lock(): Promise<() => Promise<void>> {
    const path = join(this.stateDir, "lock");
    const file = await open(path, "wx");
    try { await file.writeFile(String(process.pid)); } finally { await file.close(); }
    return async () => {
      try { await unlink(path); }
      catch (error) { if (!missing(error)) throw error; }
    };
  }

  private async requireRoot(): Promise<void> {
    if (!(await lstat(this.root)).isDirectory()) {
      throw Object.assign(new Error("Sync root must remain a directory"), { code: "ENOTDIR", path: this.root });
    }
  }

  private async path(filename: string): Promise<string> {
    await this.requireRoot();
    if (!allowed(filename)) throw new Error(`Unsafe or unsupported sync path: ${filename}`);
    let current = this.root;
    for (const part of filename.split("/")) {
      current = join(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlinks are not synchronized: ${filename}`);
      } catch (error) { if (!missing(error)) throw error; }
    }
    return current;
  }

  /** Read strict UTF-8 source, preserving its BOM; only a missing file returns undefined. */
  async read(filename: string): Promise<string | undefined> {
    const path = await this.path(filename);
    try {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await readFile(path));
    } catch (error) { if (missing(error)) return undefined; throw error; }
  }

  /** Scan supported source files; reject symlinks and read failures instead of returning a partial snapshot. */
  async snapshot(): Promise<Snapshot> {
    const files: Snapshot = new Map();
    const walk = async (directory: string, prefix = "") => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || ignored.has(entry.name)) continue;
        const name = prefix + entry.name;
        if (entry.isSymbolicLink()) throw new Error(`Symlinks are not synchronized: ${name}`);
        if (entry.isDirectory()) await walk(join(directory, entry.name), name + "/");
        else if (entry.isFile() && allowed(name)) {
          const content = await this.read(name);
          if (content === undefined) throw new Error(`File changed during scan: ${name}`);
          files.set(name, content);
        }
      }
    };
    await walk(this.root);
    return files;
  }

  /** Replace a supported file through a temporary file and rename, preserving source text. */
  async write(filename: string, content: string): Promise<void> {
    const path = await this.path(filename);
    // Create descendants only; never recreate a vanished configured root.
    let parent = this.root;
    for (const part of filename.split("/").slice(0, -1)) {
      parent = join(parent, part);
      try { await mkdir(parent); }
      catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      }
    }
    await this.path(filename);
    await this.atomic(path, content);
  }

  private async atomic(path: string, content: string): Promise<void> {
    const temp = join(dirname(path), `.bun-burner-${randomUUID()}.tmp`);
    try { await writeFile(temp, content, { flag: "wx" }); await rename(temp, path); }
    finally { await unlink(temp).catch((error: unknown) => { if (!missing(error)) throw error; }); }
  }

  /** Load and validate this server's baseline; missing state starts a fresh workspace. */
  async load(): Promise<Map<string, string>> {
    const path = join(this.stateDir, "state.json");
    let raw: string;
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new Error("State file must not be a symlink");
      raw = await readFile(path, "utf8");
    } catch (error) { if (missing(error)) return new Map(); throw error; }
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 ||
        !("server" in value) || value.server !== this.server || !("files" in value) || !Array.isArray(value.files)) {
      throw new Error("Invalid sync state or different game server; synchronization paused");
    }
    const result = new Map<string, string>();
    for (const item of value.files) {
      if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string" || !allowed(item[0]) ||
          typeof item[1] !== "string" || !/^[a-f0-9]{64}$/.test(item[1]) || result.has(item[0])) throw new Error("Invalid sync baseline");
      result.set(item[0], item[1]);
    }
    return result;
  }

  /** Atomically replace the persisted filename-to-content-hash baseline. */
  async save(baseline: Map<string, string>): Promise<void> {
    await this.atomic(join(this.stateDir, "state.json"), JSON.stringify({ version: 1, server: this.server, files: [...baseline] }));
  }

  /** Save a content-addressed recovery copy; repeated copies of the same version are retained once. */
  async backup(filename: string, side: "local" | "game", content: string): Promise<void> {
    // Flat, content-addressed recovery files avoid trusting remote paths.
    const path = join(this.stateDir, `${await hash(filename)}-${side}-${await hash(content)}.json`);
    try { await writeFile(path, JSON.stringify({ filename, side, content }), { flag: "wx" }); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
  }
}
