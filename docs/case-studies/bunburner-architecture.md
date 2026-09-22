# BunBurner Architecture Case Study

## Overview

BunBurner is a source-preserving two-way synchronization tool for Bitburner.

The project began with a simple goal: make it possible to edit Bitburner scripts in a normal external editor while keeping files synchronized with the game without forcing a bundling or transpilation workflow.

As the project grew, the original Bun-specific CLI/server structure became too tightly coupled to the runtime and entrypoint. That structure worked well for the first version, but it made future goals harder:

- supporting Node alongside Bun,
- exposing a reusable application API,
- building editor integrations,
- keeping the synchronization engine independently testable,
- and making future runtime or frontend changes local instead of invasive.

The architecture was refactored around one principle:

> Own the contracts, not every implementation.

The result is a layered design where the portable core, application lifecycle, host implementation, CLI, and configuration system are separated while preserving existing synchronization behavior.

---

## The Original Problem

The original BunBurner entrypoint handled several responsibilities at once:

- reading configuration,
- starting the Bun WebSocket server,
- accepting Bitburner connections,
- creating RPC clients,
- starting synchronization,
- tracking the active sync owner,
- handling pause behavior,
- cleaning up workspace locks,
- and handling process shutdown.

That implementation worked, but it made the CLI the application.

The problem was not that the code was broken. The problem was that the boundaries were in the wrong place for where the project was heading.

A VS Code extension, another runtime, a GUI, or a test harness should not need to recreate the synchronization engine just because the original entrypoint owned the WebSocket server.

---

## Constraints

The refactor had several hard constraints.

### Preserve synchronization behavior

The existing two-way sync logic already had important safety properties:

- source files were transferred without transpilation,
- concurrent edits became conflicts instead of silent overwrites,
- deletions were not inferred across the boundary,
- failed writes did not advance synchronization baselines,
- sync paused after uncertain failures instead of retrying blindly,
- workspace ownership remained exclusive when sync was enabled,
- and shutdown released workspace locks.

Those behaviors could not regress during the architectural work.

### Keep the portable core runtime-independent

The synchronization and RPC primitives needed to remain usable without depending on Bun, Node filesystem APIs, or the WebSocket server implementation.

### Avoid premature abstraction

The project should expose enough structure for future integrations without implementing hypothetical adapters before they are needed.

The goal was not to build a universal plugin framework.

The goal was to create clean seams.

### Keep the CLI simple

The CLI should become a frontend to the application instead of remaining the place where the application lived.

---

## Initial Architecture

The original application effectively looked like this:

```text
src/index.ts
├─ configuration
├─ Bun.serve()
├─ WebSocket lifecycle
├─ RpcClient
├─ BitburnerClient
├─ sync ownership
├─ runSync()
├─ shutdown
└─ logging
```

The entrypoint knew almost everything.

That made it difficult to reuse the application without also reusing the CLI and Bun runtime.

---

## Decision 1: Isolate the Runtime-Neutral Core

The first step was to establish a strict package boundary around the portable core.

The public core entrypoint became:

```ts
import {
  RpcClient,
  BitburnerClient,
  SyncEngine,
  RemoteFiles,
} from "bun-burner/core";
```

The core contains contracts and logic such as:

- RPC transport,
- RPC client behavior,
- Bitburner API client behavior,
- sync engine behavior,
- remote file access,
- hashing,
- conflict and baseline logic.

It does not own:

- WebSocket listeners,
- process signals,
- `.env`,
- CLI arguments,
- host filesystem lifecycle,
- or Bun-specific runtime behavior.

### Why this mattered

This made runtime independence an enforceable package property instead of a design intention.

The package verification suite recursively audits the emitted `/core` dependency graph and rejects runtime-specific or external dependency leakage.

That means future changes can accidentally break the portability boundary only if the tests also fail.

---

## Decision 2: Introduce a High-Level Application API

The next layer introduced:

```ts
const app = await createBunBurner({
  root: "./scripts",
  host: "127.0.0.1",
  port: 12525,
  sync: false,
  debug: false,
});

await app.start();

const status = await app.status();

await app.stop();
```

The application surface is intentionally small:

```ts
interface BunBurnerApplication {
  start(): Promise<void>;
  status(): Promise<BunBurnerStatus>;
  stop(): Promise<void>;
}
```

### Construction is side-effect free

Calling `createBunBurner()`:

- resolves configuration,
- validates configuration,
- composes the application,
- and prepares runtime components.

It does not:

- open a listener,
- begin synchronization,
- write files,
- install process signal handlers,
- or mutate the workspace.

Side effects begin only when `start()` is called.

