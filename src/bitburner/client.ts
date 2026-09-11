import type { RpcClient } from "../rpc/client.ts";
import type { RemoteApi, RemoteCall, FileMetadata } from "./types.ts";
export type { RemoteApi, RemoteCall, FileLocation, FileContent, FileMetadata, ServerInfo, SaveFile } from "./types.ts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a string");
  return value;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected a finite number");
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Expected a boolean");
  return value;
}
function array<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error("Expected an array");
  return value.map((item: unknown) => parse(item));
}
function metadata(value: unknown): FileMetadata {
  if (!record(value)) throw new Error("Expected file metadata");
  return { filename: text(value.filename), atime: number(value.atime), btime: number(value.btime), mtime: number(value.mtime) };
}
function ok(value: unknown): "OK" {
  if (value !== "OK") throw new Error("Expected OK acknowledgement");
  return value;
}

const parsers: { [M in keyof RemoteApi]: (value: unknown) => RemoteApi[M]["result"] } = {
  getFileNames: (value) => array(value, text),
  getFile: text,
  getFileMetadata: metadata,
  pushFile: ok,
  deleteFile: ok,
  getAllFiles: (value) => array(value, (item) => {
    if (!record(item)) throw new Error("Expected file content");
    return { filename: text(item.filename), content: text(item.content) };
  }),
  getAllFileMetadata: (value) => array(value, metadata),
  calculateRam: number,
  getDefinitionFile: text,
  getSaveFile(value) {
    if (!record(value)) throw new Error("Expected save data");
    return { identifier: text(value.identifier), binary: boolean(value.binary), save: text(value.save) };
  },
  getAllServers: (value) => array(value, (item) => {
    if (!record(item)) throw new Error("Expected server data");
    return { hostname: text(item.hostname), hasAdminRights: boolean(item.hasAdminRights), purchasedByPlayer: boolean(item.purchasedByPlayer) };
  }),
};

/** Typed, runtime-validated access to the complete Bitburner 3.0.1 Remote API. */
export class BitburnerClient {
  constructor(private readonly rpc: RpcClient) {}

  /**
   * Call a Remote API method and validate its successful response.
   * Rejects on transport, remote, or result-validation errors. Writes are not retried;
   * a timeout does not prove that a write was not applied.
   * @example await client.call("getFileNames", { server: "home" });
   * @example await client.call("getDefinitionFile");
   */
  async call<A extends RemoteCall>(...args: A): Promise<RemoteApi[A[0]]["result"]> {
    const [method, params] = args;
    const result = await this.rpc.call(method, params);
    try {
      return parsers[method](result);
    } catch (cause) {
      throw new Error(`Invalid ${method} result`, { cause });
    }
  }
}
