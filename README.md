# bun-burner

A local Bun/TypeScript bridge to Bitburner's Remote API. The intended product connects an external code editor to the game with bidirectional file synchronization that preserves original source files.

**Current status:** the RPC foundation and three typed read methods are implemented. Automatic synchronization and file uploads are not implemented yet.

## Run

Validated with Bun 1.4.2, TypeScript 7.0.2, and Bitburner 3.0.1.

```bash
bun install --frozen-lockfile
bun run start
```

In Bitburner, open **Options → Remote API**, use hostname `127.0.0.1` and port `12525`, then connect using WebSocket (`ws`, not `wss`).

The bridge listens on `ws://127.0.0.1:12525`. Each connection triggers one `getFileNames` request for `home` and prints the returned filenames. It does not write, delete, or execute game files. Only run one bridge instance on this port; an address-in-use error usually means another instance is still running.

## Current functionality

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

The generic `RpcClient.call()` intentionally returns `Promise<unknown>`. Use `BitburnerClient.call()` for method-specific parameter checks, inferred result types, and runtime result validation. For example, with a connected `BitburnerClient` named `bitburner`:

```ts
const files = await bitburner.call("getFileNames", { server: "home" });
// files: string[]
```

The contract follows the [Bitburner 3.0.1 implementation](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/MessageDefinitions.ts) and [request handlers](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/MessageHandlers.ts). In that version, error payloads are strings and metadata timestamps are numbers.

## Structure

```text
src/
  index.ts             Bun server, connection lifecycle, frame decoding
  rpc/
    client.ts          Generic request lifecycle and response handling
    types.ts           Transport and pending-request contracts
  bitburner/
    client.ts          Typed method map and result validators
tests/
  client.test.ts       RPC lifecycle tests
  bitburner.test.ts    API validation and type checks
```

## Verify

```bash
bun run typecheck
bun test
```

The seven local tests cover response ordering, errors, disconnects, send and serialization failures, malformed envelopes, and typed result validation. Compile-time checks reject unknown method names and missing required parameters.

A live `getFileNames` round trip against Bitburner succeeded, including after reconnecting with the typed API layer. File contents, metadata, and remote-error recovery have been tested with simulated responses, not live game requests. The timeout is implemented but does not yet have a dedicated timing test.

## Feature status

“Implemented” describes code available today; see **Verify** above for the distinction between live and simulated testing. “Planned” describes intended work, not available functionality.

| Feature | Status | Notes |
| --- | --- | --- |
| WebSocket connection and RPC lifecycle | Implemented | Per-connection requests, responses, errors, timeouts, and disconnect cleanup |
| Typed filename, content, and metadata reads | Implemented | Three methods listed above; successful results are validated at runtime |
| Automatic filename listing on connection | Implemented | One request for `home`, with terminal output |
| Upload original source with `pushFile` | Planned | Preserve filename, extension, and source text |
| Bulk reads with `getAllFiles` / `getAllFileMetadata` | Planned | Inventory and reconciliation support |
| Manual upload/download commands | Planned | Explicit transfers before automatic sync |
| Local file watching and game-side polling | Planned | Detect changes in both directions |
| Conflict detection and recovery copies | Planned | Compare both sides with a persisted synchronization baseline |
| Per-file operation queues and loop suppression | Planned | Coordinate uploads/downloads and avoid echoing our own changes |
| Startup and reconnect reconciliation | Planned | Re-read state before resuming transfers |
| Folder/server mappings and ignore rules | Planned | Bound sync to selected files and destinations |
| Deletion and rename propagation | Planned, later | Require baseline history and conflict handling first |
| Netscript definitions and React/JSX editor setup | Planned | Editor type-checking without generated deployment files |
| Server discovery with `getAllServers` | Planned | Support explicit destination mappings |
| RAM reporting with `calculateRam` | Optional future work | Not required for synchronization |
| Save export with `getSaveFile` | Outside initial scope | Separate from source-file synchronization |

The lower-level RPC transport can send arbitrary method names; the three-method typed API is not a read-only security boundary. The current application only issues the filename read on connection.

## Intended scope

The first synchronization target is an editor-independent local connector. Saving a selected file in an external editor should update its game counterpart; a saved game-side edit should return to the local file. The connector observes saved files, not unsaved editor buffers.

### Preserve original source

Transfer `.js`, `.ts`, `.jsx`, and `.tsx` files with their original names and source text in both directions. For example, local `home/dashboard.tsx` should map to `dashboard.tsx` on the game server `home`, without producing a `.js` counterpart. The exact workspace mapping remains to be implemented.

Bitburner supports TypeScript and React/JSX natively, as documented in the [3.0.1 TypeScript and React guide](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/Documentation/doc/en/programming/typescript_react.md). The connector will not require an external transpilation or bundling step. The game still handles source execution internally.

External editor support should provide Netscript declarations, compatible React globals and JSX types, and no-emit type-checking. Game scripts must use imports that resolve inside Bitburner. Arbitrary npm dependencies, Node/Bun APIs, and editor-only path aliases are not made available in the game by synchronizing source files.

### Reconcile changes and preserve conflicts

The planned engine records a last-synchronized content hash for each server and filename. Content comparison determines changes; timestamps alone do not decide which version wins.

| State relative to the synchronization baseline | Intended action |
| --- | --- |
| Only the local file changed | Upload |
| Only the game file changed | Download |
| Both now contain identical content | Update the baseline |
| Both changed differently | Preserve both versions and report a conflict |
| Neither changed | Do nothing |

On first connection, different files on both sides have no common baseline and must not be silently overwritten. Missing files require separate creation/deletion handling: absence alone is not permission to delete the other copy. Rename and deletion propagation come after these rules are tested.

Planned safeguards include per-file queues shared by both directions, debounced stable local reads, content-based suppression of self-generated changes, persistent state, and recovery copies. Reconnection must invalidate stale transfer decisions and trigger a new comparison. A timed-out write has an unknown outcome, so read back before deciding whether to retry. Multiple game connections must not simultaneously own the same local destination.

### API concurrency limits

Bitburner 3.0.1's [Remote API implementation](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/MessageHandlers.ts) provides neither file-change subscriptions nor conditional writes against an expected revision. The connector therefore needs polling for game-side changes.

Queues can prevent overlapping operations within this connector, but cannot make a remote read followed by a write atomic. An in-game edit between those operations can still be overwritten. Rechecking, verification, and recovery copies reduce risk but cannot preserve a version the connector never observed. Strict prevention of lost updates would require game-side conditional writes/locking or a single-writer workflow. This project does not promise race-free simultaneous editing through the existing API.

### Outside the initial milestone

- Automatic script execution or restart, deployment orchestration, and game automation.
- General npm bundling, source transformation, or generated JavaScript deployment.
- Full JSON-RPC batch/notification support.
- Save management and remote debugging integrations.
- An editor-specific extension; the initial interface will operate on local files.

## Incremental roadmap

1. Complete the typed file API and corresponding tests.
2. Add explicit source-preserving upload/download operations.
3. Build a reconciliation planner that reports actions and conflicts without writing.
4. Add queued transfers, verification, and persistent recovery state.
5. Add local watching and game-side polling.
6. Add deletion/rename handling and external editor type setup.

Each step should remain independently reviewable. Live testing of writes should use explicitly selected disposable game files; existing user scripts are not test fixtures.