### Lifecycle behavior

The lifecycle is serialized so concurrent calls do not race each other.

The application supports:

- idempotent `start()`,
- idempotent `stop()`,
- restart after stop,
- retry after a failed bind,
- and status inspection while stopped or running.

This created a reusable application layer without exposing the synchronization engine directly to every frontend.

---

## Decision 3: Move Hosting Behind a Small Interface

The original implementation directly owned `Bun.serve()`.

That was replaced by a small internal host seam:

```ts
interface HostAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): HostStatus;
}
```

The current implementation uses Node-compatible HTTP APIs and `ws`, which run under both Node and Bun.

The host owns:

- the HTTP listener,
- WebSocket upgrades,
- socket lifetime,
- and low-level peer transport.

The application owns:

- connection policy,
- RPC clients,
- sync ownership,
- sync pause behavior,
- and lifecycle state.

That separation keeps the transport replaceable without moving synchronization logic into the host layer.

The host abstraction remains intentionally internal. A public adapter registration API was not added because no current integration requires it yet.

---

## Decision 4: Turn the CLI Into a Frontend

Before the refactor, the entrypoint effectively was BunBurner.

After the refactor, the CLI became a frontend.

Its responsibilities are now limited to:

- parsing command-line arguments,
- handling `--help`,
- handling `--version`,
- mapping CLI flags into BunBurner options,
- creating the application,
- starting it,
- and translating SIGINT/SIGTERM into `app.stop()`.

The application does not read `process.argv` or install process handlers itself.

This distinction matters because another frontend can now use the same application lifecycle without pretending to be the CLI.

Potential future frontends could include:

- a VS Code extension,
- a GUI,
- another Node or Bun host,
- or an integration layer for another tool.

None of those need to be implemented today for the architecture to support them later.

---

## Configuration and Precedence

BunBurner now has a single normalized configuration model.

Representative configuration:

```jsonc
{
  "root": "./scripts",
  "server": "home",
  "host": "127.0.0.1",
  "port": 12525,
  "sync": false,
  "debug": false
}
```

The canonical config filename is:

```text
bunburner.config.jsonc
```

JSONC was chosen so configuration can support comments and trailing commas without requiring users to move to a more complex configuration format.

Configuration is resolved with explicit precedence:

```text
built-in defaults
→ bunburner.config.jsonc
→ optional .env
→ process environment
→ CLI flags
→ explicit programmatic options
```

Higher-priority values override lower-priority values.

Programmatic options always win.

### Environment handling

`.env` is optional.

It is parsed into an internal object instead of mutating `process.env`.

The portable `/core` entrypoint does not load configuration files or environment files.

### Validation

The effective configuration is validated after precedence resolution.

Validation includes:

- valid port range,
- valid host format,
- non-empty root and server values,
- strict boolean parsing,
- invalid or unknown config keys,
- malformed JSONC,
- and missing explicitly requested config files.

An absent default config file is allowed.

---

## Package Boundary

The package now exposes two intentionally different surfaces.

### High-level application API

```ts
import { createBunBurner } from "bun-burner";
```

This API is Node/Bun-oriented and owns the application lifecycle.

### Portable primitives

```ts
import {
  RpcClient,
  BitburnerClient,
  SyncEngine,
  RemoteFiles,
} from "bun-burner/core";
```

This API remains runtime-neutral.

The application layer currently depends on:

- `ws`,
- `jsonc-parser`,
- and Node-compatible platform APIs.

The `/core` package imports none of them.

This keeps runtime-specific concerns at the edge of the architecture instead of leaking into the synchronization engine.

---

## Verification Strategy

The refactor was treated as a behavioral preservation exercise, not just a compilation exercise.

### Full test suite

The successful local Linux verification completed with:

```text
51 passed
2 Windows-only tests skipped
0 failed
```

The tests covered both existing synchronization behavior and the new application architecture.

### Application lifecycle tests

Tests verify that:

- `createBunBurner()` works with no options,
- construction does not write files,
- construction does not open a listener,
- failed startup can be retried,
- lifecycle calls are serialized,
- repeated start/stop calls are safe,
- stopped applications release their port,
- and status accurately reflects lifecycle state.

### Configuration tests

Tests cover:

- built-in defaults,
- programmatic overrides,
- JSONC comments,
- trailing commas,
- `.env`,
- environment variables,
- CLI flags,
- complete precedence,
- invalid ports,
- invalid hosts,
- malformed configuration,
- unknown keys,
- and explicit missing config paths.

### Packed consumer verification

The package is built into an npm tarball and installed into a separate consumer fixture.

The packed consumer verifies:

