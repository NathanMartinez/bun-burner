import { RpcClient, BitburnerClient, RemoteFiles, SyncEngine } from "bun-burner/core";
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

import { createBunBurner } from "bun-burner";
import type { BunBurnerApplication, BunBurnerStatus, BunBurnerConfig, BunBurnerOptions } from "bun-burner";
const options: BunBurnerOptions = { root: "./src", sync: false };
const app: BunBurnerApplication = await createBunBurner(options);
const status: BunBurnerStatus = await app.status();
const config: Readonly<BunBurnerConfig> = status.config;
// @ts-expect-error configuration is immutable
config.port = 99;
// @ts-expect-error invalid option type
createBunBurner({ port: "12525" });
export { app, config };
