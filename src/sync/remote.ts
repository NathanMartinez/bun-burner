import type { BitburnerClient } from "../bitburner/client.ts";
import type { FileStore, Snapshot } from "./engine.ts";
import { allowed } from "./local.ts";

/** Original-source Remote API adapter. It never calls deleteFile or executes scripts. */
export class RemoteFiles implements FileStore {
  constructor(private readonly api: BitburnerClient, private readonly server: string) {}
  async snapshot(): Promise<Snapshot> {
    const files: Snapshot = new Map();
    for (const file of await this.api.call("getAllFiles", { server: this.server })) {
      if (!allowed(file.filename)) continue;
      if (files.has(file.filename)) throw new Error(`Duplicate remote path: ${file.filename}`);
      files.set(file.filename, file.content);
    }
    return files;
  }
  async read(filename: string): Promise<string | undefined> {
    if (!allowed(filename)) throw new Error("Unsupported remote path");
    const files = await this.api.call("getFileNames", { server: this.server });
    if (!files.includes(filename)) return undefined;
    return this.api.call("getFile", { server: this.server, filename });
  }
  async write(filename: string, content: string): Promise<void> {
    if (!allowed(filename)) throw new Error("Unsupported remote path");
    await this.api.call("pushFile", { server: this.server, filename, content });
  }
}
