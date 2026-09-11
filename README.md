# bun-burner

A local Bun/TypeScript bridge that synchronizes original source files between an external editor and Bitburner through its Remote API.

**Current status:** the RPC foundation and all eleven typed Remote API methods are implemented. Opt-in two-way source synchronization is implemented on this development branch. Deletion propagation and manual transfer commands remain deferred.

## Run

Local checks use Bun 1.4.2 and TypeScript 7.0.2. The API targets Bitburner 3.0.1; live verification currently covers filename listing, not game-file synchronization.

```bash
bun install --frozen-lockfile
# Optional: copy the defaults, then edit .env if needed.
cp .env.example .env
bun run start
```

In Bitburner, open **Options → Remote API**, use hostname `127.0.0.1` and port `12525`, then connect using WebSocket (`ws`, not `wss`).

Bun loads `.env` automatically. `BUN_BURNER_HOST` defaults to `127.0.0.1` and `BUN_BURNER_PORT` to `12525`; no file is required for these defaults. `.env` is ignored by Git. On PowerShell, use `Copy-Item .env.example .env`. Restart after changes and match the game settings to the chosen port. Invalid settings fail at startup. TLS/WSS is not configured.

By default, the bridge listens on `ws://127.0.0.1:12525`. Each connection triggers one `getFileNames` request for `home` and prints the returned filenames. With sync disabled (the default), it does not write, delete, or execute game files. Enabling sync allows source uploads and local downloads; it never deletes or executes game files. Only run one bridge instance on this port; an address-in-use error usually means another instance is still running.

## Current functionality

- Opt-in two-way source create/update sync, preserving JS, TS, JSX, and TSX files.
- A configurable scripts directory, defaulting to `./scripts`, mapped to one game server.
- Sequential polling, persisted content hashes, conflict reporting, and recovery copies.
- A separate RPC client and pending-request map for each WebSocket connection.
- Numeric request IDs and promise-based responses, including out-of-order replies.
- A 30-second request timeout, send-failure handling, and pending-request rejection on disconnect.
- Support for Bitburner's string errors and standard JSON-RPC error objects.
- Response-envelope validation and UTF-8 decoding of binary frames. Invalid envelopes close the connection and reject outstanding requests.
- Unknown or late IDs in otherwise valid replies are ignored.
- A typed Bitburner API layer that validates successful results before returning them.

| Typed method | Parameters | Result |
| --- | --- | --- |
| `getFileNames` | `{ server: string }` | `string[]` |
| `getFile` | `{ server: string, filename: string }` | `string` |
| `getFileMetadata` | `{ server: string, filename: string }` | `{ filename: string, atime: number, btime: number, mtime: number }` |

The wrapper also exposes:

| Method | Parameters | Result |
| --- | --- | --- |
| `pushFile` | `{ server, filename, content }` (strings) | `"OK"` |
| `deleteFile` | `{ server, filename }` (strings) | `"OK"` |
| `getAllFiles` | `{ server: string }` | `{ filename: string, content: string }[]` |
| `getAllFileMetadata` | `{ server: string }` | `FileMetadata[]` |
| `calculateRam` | `{ server, filename }` (strings) | `number` |
| `getDefinitionFile` | None | `string` |
| `getSaveFile` | None | `{ identifier: string, binary: boolean, save: string }` |
| `getAllServers` | None | `{ hostname: string, hasAdminRights: boolean, purchasedByPlayer: boolean }[]` |

`pushFile` and `deleteFile` mutate game files when called. Enabled synchronization uses `pushFile` for uploads; the sync engine never calls `deleteFile`. Parameterless methods are called without a second argument, for example `await bitburner.call("getDefinitionFile")`.

The generic `RpcClient.call()` intentionally returns `Promise<unknown>`. Use `BitburnerClient.call()` for method-specific parameter checks, inferred result types, and runtime result validation. For example, with a connected `BitburnerClient` named `bitburner`:

```ts
const files = await bitburner.call("getFileNames", { server: "home" });
// files: string[]
```

The contract follows the [Bitburner 3.0.1 implementation](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/MessageDefinitions.ts) and [request handlers](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/MessageHandlers.ts). In that version, error payloads are strings and metadata timestamps are numbers. The wrapper also accepts numeric timestamp strings and normalizes them to finite numbers, preserving their units. Empty strings, date strings, booleans, and non-finite values are rejected.

## Structure

