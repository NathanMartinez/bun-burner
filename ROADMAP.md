# 🔥 Bun Burner Roadmap

> This document describes areas of interest, not release promises.

Bun Burner intentionally keeps its core small.

A feature belongs here only when it removes demonstrated friction, improves safety or observability, helps the Bitburner ecosystem, or provides a useful compatibility bridge that cannot reasonably live at a better layer.

See [`docs/design-philosophy.md`](./docs/design-philosophy.md) for the full project philosophy.

---

## Guiding rules

Before adding a feature, ask:

1. Is this solving a real problem?
2. Is Bun Burner the correct layer to solve it?
3. Could an editor integration, optional client, neighboring tool, or Bitburner itself solve it better?
4. Does it preserve a small and understandable synchronization core?
5. Can an upstream improvement eventually remove the need for this feature?

Sometimes the correct feature is no feature.

---

## Near-term beta work

### Compatibility evidence

Expand real-world validation beyond the current Linux and Windows Steam testing.

Interested environments include:

- additional Linux distributions;
- macOS;
- Windows configurations not already exercised;
- alternative editors;
- cloud-backed workspaces;
- Bitburner's browser build.

Compatibility reports are useful even when they do not include code changes.

### Documentation and onboarding

Continue improving:

- installation instructions;
- configuration diagnostics;
- first-run guidance;
- issue templates;
- compatibility-report templates;
- contribution workflow;
- release notes.

---

## Areas of interest

### 🌐 Browser-version support

Investigate first-class support for the browser version of Bitburner.

The current beta targets Steam desktop.

Browser work should begin by understanding how the existing Remote API behaves in the web build rather than assuming the desktop workflow transfers directly.

Contributions from developers familiar with Bitburner's browser Remote API are especially welcome.

Where possible, improvements that belong in Bitburner should be proposed upstream.

---

### 🧩 Better conflict presentation

Bun Burner already preserves ambiguous conflicts rather than silently picking a winner.

A future optional interface could make those conflicts easier to understand by presenting:

- local content;
- game-side content;
- last synchronized baseline;
- recovery-copy location;
- recent transfer history;
- an explicit user choice when manual resolution is appropriate.

This is a presentation-layer problem and should not make a GUI framework part of the synchronization core.

#### Built-in Bitburner editor buffers

Windows testing with Bitburner 3.0.1 reproduced an open editor buffer retaining older source after an external update. Saving that buffer restored its older contents; refreshing from the server before saving preserved the newer source. See the [tested refresh workflow](./README.md#refresh-an-open-bitburner-editor-before-saving).

This is documented editor/save behavior, not a confirmed defect in either application.

If the limitation belongs to Bitburner or its Remote API, upstream improvement is preferred.

A Bun Burner workaround or conflict prompt should only be added when real evidence demonstrates that it removes useful friction without creating a second source of truth.

---

### 🐛 Remote debugging

Explore debugging integrations for users who want more than source synchronization.

Possible work may include:

- connecting to supported debugging facilities exposed by the Steam/Electron build;
- surfacing useful runtime diagnostics;
- editor-specific debugging adapters;
- better error navigation.

Debugging should remain optional and should not become a dependency of basic synchronization.

Neighboring projects already provide richer debugging/build workflows, and users should be pointed toward them when they are a better fit.

---

### 🖥️ Optional status UI / TUI

Explore a lightweight interface that can display:

- WebSocket connection state;
- configured sync root;
- selected game server;
- recent transfers;
- conflicts;
- paused-sync reasons;
- recovery-copy locations;
- current version;
- validation / diagnostic information.

Possible forms include:

- terminal UI;
- small native/webview application;
- editor integration;
- local dashboard.

The synchronization engine must remain usable without any of them.

---

### 📦 Standalone distributions

Investigate distributable Windows, Linux, and macOS builds so users can run Bun Burner without manually setting up a development environment.

Bun itself supports compiling applications into standalone executables, so that should be evaluated before introducing a large desktop framework.

Electron, a lightweight webview shell, native wrappers, or Bun-compiled executables may all be explored.

No framework is selected yet.

The goal is lower setup friction, not a larger application for its own sake.

---

### ✏️ Editor integrations

Optional editor-specific integrations may provide:

- connection state;
- sync status;
- conflict notifications;
- manual transfer commands;
- diagnostics;
- quick access to recovery copies.

Editor-specific logic should remain outside the synchronization core.

A useful Zed, VS Code, Neovim, or other editor integration should consume stable Bun Burner interfaces rather than redefine synchronization semantics.

---

### 🔌 Runtime adapters and reusable core

The core RPC and synchronization boundaries are intentionally separated from the Bun WebSocket server.

Future contributors may experiment with:

- alternative runtimes;
- reusable library packaging;
- external clients;
- test harnesses.

The repository does not need a multi-runtime launcher framework merely because the abstraction exists.

Add an adapter when someone actually needs one.

---

### 🧪 Upstream Remote API diagnostics

Bun Burner can serve as an independent real-world consumer of Bitburner's Remote API.

Useful future diagnostics may make it easier to produce:

- minimal Remote API reproductions;
- protocol traces with sensitive content removed;
- compatibility matrices;
- upstream bug reports;
- regression tests suitable for contribution to Bitburner.

Bun Burner is not an official Bitburner test suite.

If a bug belongs in Bitburner, helping fix Bitburner is preferable to permanently growing compatibility code here.

---

### ☁️ Cloud-backed filesystems

OneDrive/cloud-backed roots are currently **unvalidated and non-blocking** for v0.1.0-beta.1. Community compatibility testing with disposable or backed-up scripts is welcome; this is not a support or failure claim.

Transient Windows `EBUSY` behavior has been observed during disposable OneDrive testing, but handle ownership was not conclusively identified.

Future work should focus on evidence:

1. reproduce reliably;
2. identify the owning layer;
3. compare ordinary filesystem behavior;
4. determine whether Bun Burner is retaining a resource incorrectly;
5. only then decide whether a local fix or documentation change is appropriate.

No cloud-specific workaround should be added from guesswork.

---

## Things intentionally outside the core

Unless evidence changes the requirement, Bun Burner is not trying to become:

- a general JavaScript/TypeScript build system;
- an npm bundler;
- a deployment orchestrator;
- a frontend framework;
- a mandatory editor extension;
- a giant plugin framework;
- a Bitburner automation framework;
- a replacement for every neighboring external-editor tool.

Projects such as Viteburner and bb-external-editor already cover richer transformation/build workflows.

Bun Burner should recommend them when that is the better answer.

---

## Planned obsolescence

Bun Burner's continued necessity is not a project goal.

If Bitburner itself or officially supported tooling eventually provides Bun Burner's core workflow with comparable safety and usability, Bun Burner should:

- recommend the upstream solution;
- remove obsolete compatibility code;
- reduce scope;
- continue only where it provides independently useful value;
- enter maintenance mode;
- or be archived.

If the Bitburner ecosystem improves enough that Bun Burner is no longer needed, the project has succeeded.
