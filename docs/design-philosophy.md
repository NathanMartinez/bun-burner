# Bun Burner Design Philosophy

## Why Bun Burner exists

Bun Burner started as a personal solution to a specific Bitburner development
friction.

I wanted to edit Bitburner scripts in the external tools I already use while
preserving the source that Bitburner itself understands:

- `.js` remains `.js`
- `.jsx` remains `.jsx`
- `.ts` remains `.ts`
- `.tsx` remains `.tsx`

I also wanted synchronization to be easy to understand, safe when both sides
change, and independent from a particular editor or build system.

Several excellent Bitburner external-editor and file-sync projects already
exist. Bun Burner is not intended to replace them or compete with them.

It is simply another implementation with a different set of tradeoffs,
created because the existing workflows I tried did not quite match the workflow
I wanted.

If another tool better fits a user's needs, use it.

## Source synchronization, not a build system

Bun Burner synchronizes source files.

It does not transpile, compile, bundle, or rewrite game scripts as part of the
sync pipeline.

Bitburner already supports JavaScript, TypeScript, JSX, and TSX. Bun Burner's
job is to preserve those sources, not transform them into something else.

Build systems and frontend toolchains are separate concerns.

## Safety over guessing

Bidirectional synchronization becomes dangerous when both sides change.

Bun Burner should not silently decide which version of a user's work is more
important.

When the correct action is ambiguous, the preferred behavior is to preserve
both sides, report the conflict clearly, and let the user decide.

A sync tool should make destructive behavior difficult to trigger accidentally.

## Minimalism

Bun Burner should not justify its existence by accumulating features.

Features should be added because they remove demonstrated friction, not because
they make the feature list longer.

Before adding a capability, ask:

1. Is this solving a real problem?
2. Is Bun Burner the correct layer to solve it?
3. Could the problem be solved more appropriately in an editor integration,
   reusable library, another external tool, or Bitburner itself?
4. Does the change preserve a small, understandable core?
5. Could an upstream improvement remove the need for this feature entirely?

Sometimes the correct feature is no feature.

## The correct layer matters

Bun Burner should own problems that genuinely belong to Bun Burner.

Editor-specific behavior should usually live in editor integrations.

Presentation layers such as dashboards and TUIs should consume stable
interfaces rather than becoming dependencies of the synchronization core.

React, Svelte, Vue, and other frontend frameworks are not core Bun Burner
dependencies.

Bitburner itself supports React-based JSX/TSX workflows, and contributors are
welcome to experiment with optional dashboards, editor extensions, or other
clients when those projects solve useful problems.

Those experiments should not make a frontend framework necessary to use the
core synchronization tool.

## Upstream first

When Bun Burner exposes a limitation in Bitburner, the first question should
not be:

> How can Bun Burner permanently work around this?

The first question should be:

> Where does this problem actually belong?

The preferred workflow is:

observe -> reproduce -> isolate -> determine ownership -> test -> document ->
contribute upstream when appropriate -> keep the smallest necessary workaround
-> remove the workaround when it is no longer needed.

Bun Burner can therefore serve as an independent real-world consumer of the
Bitburner Remote API and help expose behavior that external tooling encounters.

It is not an official Bitburner reference client or test suite.

When findings belong upstream, improving Bitburner is preferable to permanently
growing Bun Burner around the limitation.

## Planned obsolescence

Bun Burner's continued necessity is not a project goal.

Where Bitburner itself can provide the workflow Bun Burner exists to enable,
improving Bitburner is the better outcome.

Bun Burner is scaffolding.

It can provide useful functionality while gaps exist, help characterize those
gaps, and provide a place to experiment with solutions.

If Bitburner's native or officially supported tooling eventually provides Bun
Burner's core workflow with comparable safety and usability, Bun Burner should
recommend the upstream solution.

At that point the project may:

- remove obsolete functionality
- reduce its scope
- continue as a reusable library or test client where independently useful
- move genuinely different experiments into separate projects
- enter maintenance mode
- or be archived

Users should not be asked to install another software layer when that layer no
longer provides meaningful value.

If improvements to the Bitburner ecosystem eventually make Bun Burner
unnecessary, that is the intended success condition.

## Ecosystem, not competition

Other Bitburner development tools are ecosystem neighbors.

Bun Burner should document alternatives honestly and recommend them when they
better match a user's workflow.

Comparisons should be based on firsthand testing rather than assumptions.

Where useful, testing should consider:

- installation and setup friction
- configuration requirements
- source preservation
- local-to-game synchronization
- game-to-local synchronization
- conflict behavior
- recovery behavior
- observability
- type-definition workflows
- platform support
- strengths
- limitations
- workflows each tool serves best

Version numbers and testing dates should accompany detailed comparisons because
other projects continue to evolve.

The goal is not to declare a winner.

The goal is to help users choose the workflow that works best for them and to
learn from the surrounding ecosystem.

## Contributions

Contributions are welcome when they improve Bun Burner while preserving its
core principles.

Contributors are also encouraged to improve the wider Bitburner ecosystem.

If work on Bun Burner exposes a problem that belongs upstream, contributors are
welcome to report or fix it in Bitburner directly.

If someone discovers an upstream problem but does not know how to prepare an
upstream contribution, opening a Bun Burner issue with a clear reproduction is
still useful. We can help determine the correct layer and turn good evidence
into an upstream-quality report where appropriate.

Forks, experiments, integrations, and alternative interfaces are welcome under
the applicable licenses.

Bun Burner's original code is MIT licensed. Upstream-derived material retains
its respective license.

## Evidence over assumptions

Automated tests, simulated servers, and mocks are useful, but they do not prove
that Bitburner itself behaves the same way.

Documentation should distinguish between:

- behavior verified by automated tests
- behavior verified against a simulated Remote API
- behavior verified against the actual game
- planned behavior that has not yet been implemented or validated

When reality disagrees with our assumptions, reality wins.

Unexpected Bitburner behavior should be reproduced and documented before it is
hidden behind compatibility code.

## AI-assisted development

Bun Burner uses AI-assisted development, including OpenAI Codex and ChatGPT.

AI may assist with implementation, analysis, testing, research, review, and
documentation.

Project requirements, architectural direction, acceptance criteria, validation,
and release decisions remain human-reviewed.

The goal is not to obscure how the software was produced. The goal is to build,
understand, test, and maintain software responsibly regardless of which tools
helped write it.

## Long-term direction

Bun Burner's core should remain small and predictable.

Stable interfaces may eventually support things such as:

- editor integrations
- dashboards
- TUIs
- reusable libraries
- alternative runtime adapters
- development or diagnostic tools around the Bitburner Remote API

These are possibilities, not obligations.

They should be pursued when real users or contributors demonstrate a need for
them.

The project should remain willing to say:

> That's a good idea, but it belongs somewhere else.

That is not rejecting progress.

It is protecting the layer where progress belongs.
