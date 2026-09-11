import { RpcClient } from "../rpc/client.ts";

export interface FileLocation { server: string; filename: string }
export interface FileMetadata { filename: string; atime: number; btime: number; mtime: number }

// Bitburner v3.0.1: src/RemoteFileAPI/MessageDefinitions.ts and MessageHandlers.ts.
// Expand this map as additional operations are implemented and validated.
export interface RemoteApi {
  getFileNames: { params: { server: string }; result: string[] };
  getFile: { params: FileLocation; result: string };
  getFileMetadata: { params: FileLocation; result: FileMetadata };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const parsers: { [M in keyof RemoteApi]: (value: unknown) => RemoteApi[M]["result"] } = {
  getFileNames(value) {
    if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === "string")) {
      throw new Error("Invalid getFileNames result");
    }
    return value;
  },
  getFile(value) {
    if (typeof value !== "string") throw new Error("Invalid getFile result");
    return value;
  },
  getFileMetadata(value) {
    if (!record(value) || typeof value.filename !== "string" ||
        typeof value.atime !== "number" || !Number.isFinite(value.atime) ||
        typeof value.btime !== "number" || !Number.isFinite(value.btime) ||
        typeof value.mtime !== "number" || !Number.isFinite(value.mtime)) {
      throw new Error("Invalid getFileMetadata result");
    }
    return { filename: value.filename, atime: value.atime, btime: value.btime, mtime: value.mtime };
  },
};

export class BitburnerClient {
  constructor(private readonly rpc: RpcClient) {}

  async call<M extends keyof RemoteApi>(
    method: M,
    params: RemoteApi[M]["params"],
  ): Promise<RemoteApi[M]["result"]> {
    return parsers[method](await this.rpc.call(method, params));
  }
}