```text
src/
  index.ts             Bun server, connection lifecycle, frame decoding
  config.ts            Validated host and port settings
  sync/                Reconciliation, local storage, Remote API adapter, polling
  rpc/
    client.ts          Generic request lifecycle and response handling
    types.ts           Transport and pending-request contracts
  bitburner/
    client.ts          Typed calls and result validators
    types.ts           Documented Remote API contracts
tests/
  client.test.ts       RPC lifecycle tests
  bitburner.test.ts    API validation and type checks
  config.test.ts       Listener configuration checks
  sync.test.ts         Reconciliation, storage, and path checks
  sync-websocket.test.ts  End-to-end sync against a simulated game
scripts/               Optional default workspace; user files are Git-ignored
.env.example           Listener and sync configuration defaults
```

## Verify

```bash
bun run typecheck
bun test
```

The 24 tests cover response ordering, errors, disconnects, timeouts and late replies, send and serialization failures, malformed envelopes, all eleven result validators, and configuration. Compile-time checks reject unknown method names and missing required parameters.

A real local WebSocket test verifies uploads and downloads through the typed RPC layer using a simulated game and disposable directories. Sync also has tests for conflicts, missing files, restart baselines, stale reads, failed writes, locking, path guards, and source-text preservation. Live game synchronization has not been tested.

A live `getFileNames` round trip against Bitburner succeeded, including after reconnecting with the typed API layer. File contents, metadata, and remote-error recovery have been tested with simulated responses, not live game requests. The newly completed methods, including writes and save export, have only been tested with simulated responses. No live game writes were performed.

## Feature status

| Feature | Status |
| --- | --- |
| RPC lifecycle and all eleven typed Remote API methods | Implemented |
| Numeric or numeric-string metadata timestamp normalization | Implemented; callers receive numbers |
| Source-preserving two-way create/update synchronization | Implemented, opt-in |
| Dedicated default scripts folder and custom path configuration | Implemented |
| Local and remote polling | Implemented; sequential scans with a one-second delay |
| Persisted content-hash baseline, conflicts, recovery copies | Implemented |
| Workspace ownership and sequential transfers | Implemented |
| Source filters and static symlink/path guards | Implemented |
| Deletion/rename propagation | Deferred; missing tracked files are conflicts |
| Native filesystem watcher, custom ignore patterns, manual transfer CLI | Deferred |
| Dashboard, public API, editor plugins, WSS | Deferred |

## Enable file syncing

Copy `.env.example` to `.env` if you have not already. Sync is disabled by default. Set these values to enable it using the provided `scripts/` folder:

```dotenv
BUN_BURNER_SYNC_ENABLED=true
BUN_BURNER_SYNC_ROOT=./scripts
BUN_BURNER_SYNC_SERVER=home
```

For an existing external workspace, change only the root:

```dotenv
BUN_BURNER_SYNC_ROOT=/absolute/path/to/your/game-scripts
```

| Setting | Default | Purpose |
| --- | --- | --- |
| `BUN_BURNER_HOST` | `127.0.0.1` | Listener address |
| `BUN_BURNER_PORT` | `12525` | Listener port |
| `BUN_BURNER_SYNC_ENABLED` | `false` | Enable transfers with `true` |
| `BUN_BURNER_SYNC_ROOT` | `./scripts` | Existing local source directory |
| `BUN_BURNER_SYNC_SERVER` | `home` | Destination game server |
 Relative paths are resolved from the directory where you launch the app. The folder must exist. Its contents map directly to the selected game server: `lib/example.ts` becomes `lib/example.ts` on `home`; do not add a `home/` directory unless you want it in the game path.

Restart with `bun run start`, then reconnect Bitburner. The default `scripts/` folder is separate from connector code, and its contents are ignored by this repository's Git rules. `.gitkeep` only ensures the empty folder is included in a clone.

The first connection copies files present on only one side. Different existing files on both sides are conflicts, with no automatic winner. Selected `.js`, `.ts`, `.jsx`, and `.tsx` files retain source text, extensions, and line endings. Hidden paths, `node_modules`, `dist`, `out`, `coverage`, and `.d.ts` files are excluded. Static symlinks are rejected. This is not a sandbox against a hostile process changing filesystem paths during a transfer.

Local content must be unchanged across two scans before an upload. The engine compares content hashes, not metadata timestamps; metadata coercion therefore cannot decide which file wins. Transfers run sequentially, recheck both sides, retain observed versions, and verify the destination before saving a baseline. Polling fetches all script/text content from the game server via `getAllFiles` and then filters the supported paths locally, so this initial implementation is intended for modest script workspaces, not large telemetry archives.

State and recovery copies live in `<scripts-root>/.bun-burner/`. Add that directory to your scripts repository's `.gitignore`. Recovery JSON files retain the original `filename`, `side`, and `content`. When `[sync:conflict]` appears, compare both files and the recovery copies, then make both sides match your chosen content. A later scan recognizes agreement. Tracked files missing from only one side stay conflicted; no automatic deletion or restoration occurs.

