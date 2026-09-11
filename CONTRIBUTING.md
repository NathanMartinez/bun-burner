# Contributing to Bun Burner

Small, focused fixes and improvements are welcome. Open an issue before starting a substantial feature so we can agree on scope.

## Scope and architecture

TypeScript is first-class; JavaScript and JSDoc are supported. Bun is the maintained runtime and test runner. Keep `src/core.ts` and its import graph free of Bun/Node dependencies. Runtime-specific behavior belongs in adapters. Contributors may propose other runtime adapters, but additional runtimes are not required for the initial release.

The current scope is the JSON-RPC client, typed Bitburner Remote API, and source-file synchronization. Preserve `.js`, `.ts`, `.jsx`, and `.tsx` source without transpilation. Dashboards, editor plugins, additional transports, and build/distribution systems are future work.

## Local workflow

1. Create a focused development branch from `main`.
2. Install dependencies with `bun install --frozen-lockfile`.
3. Copy `.env.example` to `.env` if you need custom settings. Synchronization defaults to disabled.
4. Make the smallest complete change and document public behavior in JSDoc. Update the README when setup or usability changes.
5. Run the checks below and open a pull request explaining the problem, resulting behavior, and validation.

```sh
bun run typecheck
bun run typecheck:game
bun test
```

Use `bun run start` to launch the Bun adapter. Keep commits focused; separate tests when they remain understandable independently. Dependency changes should include the updated Bun lockfile; do not hand-edit it.

## Tests and game data

Use mocks and temporary directories for automated tests. Add regression coverage for behavioral fixes, especially request cleanup, response validation, conflict handling, and failed writes. Do not treat a mock test as proof of live-game behavior.

Live synchronization can overwrite files. Test only with explicitly designated disposable local and game files. Never use another person's active scripts as test data. Keep `.env`, scripts, recovery state, and machine-specific paths out of commits.

The game API does not offer atomic compare-and-write. Preserve rechecks, recovery copies, serialized scans, and failure pauses; do not promise race-free synchronization or blindly retry uncertain writes.

## Game definitions and licensing

`NetscriptDefinitions.d.ts` is a versioned upstream snapshot, separate from the Remote API contracts. Do not edit it to fix connector types or refresh it automatically on connection. For deliberate updates, review the upstream diff and version, update the provenance/hash in `types/README.md`, preserve the upstream license, and run the game type check.

Original contributions are provided under the project's [MIT license](LICENSE). The bundled game declarations retain their [upstream license](types/BITBURNER-LICENSE.txt); see [provenance](types/README.md). Preserve third-party notices and identify any newly vendored code.
