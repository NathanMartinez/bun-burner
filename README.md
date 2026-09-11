# bun-burner

A local Bun/TypeScript bridge to Bitburner's Remote API. The current milestone implements request/response handling and a small, strongly typed read API.

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

## Scope

This is an incremental RPC foundation, not a file-sync tool yet. There is no file watcher, upload/delete workflow, script execution, CLI for arbitrary requests, batch/notification handling, or automatic retry of calls. The typed layer currently exposes only the three reads above; the lower-level RPC transport is not a read-only security boundary. Bitburner controls reconnection; the bridge waits for incoming connections and creates fresh RPC state for each one.