A scan/transfer error pauses sync while leaving the connection open. Fix the cause and manually disconnect/reconnect to resume. Do not delete the state directory to resolve a conflict: doing so removes the common baseline. One sync connection/process may own a workspace at a time. Normal shutdown releases its lock; after a crash, inspect `<scripts-root>/.bun-burner/lock` and confirm the recorded process is no longer running before removing the stale lock.

The baseline is bound to the selected server name, but the Remote API does not give this workflow an authenticated save identity. Use separate script roots for different game saves and do not connect another save to an existing workspace without reviewing both sides.

## Intended scope

The first synchronization target is an editor-independent local connector. Saving a selected file in an external editor should update its game counterpart; a saved game-side edit should return to the local file. The connector observes saved files, not unsaved editor buffers.

### Preserve original source

Transfer `.js`, `.ts`, `.jsx`, and `.tsx` files with their original names and source text in both directions. For example, with `BUN_BURNER_SYNC_ROOT=./scripts` and server `home`, local `scripts/dashboard.tsx` maps to `dashboard.tsx` on `home`, without producing a `.js` counterpart. The folder mapping is configured as described above.

Bitburner supports TypeScript and React/JSX natively, as documented in the [3.0.1 TypeScript and React guide](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/programming/typescript_react.md). The sync engine does not perform external transpilation or bundling. The game still handles source execution internally.

External editor support should provide Netscript declarations, compatible React globals and JSX types, and no-emit type-checking. Game scripts must use imports that resolve inside Bitburner. Arbitrary npm dependencies, Node/Bun APIs, and editor-only path aliases are not made available in the game by synchronizing source files.

### Reconcile changes and preserve conflicts

The engine records a last-synchronized content hash for each server and filename. Content comparison determines changes; timestamps alone do not decide which version wins.

| State relative to the synchronization baseline | Action |
| --- | --- |
| Both files exist; only the local file changed | Upload |
| Both files exist; only the game file changed | Download |
| Both now contain identical content | Update the baseline |
| Both changed differently | Preserve both versions and report a conflict |
| Neither changed | Do nothing |
| A tracked file is missing on only one side | Report a conflict; do not delete or restore |

On first connection, different files on both sides have no common baseline and must not be silently overwritten. Missing files require separate creation/deletion handling: absence alone is not permission to delete the other copy. Rename and deletion propagation come after these rules are tested.

The initial engine serializes all transfers, requires stable local reads, suppresses unchanged content, persists state, and keeps observed-version recovery copies. Reconnection must invalidate stale transfer decisions and trigger a new comparison. A timed-out write has an unknown outcome, so read back before deciding whether to retry. Multiple game connections must not simultaneously own the same local destination.

### API concurrency limits

Bitburner 3.0.1's [Remote API implementation](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/MessageHandlers.ts) provides neither file-change subscriptions nor conditional writes against an expected revision. The connector therefore needs polling for game-side changes.

Queues can prevent overlapping operations within this connector, but cannot make a remote read followed by a write atomic. An in-game edit between those operations can still be overwritten. Rechecking, verification, and recovery copies reduce risk but cannot preserve a version the connector never observed. Strict prevention of lost updates would require game-side conditional writes/locking or a single-writer workflow. This project does not promise race-free simultaneous editing through the existing API.

### Outside the initial milestone

- Automatic script execution or restart, deployment orchestration, and game automation.
- General npm bundling, source transformation, or generated JavaScript deployment.
- Full JSON-RPC batch/notification support.
- Save management and remote debugging integrations.
- An editor-specific extension; the initial interface will operate on local files.

## Next steps

- Validate sync with explicitly selected disposable game files before using valuable scripts.
- Improve scanning efficiency and add configurable ignore patterns as needed.
- Add deletion/rename workflows after their conflict semantics are tested.
- Keep dashboards, frontend APIs, and editor integrations outside the initial sync milestone.

## Extending the base engine

Public contracts and JSDoc live alongside the implementation. Add a method contract in `src/bitburner/types.ts`, its result parser in `src/bitburner/client.ts`, then valid/invalid response tests and compile-time argument checks. Keep Bun socket lifecycle code in the adapter and game-specific validation in the wrapper. Do not assume TypeScript types validate received JSON.

`RpcClient` owns one connection's pending requests; its optional constructor timeout is in milliseconds (default 30,000). `disconnect()` rejects pending requests but does not close the socket. The adapter owns socket closure. A timeout never cancels remote work, and the client does not retry writes. Keep game source transfers separate from any future build command for distributing the connector.
