# Bun Burner

A local Bun/TypeScript bridge that synchronizes original source files between an external editor and Bitburner through its Remote API.

**Current status:** the RPC foundation and all eleven typed Remote API methods are implemented. Opt-in two-way source synchronization is implemented on this development branch. Deletion propagation and manual transfer commands remain deferred.

## Why Bun Burner?

Bun Burner started as a personal solution to a specific Bitburner development friction: I wanted to use the external editor and tools I already like while preserving the source files Bitburner itself understands.

The core goal is intentionally narrow:

- `.js` stays `.js`
- `.jsx` stays `.jsx`
- `.ts` stays `.ts`
- `.tsx` stays `.tsx`
- synchronization remains separate from transpilation, compilation, bundling, and source rewriting
- bidirectional conflicts are preserved instead of silently resolved
- setup and runtime behavior should remain understandable
- the synchronization core should stay editor-independent

Several excellent Bitburner external-editor and file-sync projects already exist. Bun Burner is not intended to replace them or compete with them. It is another implementation with a different set of tradeoffs, built because the workflows I tried did not quite match the workflow I wanted.

If another tool better fits a user's needs, use it.

Bun Burner also has an unusual success condition: if improvements to Bitburner or its officially supported tooling eventually make Bun Burner unnecessary, that is a successful outcome.

## Project policy

- **TypeScript first; JavaScript welcome.** Core APIs use TypeScript contracts. Game source remains unchanged, and JavaScript users can use JSDoc for editor assistance and checking.
- **Bun is the primary runtime.** It is the only server adapter and test runner maintained and tested here. The reusable core does not require Bun; a different runtime needs a contributor-provided adapter.
- **Source synchronization is not a build system.** Bun Burner does not transpile, compile, bundle, or rewrite game scripts as part of synchronization.
- **Safety over guessing.** When both sides change and the correct winner is ambiguous, preserve both versions and report the conflict rather than silently destroying work.
- **Stable command names.** `start`, `test`, and `typecheck` are the entry points. `bun run start`, `npm run start`, and `yarn run start` select the same package script; currently that script starts Bun. Choosing a package manager does not choose a runtime. An alternative implementation can replace the script wiring while preserving the command names.
- **Keep the scope small.** Maintain the typed Remote API and source synchronization. No runtime auto-detection, multi-runtime launcher framework, plugin framework, frontend framework, or additional runtime dependencies are required for this milestone.
- **Solve problems at the correct layer.** Editor-specific behavior belongs in editor integrations. Presentation belongs in optional clients. Problems that belong in Bitburner itself should be characterized and contributed upstream when practical.
- **Ecosystem, not competition.** Alternatives should be documented honestly and recommended when they better fit a user's workflow.
- **Planned obsolescence is a success condition.** Bun Burner should not manufacture reasons to exist after the underlying workflow is solved better upstream.

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

The tests cover response ordering, errors, disconnects, timeouts and late replies, send and serialization failures, malformed envelopes, all eleven result validators, and configuration. Compile-time checks reject unknown method names and missing required parameters.

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
| WSS | Deferred |
| Optional dashboards, TUIs, editor integrations, and other clients | Outside the core milestone; contributions are welcome when kept separate from the synchronization core |

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

### Source synchronization, not frontend ownership

Bun Burner preserves `.js`, `.jsx`, `.ts`, and `.tsx` source because Bitburner supports those workflows. That does not make React or any other frontend framework part of Bun Burner's core runtime.

Optional dashboards, TUIs, editor extensions, and other clients are welcome areas for experimentation when they consume stable Bun Burner interfaces without making their framework a requirement for source synchronization.

If a useful experiment grows into a distinct product with different dependencies or goals, it may belong in a separate package, extension, or project rather than inside the synchronization core.

### Outside the initial milestone

- Automatic script execution or restart, deployment orchestration, and game automation.
- General npm bundling, source transformation, compilation, or generated JavaScript deployment.
- Full JSON-RPC batch/notification support.
- Save management and remote debugging integrations.
- Built-in dashboards, TUIs, or frontend framework dependencies.
- A required editor-specific extension; the initial interface operates on local files.
- A general plugin framework without demonstrated demand.

## Upstream-first development

When Bun Burner exposes an unexpected limitation, the first question is not automatically how to build a permanent workaround.

The preferred path is:

1. Observe and reproduce the behavior.
2. Isolate the owning layer.
3. Add regression evidence where possible.
4. Document the expected and actual behavior.
5. Fix Bun Burner when the defect belongs here.
6. Report or contribute upstream when the defect or missing capability belongs in Bitburner.
7. Keep only the smallest compatibility workaround that is actually necessary.
8. Remove that workaround when upstream support makes it unnecessary.

Bun Burner is an independent consumer of the Bitburner Remote API, not an official reference client or official Bitburner test suite. Findings from real integration testing are still useful, especially when they expose documentation mismatches, implementation discrepancies, or missing capabilities that affect external tooling.

## Planned obsolescence

Bun Burner's continued necessity is not a project goal.

If Bitburner itself, or officially supported tooling, eventually provides Bun Burner's core workflow with comparable safety and usability, this project should recommend the upstream solution instead of manufacturing reasons to keep another layer installed.

At that point Bun Burner may reduce its scope, remove obsolete functionality, continue only where it offers genuinely distinct value, enter maintenance mode, or be archived.

If the Bitburner ecosystem improves to the point that Bun Burner is no longer needed, the project has succeeded.

## Ecosystem and alternatives

Bun Burner is part of a broader Bitburner external-development ecosystem.