- package exports,
- TypeScript declarations,
- root application imports,
- `/core` imports,
- Node compatibility,
- application lifecycle,
- and the CLI entrypoint.

### Runtime-neutral core audit

The emitted `/core` dependency graph is recursively inspected.

The audit rejects runtime-specific or external dependencies from the core package.

This turns the architectural boundary into an executable invariant.

### Node without Bun

The package tests run under system Node with Bun unavailable from the consumer environment.

That provides direct evidence that the portable core and high-level application package are not accidentally relying on Bun being installed.

### Node and Bun CLI verification

The packed CLI is exercised under both Node and Bun.

The tests verify:

- help,
- version output,
- config precedence,
- listener startup,
- no unexpected startup RPC,
- and graceful SIGTERM shutdown.

### Real WebSocket fixture

A simulated Bitburner client communicates with the application over a real WebSocket connection.

The fixture verifies:

- download from the simulated game,
- upload to the simulated game,
- exclusive sync ownership,
- pause after a remote failure,
- no retry while paused,
- workspace lock release,
- shutdown,
- and restart.

The goal is to test the boundaries together instead of proving each class only in isolation.

---

## Tradeoffs

### The root API is not browser-portable

The high-level `bun-burner` application API currently uses Node-compatible host and filesystem APIs.

This is intentional.

The portable boundary is `/core`, while the application layer is currently designed for Node and Bun.

Making the complete high-level application browser-compatible would add constraints that no current use case requires.

### Runtime dependencies increased

The application layer now depends on:

- `ws`,
- `jsonc-parser`.

That is a deliberate tradeoff.

The dependencies simplify a portable Node/Bun host and robust JSONC parsing while remaining outside the portable core.

### The host adapter is internal

The architecture contains a host seam, but consumers cannot yet register arbitrary host implementations through the public API.

That feature is deferred until a real integration demonstrates the need.

### The config file is optional

BunBurner ships sensible defaults and does not require a configuration file.

This keeps the simplest use case simple while still allowing more explicit project configuration.

---

## What Stayed Intentionally Out of Scope

This architecture pass did not implement:

- a VS Code extension,
- browser hosting,
- Deno-specific hosting,
- Rust or Go bridges,
- MCP integration,
- a public plugin system,
- a public adapter registry,
- debugging APIs,
- RAM analysis,
- UI conflict resolution,
- or automatic deletion propagation.

Those are possible future directions, not requirements for the current architecture.

The refactor focused on making future changes local rather than implementing those future changes early.

---

## Results

The refactor changed BunBurner from a Bun-owned CLI application into a layered system:

```text
frontends
└─ CLI

application
├─ createBunBurner()
├─ lifecycle
├─ configuration
├─ connection policy
└─ sync orchestration

host
└─ Node/Bun WebSocket implementation

core
├─ RPC
├─ Bitburner client
├─ sync engine
├─ remote files
└─ contracts
```

The original entrypoint shrank from owning nearly the entire runtime to acting as a thin executable launcher.

The project now has:

- a reusable high-level application API,
- a portable core package,
- a replaceable host boundary,
- a centralized configuration system,
- a portable CLI,
- explicit package exports,
- and package-level verification under both Node and Bun.

Most importantly, the synchronization behavior did not need to be rewritten to achieve the architectural change.

---

## What I Learned

One of the main lessons from this refactor was that portability is easier to maintain when it is expressed as a boundary rather than a goal.

Saying that a synchronization engine is "runtime-independent" is weaker than creating a package boundary and testing that the emitted dependency graph cannot import runtime-specific modules.

Another lesson was that good abstractions often appear after working software exposes a real boundary.

The project did not begin with a `HostAdapter`.

It began with a concrete Bun server.

Once the need for multiple frontends and runtimes became real, the smallest useful host contract became obvious:

```ts
start()
stop()
status()
```

That was enough.

The refactor also reinforced a broader architecture principle:

> A good architecture does not eliminate change. It makes change local.

BunBurner will continue to evolve. The goal is not to predict every future integration.

The goal is to make the next integration possible without forcing unrelated parts of the system to move with it.

---

## Future Work

The most likely next architectural pressure will come from editor integration.

A VS Code extension can help determine whether the current public application API is sufficient or whether BunBurner genuinely needs public adapter injection.

Other possible future work includes:

- editor status and lifecycle controls,
- native conflict/diff presentation,
- debug integration,
- RAM analysis and editor decorations,
- additional frontend clients,
- and additional host implementations where justified.

Those changes should be introduced in response to real use cases rather than added speculatively.

The current architecture is intended to provide room for those experiments without requiring the synchronization engine to be redesigned again.
