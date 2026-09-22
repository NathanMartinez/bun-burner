import { RpcClient, BitburnerClient, RemoteFiles, SyncEngine } from "bun-burner";
import type {
  RpcTransport, RemoteApi, RemoteCall, FileLocation, FileContent, FileMetadata,
  ServerInfo, SaveFile, FileStore, SyncState, SyncEvent, Snapshot,
} from "bun-burner/core";
const transport: RpcTransport = { send: () => {} };
const client = new BitburnerClient(new RpcClient(transport));
const files: FileStore = new RemoteFiles(client, "home");
const snapshot: Promise<Snapshot> = files.snapshot();
const names: Promise<RemoteApi["getFileNames"]["result"]> = client.call("getFileNames", { server: "home" });
// @ts-expect-error missing required server
client.call("getFileNames");
// @ts-expect-error unknown method
client.call("nonexistent");
export type Contracts = [RemoteCall, FileLocation, FileContent, FileMetadata, ServerInfo, SaveFile, SyncState, SyncEvent];
export { SyncEngine, snapshot, names };