Detailed comparisons should be based on firsthand testing, not assumptions. When that testing is performed, useful comparisons may include setup friction, configuration, source preservation, synchronization direction, conflict behavior, recovery, observability, type-definition workflows, platform support, strengths, limitations, and which workflows each tool serves best.

Version numbers and test dates should accompany detailed comparisons because neighboring projects continue to evolve.

The goal is not to declare a winner. The goal is to help users choose the workflow that fits them and to learn from good ideas elsewhere.

## Next steps

- Validate sync against the actual game using explicitly selected disposable integration-test files before using valuable scripts.
- Record live discrepancies separately from user-facing claims so potential Bun Burner fixes and upstream Bitburner findings can be reviewed independently.
- Improve scanning efficiency and add configurable ignore patterns only when real use demonstrates the need.
- Add deletion/rename workflows only after their conflict semantics are tested.
- After the core beta is proven, evaluate neighboring tools firsthand and document their tradeoffs honestly.
- Keep optional dashboards, frontend clients, editor integrations, and plugin experiments outside the core synchronization path unless demonstrated requirements justify a change.

## Extending the base engine

Public contracts and JSDoc live alongside the implementation. Add a method contract in `src/bitburner/types.ts`, its result parser in `src/bitburner/client.ts`, then valid/invalid response tests and compile-time argument checks. Keep Bun socket lifecycle code in the adapter and game-specific validation in the wrapper. Do not assume TypeScript types validate received JSON.

`RpcClient` owns one connection's pending requests; its optional constructor timeout is in milliseconds (default 30,000). `disconnect()` rejects pending requests but does not close the socket. The adapter owns socket closure. A timeout never cancels remote work, and the client does not retry writes. Keep game source transfers separate from any future build command for distributing the connector.

The existing core boundaries are intended to make reuse possible without forcing a plugin framework into the initial release. New adapters or clients should depend on stable contracts where possible rather than moving editor, UI, or runtime-specific behavior into the core.

## Game types and editor setup

[`NetscriptDefinitions.d.ts`](./NetscriptDefinitions.d.ts) is the checked-in source of truth for **in-game Netscript APIs**, verified byte-for-byte against Bitburner 3.0.1. It is distinct from the Remote API types used by the connector. See [provenance and upstream license](./types/README.md).

In a game script:

```ts
import type { NS } from "@ns";

export function main(ns: NS): void {
  ns.tprint(ns.getHostname());
}
```

The included `scripts/tsconfig.json` supplies editor settings for the default workspace. TypeScript and JavaScript source are included; JavaScript checking is enabled with `checkJs`, and JSDoc can describe Netscript parameters. Type-check game scripts without emitting JavaScript:

```bash
bun run typecheck:game
```

JavaScript can use the same definitions without a runtime import:

```js
/** @param {import("@ns").NS} ns */
export function main(ns) {
  ns.tprint(ns.getHostname());
}
```

This configuration excludes Bun/Node globals and uses the `@ns` alias only for type imports. React placeholders in Netscript declarations do not supply full React/JSX IntelliSense; compatible React typings remain a separate editor setup task.

For an external scripts folder, create a `tsconfig.json` there extending this repository's `tsconfig.game.json`, and override `include`/`exclude` to select that folder:

```json
{
  "extends": "/absolute/path/to/bun-burner/tsconfig.game.json",
  "include": ["./**/*.ts", "./**/*.tsx", "./**/*.js", "./**/*.jsx"],
  "exclude": ["./node_modules", "./.bun-burner"]
}
```

Run `tsc -p /absolute/path/to/your/scripts/tsconfig.json` to check that external workspace. Changing the sync root does not automatically configure an external editor. The definitions file and tsconfig files are not uploaded by source sync.

Connecting to the game **does not overwrite the definitions**. `getDefinitionFile` can retrieve the connected game's version, but refreshing the tracked snapshot should be a deliberate, reviewed update.

## Core and runtime boundaries

`src/core.ts` exports the RPC client, Bitburner wrapper, and synchronization interfaces/logic without importing Bun or Node modules. It uses standard JavaScript, timers, `TextEncoder`, and Web Crypto SHA-256. `tsconfig.core.json` checks this import graph without Bun or Node globals; the standard Web APIs must be supplied by the chosen runtime.

The runnable server in `src/index.ts` still uses Bun. Local storage uses Node-compatible filesystem APIs in `src/sync/local.ts`. Supporting another runtime means providing the server/filesystem adapters; this repository does not yet ship or verify a Node or Deno launcher. The tests currently use Bun's test runner. npm and Yarn are package managers, not runtimes: using them does not make `bun run start` work without Bun.

Keep game declarations, core logic, and runtime adapters separate when extending the project. Package-manager-specific installation instructions and alternative launchers can be added without changing the game API contract.

## AI-assisted development

Bun Burner uses AI-assisted development, including OpenAI Codex and ChatGPT.

AI may assist with implementation, analysis, testing, research, review, and documentation. Project requirements, architectural direction, acceptance criteria, validation, and release decisions remain human-reviewed.

The goal is not to obscure how the software was produced. The goal is to build, understand, test, and maintain it responsibly regardless of which tools helped write it.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, checks, scope, and contribution guidelines.

Contributions that improve Bun Burner are welcome. Contributions that identify a problem better solved upstream are valuable too. The project prefers putting fixes at the layer where they belong rather than permanently accumulating workarounds.

Bun Burner's original code is licensed under [MIT](LICENSE). The bundled `NetscriptDefinitions.d.ts` remains under Bitburner's own [Apache 2.0 with Commons Clause license](types/BITBURNER-LICENSE.txt), not MIT. See [game definition provenance](types/README.md) for its source and version.

