# Contributing to Bun Burner

Small, focused fixes and improvements are welcome. Open an issue before starting a substantial feature so we can agree on scope and determine whether Bun Burner is the correct layer for the change.

Bun Burner is intentionally not trying to win a feature-count competition with other Bitburner development tools. The goal is to reduce real development friction while keeping the synchronization core small, understandable, safe, and easy to remove when the underlying ecosystem no longer needs it.

## Scope and architecture

TypeScript is first-class; JavaScript and JSDoc are supported. Bun is the maintained runtime and test runner. Keep `src/core.ts` and its import graph free of Bun/Node dependencies. Runtime-specific behavior belongs in adapters. Contributors may propose other runtime adapters, but additional runtimes are not required for the initial release.

The current core scope is the JSON-RPC client, typed Bitburner Remote API, and source-file synchronization.

Preserve `.js`, `.ts`, `.jsx`, and `.tsx` source without transpilation, compilation, bundling, or source rewriting. Bun Burner synchronizes source files; it is not a build system.

Do not move editor-specific, UI-specific, or runtime-specific behavior into the synchronization core merely because the core could technically support it.

Optional dashboards, TUIs, editor extensions, alternate clients, and other integrations are welcome areas for contribution when they:

- solve a demonstrated problem
- consume stable project interfaces where practical
- remain optional
- do not make React, Svelte, Vue, or another frontend framework a core dependency
- do not require a general plugin framework before one is actually needed

If an experiment grows into a product with substantially different dependencies or goals, a separate package, extension, or project may be a better home.

## Before proposing a feature

Before implementing a substantial feature, ask:

1. Does this solve demonstrated development friction?
2. Is Bun Burner the correct layer to solve it?
3. Would it fit better in an editor extension, optional client, reusable library, another project, or Bitburner itself?
4. Does it preserve source fidelity and safe synchronization behavior?
5. Does it keep the core small and understandable?
6. Could an upstream Bitburner improvement remove the need for the feature entirely?

Sometimes the correct answer is to improve another layer instead of Bun Burner.

That is not a rejected contribution. It is the project working as intended.

## Upstream-first contributions

When work on Bun Burner exposes a limitation in Bitburner, determine ownership before adding a permanent workaround.

A useful workflow is:

1. Reproduce the behavior.
2. Reduce it to the smallest practical case.
3. Record expected and actual behavior.
4. Determine whether the issue belongs to Bun Burner, Bitburner, documentation/types, the runtime/platform, or the test harness.
5. Add regression coverage where possible.
6. Fix Bun Burner when the defect belongs here.
7. Report or contribute upstream when the defect or missing capability belongs in Bitburner.
8. Keep only the smallest compatibility workaround that is actually required.
9. Remove the workaround when upstream support makes it unnecessary.

If you find an upstream problem but do not know how to prepare an upstream issue or pull request, open a Bun Burner issue with a clear reproduction and supporting evidence. We can help determine the correct layer and turn good evidence into an upstream-quality report when appropriate.

Bun Burner is an independent consumer of the Bitburner Remote API. It is not an official Bitburner reference implementation or official test suite.

## Planned obsolescence

Bun Burner's continued necessity is not a project goal.

If Bitburner or its officially supported tooling eventually provides Bun Burner's core workflow with comparable safety and usability, the project should recommend that solution instead of inventing reasons to preserve another software layer.

Bun Burner may then reduce scope, remove obsolete functionality, continue only where it offers distinct value, enter maintenance mode, or be archived.

If the project helps improve the Bitburner ecosystem enough that Bun Burner is no longer needed, that is a successful outcome.

## Local workflow

1. Create a focused development branch from `main`.
2. Install dependencies with `bun install --frozen-lockfile`.
3. Run `bun run init` to create `.env` from `.env.example` if absent. Existing configuration is preserved; new configuration defaults to sync disabled.
4. Make the smallest complete change and document public behavior in JSDoc. Update the README when setup, supported behavior, or usability changes.
5. Run the checks below and open a pull request explaining the problem, resulting behavior, and validation.

```sh
bun run verify
```

Use `bun run start` to launch the Bun adapter. Keep commits focused; separate tests when they remain understandable independently. Dependency changes should include the updated Bun lockfile; do not hand-edit it.

`verify` runs the diff check, tests and all three typechecks. `bun run verify:push` runs verification before a normal non-force push; ordinary `git push` remains available.

## Tests and game data

Use mocks and temporary directories for automated tests. Add regression coverage for behavioral fixes, especially request cleanup, response validation, conflict handling, and failed writes.

Do not treat a mock or simulated Remote API test as proof of live-game behavior.

Live synchronization can overwrite files. Test only with explicitly designated disposable local and game files. Never use another person's active scripts as test data. Keep `.env`, scripts, recovery state, machine-specific paths, and local integration findings out of commits.

When live behavior disagrees with automated assumptions, preserve the evidence before hiding the discrepancy behind compatibility code.

Useful integration findings include:

- Bitburner version/build
- Bun Burner commit
- OS/runtime
- exact reproduction steps
- Remote API method
- request and response shapes
- expected behavior
- actual behavior
- reproducibility
- documentation/type mismatch, if any
- suspected owning layer
- workaround, if any

Potential upstream findings should be characterized before speculative API changes are implemented.

The game API does not offer atomic compare-and-write. Preserve rechecks, recovery copies, serialized scans, and failure pauses; do not promise race-free synchronization or blindly retry uncertain writes.

## Ecosystem and alternatives

Other Bitburner external-development tools are ecosystem neighbors, not competitors.

Do not make negative or timeless claims about another project without firsthand evidence. When documenting alternatives, include the tested version/date where practical and distinguish objective behavior from personal workflow preference.

If another tool better fits a particular use case, it is acceptable and encouraged to recommend it.

Ideas and implementations from other projects must be used in accordance with their licenses. Give credit where appropriate and preserve third-party notices.

## AI-assisted development

This project uses AI-assisted development, including OpenAI Codex and ChatGPT.

AI assistance may be used for implementation, analysis, testing, research, review, and documentation. Contributions still require human review, appropriate tests, understandable behavior, and evidence that the change belongs in this project.

Do not use AI generation as a substitute for understanding or validating code that is merged.

## Game definitions and licensing

`NetscriptDefinitions.d.ts` is a versioned upstream snapshot, separate from the Remote API contracts. Do not edit it to fix connector types or refresh it automatically on connection. For deliberate updates, review the upstream diff and version, update the provenance/hash in `types/README.md`, preserve the upstream license, and run the game type check.

Original contributions are provided under the project's [MIT license](LICENSE). The bundled game declarations retain their [upstream license](types/BITBURNER-LICENSE.txt); see [provenance](types/README.md). Preserve third-party notices and identify any newly vendored code.
