# 🔥 Bun Burner

> Source-preserving two-way synchronization for Bitburner.
>
> `.js ⇄ .js` · `.jsx ⇄ .jsx` · `.ts ⇄ .ts` · `.tsx ⇄ .tsx`

Bun Burner is a small Bun/TypeScript bridge for editing Bitburner scripts with the external editor and Git workflow you already use, while keeping the source Bitburner understands intact.

No required transpilation. No required bundling. No automatic deletion propagation. No silent conflict winner.

> [!WARNING]
> **Beta software — v0.1.0-beta.1**
>
> Bun Burner is preparing for its first public beta. Core synchronization has been exercised against the Steam desktop build of Bitburner on Fedora Linux and Windows, but edge cases and untested environments may still behave unexpectedly.
>
> **No file-loss or automatic-deletion failure has been observed in current Bun Burner testing.** Bun Burner intentionally does not propagate deletions during normal synchronization. That is still not a guarantee against every possible bug, operating-system failure, editor interaction, or future regression.
>
> For your first run, **copy valuable scripts into a disposable or backed-up workspace rather than moving your only copy**. Keep important scripts under Git or another backup system until you are comfortable with the behavior on your machine.

> [!CAUTION]
> **OneDrive and other cloud-backed sync roots are not currently validated.**
>
> Windows testing observed transient `EBUSY` / file-busy behavior in a disposable OneDrive-backed workspace. Post-exit deletion succeeded, but the owning process and exact cause were not conclusively identified.
>
> This is an **unvalidated, non-blocking compatibility gap**, not a confirmed failure or support claim. Community testing is welcome with disposable or backed-up scripts. For the beta, prefer a normal local directory for `BUN_BURNER_SYNC_ROOT`.

---

## Quick navigation

- [Why Bun Burner?](#why-bun-burner)
- [Quick start](#-quick-start)
- [Install Bun](#1-install-bun)
- [Configuration](#-configuration)
- [How syncing works](#-how-syncing-works)
- [Safety and conflicts](#-safety-and-conflicts)
- [Validation status](#-validation-status)
- [Which external-editor tool should I use?](#-which-external-editor-tool-should-i-use)
- [Bitburner links](#-bitburner-links)
- [Game types and editor setup](#-game-types-and-editor-setup)
- [Verification and development](#-verification-and-development)
- [Roadmap](#-roadmap)
- [Contributing](#-community-and-contributing)
- [Project philosophy](#-project-philosophy)
- [License](#-license)

---

## Why Bun Burner?

Bun Burner started as a personal solution to a specific Bitburner development friction.

I wanted to:

- edit Bitburner scripts in the external editor and tools I already use;
- keep `.ts`, `.tsx`, `.js`, and `.jsx` source intact;
- keep my script workspace in Git like any other software project;
- move that repository between machines without making the game itself the only source of truth;
- keep synchronization separate from transpilation, compilation, bundling, and deployment;
- preserve ambiguous changes instead of silently deciding which copy wins;
- keep the core editor-independent and easy to understand.

That means a Bitburner script directory can remain an ordinary Git-tracked workspace that can be committed, branched, reviewed, backed up, hosted on GitHub or another Git service, and reused across machines.

### Ecosystem, not competition

Several excellent Bitburner external-editor and file-sync projects already exist.

**Bun Burner is not intended to replace them or compete with them.**

It is another implementation with a deliberately narrow set of tradeoffs, built because the workflows I personally tried did not quite match the workflow I wanted.

If another tool fits your workflow better, **use that tool**.

Bun Burner also has an unusual success condition: if Bitburner itself or officially supported tooling eventually provides this workflow with comparable safety and usability, Bun Burner should recommend the upstream solution, reduce its scope, or become unnecessary.

That would be a successful outcome.

---

## 🚀 Quick start

### 1. Install Bun

Bun Burner currently uses [Bun](https://bun.com/) as its maintained runtime.

This beta is verified with **Bun 1.4.2**. Git is required for the clone and verification commands below. Installing Bun on macOS does not imply that Bun Burner has been validated there.

#### Linux / macOS

```bash
curl -fsSL https://bun.sh/install | bash
```

#### Windows PowerShell

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

Verify the install:

```bash
bun --version
```

For other installation methods and current platform requirements, see the [official Bun installation documentation](https://bun.sh/docs/installation).

### 2. Clone Bun Burner

```bash
git clone https://github.com/NathanMartinez/bun-burner.git
cd bun-burner
bun install --frozen-lockfile
```

### 3. Initialize configuration

```bash
bun run init
```

`init` copies `.env.example` to `.env` only when `.env` does not already exist.

It is idempotent and **never overwrites an existing `.env`**.

For help:

```bash
bun run init --help
```

### 4. Review `.env`

Sync is disabled by default.

For a first test, the included `./scripts` workspace provides a dedicated starting point:

```dotenv
BUN_BURNER_SYNC_ENABLED=true
BUN_BURNER_SYNC_ROOT=./scripts
BUN_BURNER_SYNC_SERVER=home
```

> [!TIP]
> If you already have valuable Bitburner scripts, copy a few into the test workspace first. Do not make a brand-new beta sync tool the only place your important code exists.

### 5. Start Bun Burner

```bash
bun run start
```

### 6. Connect Bitburner

In Bitburner, open:

**Options → Remote API**

Use the defaults unless you changed them:

- **Host:** `127.0.0.1`
- **Port:** `12525`
- **Protocol:** `ws`

Then click **Connect**.

The default endpoint is:

```text
ws://127.0.0.1:12525
```

Bun Burner does not configure TLS/WSS.

---

## ⚙️ Configuration

Bun loads `.env` automatically.

| Variable | Default | Purpose |
| --- | --- | --- |
| `BUN_BURNER_HOST` | `127.0.0.1` | Local WebSocket listener address |
| `BUN_BURNER_PORT` | `12525` | Remote API listener port |
| `BUN_BURNER_SYNC_ENABLED` | `false` | Enables source synchronization when set to `true` |
| `BUN_BURNER_SYNC_ROOT` | `./scripts` | Existing local source directory to synchronize |
| `BUN_BURNER_SYNC_SERVER` | `home` | Bitburner server mapped to the local workspace |

Example:

```dotenv
BUN_BURNER_HOST=127.0.0.1
BUN_BURNER_PORT=12525
BUN_BURNER_SYNC_ENABLED=true
BUN_BURNER_SYNC_ROOT=./scripts
BUN_BURNER_SYNC_SERVER=home
```

For an existing external workspace:

```dotenv
BUN_BURNER_SYNC_ROOT=C:\Users\you\Development\bitburner-scripts
```

or:

```dotenv
BUN_BURNER_SYNC_ROOT=/home/you/Development/bitburner-scripts
```

Relative paths are resolved from the directory where Bun Burner is launched.

The configured sync root **must already exist**. Normal startup does not silently create a missing custom workspace.

If the configured root disappears or becomes inaccessible, synchronization pauses and reports the filesystem failure. Local disappearance does not imply permission to delete the game-side copy.

---

## 🔄 How syncing works

With synchronization enabled, Bun Burner maps supported files directly between the configured local root and one Bitburner server.

Example:

```text
local:
scripts/lib/hack.ts

game:
home → lib/hack.ts
```

The file remains `lib/hack.ts`.

Bun Burner does not generate a `.js` counterpart.

Supported source extensions:

- `.js`
- `.jsx`
- `.ts`
- `.tsx`

Excluded from synchronization include hidden paths, `node_modules`, `dist`, `out`, `coverage`, and `.d.ts` files.

### First connection

On the first connection:

- a file present only locally can be uploaded;
- a file present only in the game can be downloaded;
- different files that exist on both sides without a common baseline are treated conservatively;
- Bun Burner does not silently choose a winner.

### Synchronization baseline

Bun Burner records content hashes in:

```text
<sync-root>/.bun-burner/
```

Add `.bun-burner/` to the `.gitignore` of your own scripts repository.

The engine compares content, not modification timestamps.

Local content must be stable across scans before upload. Transfers are serialized, source is rechecked before overwrite, destination content is verified, and the baseline is only advanced after a verified transfer.

### Deletion behavior

**Deletion does not propagate automatically.**

If a tracked file disappears from one side, Bun Burner treats the absence as a conflict instead of assuming the other copy should be deleted.

The Remote API exposes a `deleteFile` method, but production synchronization does not use it.

---

## 🛡️ Safety and conflicts

Bidirectional synchronization becomes dangerous when both sides change.

Bun Burner follows a simple rule:

> **Safety over guessing.**

| State relative to the last synchronized baseline | Action |
| --- | --- |
| Only local changed | Upload |
| Only game changed | Download |
| Both contain the same content | Update baseline |
| Both changed differently | Preserve both and report conflict |
| Neither changed | Do nothing |
| Tracked file missing on one side | Report conflict; do not delete or restore automatically |

Recovery copies are stored beneath:

```text
<sync-root>/.bun-burner/
```

When a conflict is reported, compare the local file, game file, and recovery data, choose the version you want, then make both sides agree.

### Refresh an open Bitburner editor before saving

An already-open Bitburner editor tab may still show older source after an external edit has synced to the game. Saving that old buffer can replace the newer saved game source; Bun Burner then observes a game-side edit and downloads it.

To load the current saved source before editing or saving:

1. Preserve any unsaved edits you want to keep.
2. Click the **circular-arrows icon beside the filename**, immediately left of the tab's close button.
3. Read the confirmation and choose **Yes** to replace the editor contents with the file's contents on the server.
4. Check the refreshed source before editing or saving.

This sequence was tested with Bitburner Steam **3.0.1 (3162fd2) on Windows, September 13, 2026**. Saving a stale buffer restored its older contents; refreshing first loaded the externally synced version, and saving afterward preserved it. This is an observed editor workflow, not a confirmed defect in either Bitburner or Bun Burner. Refresh replaces the current editor buffer, including unsaved edits; it does not prevent a later concurrent edit.

### Simultaneous editing limitation

Bitburner 3.0.1's Remote API does not provide conditional writes against an expected file revision or a transactional file lock.

That means a remote read followed by a remote write cannot be made fully atomic.

Bun Burner reduces risk through rechecks, serialization, destination verification, recovery copies, and conservative conflict handling, but it cannot preserve a version it never had an opportunity to observe.

If you intentionally edit the same file simultaneously in two editors, treat the result as a conflict-prone workflow.

### Backups are still a good idea

Current testing has **not** observed Bun Burner unexpectedly deleting source files.

That does not make backups obsolete.

Bitburner's own Remote API documentation warns that mirroring / two-way-sync features in external tools can overwrite local work when configured incorrectly. Bun Burner's design is intentionally conservative, but beta users should still:

1. use a disposable workspace first;
2. copy rather than move valuable scripts into the initial test root;
3. keep important work in Git or another backup;
4. inspect conflict output instead of deleting `.bun-burner/` state to "fix" it.

---

## ✅ Validation status

Current development target:

- **Bitburner:** 3.0.1
- **Observed game build:** 3162fd2
- **Bun:** 1.4.2
- **TypeScript:** 7.0.2

| Environment / behavior | Status |
| --- | --- |
| Fedora 44 KDE + Steam Bitburner 3.0.1 | ✅ Manually validated |
| Windows x64 + Steam Bitburner 3.0.1 | ✅ Manually validated |
| Local → game source sync | ✅ Live Steam validation and automated coverage |
| Game → local source sync | ✅ Live Steam validation and automated coverage |
| `.js/.jsx/.ts/.tsx` source and extension preservation | ✅ Live validation and automated coverage |
| Relative sync roots | ✅ Manually validated |
| Normal native absolute local roots | ✅ Manually validated; automated path coverage |
| Conflicts / recovery | ✅ Manually validated and automated coverage |
| Missing-root handling | ✅ Live Windows and automated validation |
| Graceful Ctrl+C / lock release | ✅ Windows manual validation |
| Restart / reconnect | ✅ Windows manual validation |
| Explorer rename/delete after Bun Burner exits | ✅ Windows manual validation; Zed's workspace also had to be closed in the observed rename case |
| Windows ACL denial handling | ✅ Automated |
| Windows automated verification | ✅ 42 passed, 2 POSIX-only skips, 0 failed |
| Disappearing root while live on Windows | ✅ Paused with actionable ENOENT; root not recreated; game file retained |
| Built-in editor refresh then save | ✅ Live Windows validation; see refresh guidance above |
| OneDrive / cloud-backed roots | ⚠️ Unvalidated, non-blocking; community testing welcome |
| Browser Bitburner | ❌ Not yet validated or supported |
| macOS | ❌ Not yet validated |
| Other Linux distributions | ❌ Not yet personally validated |

Automated, simulated, and live-game evidence are intentionally treated as different evidence classes.

A green unit test does not get relabeled as live Bitburner validation.

WebSocket integration tests use a simulated game. GitHub Actions checks Linux and Windows automation; hosted CI is separate from the manual Steam results above. Cloud-folder probes observed transient `EBUSY`, but did not establish ownership or complete healthy OneDrive validation.

---

## 🧰 Which external-editor tool should I use?

Bun Burner is one option in a larger Bitburner external-development ecosystem.

The goal of this comparison is **not to declare a winner**.

It is to help you choose the workflow that fits your needs.

### Evidence labels

- **Upstream says:** capability documented by that project's own current documentation.
- **Personally tested:** something I actually exercised myself.
- **Not personally tested:** no claim is being made about whether it works.

| Tool | Good fit for | Upstream-documented strengths | Personally tested |
| --- | --- | --- | --- |
| **Bun Burner** | Exact-source two-way sync, Git-tracked source workspaces, conservative conflicts | Source-preserving `.js/.jsx/.ts/.tsx`, bidirectional create/update sync, recovery and conflict preservation | ✅ Fedora 44 and Windows |
| **bb-external-editor** | Rich build tooling, bundling, transformations, npm imports, debugging-oriented workflows | Uses esbuild to transpile and bundle; supports JS, TS, React and browser-compatible npm imports | ✅ Fedora 44; worked, but TS source was not preserved as TS in-game |
| **BitburnerGoFilesync** | Minimal standalone binary with little setup | Official Bitburner docs describe it as a minimal standalone CLI with no third-party setup | ⚠️ Fedora 44 tested; two-way behavior was **not** personally confirmed |
| **bitburner-filesync** | Official, simple disk-to-game synchronization | Official synchronization utility; documents Electron/Steam and website support | ❌ Not personally tested |
| **Viteburner** | Vite-based transforms, richer development workflow, RAM monitoring and interactive tooling | Vite transforms, file sync, manual upload/download, RAM monitoring, plugins, interactive CLI | ❌ Not personally tested |
| **TypeScript template** | Official starter workflow for transpiled TypeScript development | Official template combining TypeScript compilation with Remote File API synchronization | ❌ Not personally tested as a comparison target |

> [!NOTE]
> A feature documented upstream is not treated as personally verified unless I actually exercised it.
>
> Exact versions and test dates should accompany detailed personal comparisons whenever that information can be established. If the historical tested version cannot be proven, Bun Burner documentation should say so instead of guessing.

### Neighboring projects and credit

These projects helped shape the Bitburner external-editor ecosystem and deserve direct credit:

- [Bitburner Remote API community-tools list](https://github.com/bitburner-official/bitburner-src/blob/dev/src/Documentation/doc/en/programming/remote_api.md)
- [bitburner-filesync](https://github.com/bitburner-official/bitburner-filesync)
- [Bitburner TypeScript template](https://github.com/bitburner-official/typescript-template)
- [Viteburner](https://github.com/Tanimodori/viteburner)
- [bb-external-editor](https://github.com/shyguy1412/bb-external-editor)
- [BitburnerGoFilesync](https://github.com/CTNOriginals/BitburnerGoFilesync)

If one of these tools better matches your workflow, use it.

Bun Burner is not trying to own the solution. It is trying to make one particular workflow simple, safe, and transferable.

---

## 🎮 Bitburner links

Bun Burner is an independent community project built against Bitburner's Remote API.

- [Bitburner source repository](https://github.com/bitburner-official/bitburner-src)
- [Play Bitburner in the browser](https://bitburner-official.github.io/)
- [Bitburner on Steam](https://store.steampowered.com/app/1812820/Bitburner/)
- [Official Remote API documentation and community tools](https://github.com/bitburner-official/bitburner-src/blob/dev/src/Documentation/doc/en/programming/remote_api.md)
- [Bitburner 3.0.1 release](https://github.com/bitburner-official/bitburner-src/releases/tag/v3.0.1)

If Bun Burner testing exposes a problem that belongs in Bitburner rather than Bun Burner, the preferred outcome is to reproduce it clearly and help move the fix upstream.

---

## 🧩 Current functionality

- Opt-in two-way source create/update synchronization.
- Exact source preservation for JS, JSX, TS, and TSX.
- Configurable local scripts directory mapped to one game server.
- Sequential polling and transfers.
- Persisted SHA-256 content baseline.
- Conflict reporting and recovery copies.
- Local workspace ownership locking.
- Stable-read checks before upload.
- Destination read-back verification.
- No production deletion propagation.
- Typed Remote API wrapper for all eleven Bitburner 3.0.1 methods.
- Numeric request IDs and out-of-order response handling.
- 30-second RPC timeout.
- Disconnect cleanup.
- Bitburner string errors and JSON-RPC-style error objects.
- Response-envelope validation.
- UTF-8 binary-frame decoding.
- Unknown / late reply IDs ignored when otherwise valid.

### Typed Remote API methods

| Method | Result |
| --- | --- |
| `getFileNames` | `string[]` |
| `getFile` | `string` |
| `getFileMetadata` | normalized metadata object |
| `pushFile` | `"OK"` |
| `deleteFile` | `"OK"` |
| `getAllFiles` | file/content array |
| `getAllFileMetadata` | metadata array |
| `calculateRam` | `number` |
| `getDefinitionFile` | `string` |
| `getSaveFile` | save payload |
| `getAllServers` | server summary array |

`pushFile` and `deleteFile` mutate game files when called directly.

Enabled synchronization uses `pushFile`.

The synchronization engine **never calls `deleteFile`**.

The API contract targets the [Bitburner 3.0.1 Remote API implementation](https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/RemoteFileAPI/MessageDefinitions.ts).

---

## 🧪 Verification and development

Run the complete local verification pipeline:

```bash
bun run verify
```

It runs:

```text
git diff --check
bun test
bun run typecheck
bun run typecheck:core
bun run typecheck:game
```

and then prints platform information plus Git status/log context.

For a verified normal push:

```bash
bun run verify:push
```

`verify:push` runs verification first and only then performs an ordinary non-force `git push`.

It does not install a Git hook and does not prevent normal `git push`.

### Individual checks

```bash
bun test
bun run typecheck
bun run typecheck:core
bun run typecheck:game
```

CI runs Linux and Windows checks on pushes and pull requests.

The test suite includes:

- RPC lifecycle behavior;
- response ordering;
- timeouts and disconnects;
- malformed responses;
- all eleven Remote API validators;
- configuration;
- reconciliation;
- conflicts and recovery;
- source-text preservation;
- missing roots;
- path handling;
- workspace locking;
- Windows ACL denial fixtures;
- shutdown/restart lifecycle;
- WebSocket sync against a simulated game;
- verification tooling;
- initialization behavior.

Live Steam testing is tracked separately from mocks and simulations.

---

## 🧱 Project structure

```text
src/
  index.ts               Bun WebSocket server and connection lifecycle
  config.ts              validated listener and sync settings
  core.ts                runtime-neutral core exports
  rpc/
    client.ts            generic RPC request lifecycle
    types.ts             transport and pending-request contracts
  bitburner/
    client.ts            typed Remote API calls and result validation
    types.ts             Remote API contracts
  sync/
    engine.ts            reconciliation and transfer decisions
    local.ts             local filesystem adapter
    remote.ts            Bitburner Remote API adapter
    run.ts               polling and synchronization lifecycle

tools/
  init.ts                small initialization CLI
  verify.ts              cross-platform release verification
  verify-push.ts         verified push convenience command

tests/
  ...                    unit, filesystem, WebSocket, CLI, and lifecycle tests

scripts/
  ...                    default user script workspace

docs/
  design-philosophy.md   project design principles and scope

.env.example             configuration defaults
```

---

## 🧠 Game types and editor setup

[`NetscriptDefinitions.d.ts`](./NetscriptDefinitions.d.ts) is the checked-in source of truth for the in-game Netscript API definitions used by this repository.

It is separate from Bun Burner's Remote API types.

See [`types/README.md`](./types/README.md) for provenance and licensing.

Example game script:

```ts
import type { NS } from "@ns";

export function main(ns: NS): void {
  ns.tprint(ns.getHostname());
}
```

The included `scripts/tsconfig.json` supports the default workspace.

Type-check game scripts without emitting JavaScript:

```bash
bun run typecheck:game
```

JavaScript can use the same definitions with JSDoc:

```js
/** @param {import("@ns").NS} ns */
export function main(ns) {
  ns.tprint(ns.getHostname());
}
```

For an external workspace, create a `tsconfig.json` there that extends this repository's `tsconfig.game.json` and selects your own source tree.

Changing `BUN_BURNER_SYNC_ROOT` does not automatically configure your external editor.

The definitions file and tsconfig files are not uploaded by source synchronization.

---

## 🔐 Local-network and data-safety notes

Bun Burner listens on `127.0.0.1` by default.

That keeps the normal listener bound to the local machine.

Do not expose the Remote API listener to an untrusted network unless you understand the consequences.

Bun Burner can write local files and game files when synchronization is enabled.

For beta testing:

- begin with disposable or copied scripts;
- keep important source under Git or another backup;
- use a normal local filesystem workspace;
- avoid OneDrive/cloud roots until that behavior is better characterized;
- review conflicts instead of manually deleting state files;
- do not run multiple Bun Burner instances against the same workspace.

See [SECURITY.md](./SECURITY.md) for the short security and data-safety policy.

---

## 🗺️ Roadmap

The core is intentionally small.

Possible future areas include:

- browser-version support;
- improved conflict UX;
- optional status UI or TUI;
- editor integrations;
- remote-debugging experiments;
- standalone Windows/Linux/macOS distributions;
- additional runtime adapters;
- Remote API diagnostics that can produce upstream-quality bug reports.

These are **areas of interest, not release promises**.

See [ROADMAP.md](./ROADMAP.md).

---

## 🤝 Community and contributing

Feedback is welcome from:

- Bitburner players;
- Bitburner maintainers and contributors;
- developers and maintainers of external-editor / file-sync tools;
- Windows, Linux, and macOS users;
- browser-version users;
- editor-extension authors;
- anyone interested in breaking the beta in useful, reproducible ways.

Issues, bug reports, compatibility reports, feature discussions, documentation improvements, and pull requests are welcome.

If a finding belongs in Bitburner rather than Bun Burner, that is still useful.

The preferred path is:

```text
observe
→ reproduce
→ isolate
→ determine ownership
→ test
→ document
→ contribute upstream when appropriate
→ keep the smallest necessary workaround
→ remove the workaround when no longer needed
```

Start with:

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [Design philosophy](./docs/design-philosophy.md)
- [Open an issue](https://github.com/NathanMartinez/bun-burner/issues)

Bun Burner's original code is MIT licensed. Reuse it under that license if it is useful to another Bitburner tool.

Feedback from neighboring tool maintainers is especially welcome.

---

## 🧭 Project philosophy

A few rules guide Bun Burner:

- **Source synchronization is not a build system.**
- **Safety over guessing.**
- **Keep the core small.**
- **Solve problems at the correct layer.**
- **Editor-specific behavior belongs in editor integrations.**
- **Presentation belongs in optional clients.**
- **Upstream problems should be fixed upstream when practical.**
- **Ecosystem, not competition.**
- **Evidence over assumptions.**
- **Planned obsolescence is a valid success condition.**

The full rationale lives in:

[**docs/design-philosophy.md**](./docs/design-philosophy.md)

Bun Burner is scaffolding.

If the Bitburner ecosystem eventually makes it unnecessary, the project has succeeded.

---

## 🤖 AI-assisted development

Bun Burner uses AI-assisted development, including OpenAI Codex and ChatGPT.

AI may assist with implementation, analysis, testing, research, review, and documentation.

Project requirements, architectural direction, acceptance criteria, validation, and release decisions remain human-reviewed.

The goal is not to obscure how the software was produced. The goal is to build, understand, test, and maintain it responsibly regardless of which tools helped write it.

---

## 📜 License

Bun Burner's original code is licensed under the [MIT License](./LICENSE).

The bundled `NetscriptDefinitions.d.ts` retains Bitburner's own upstream license rather than being relicensed as MIT.

See:

- [`types/README.md`](./types/README.md)
- [`types/BITBURNER-LICENSE.txt`](./types/BITBURNER-LICENSE.txt)

Bitburner itself and neighboring external-editor tools are independent projects with their own licenses and maintainers.

---

## Current beta scope

The first beta targets the **Steam desktop version of Bitburner on Linux and Windows**.

Browser/web builds are not yet validated or supported by Bun Burner. This is **not** a claim that they are broken.

macOS has not yet been validated.

Cloud-backed roots such as OneDrive are **unvalidated and non-blocking** for this beta. Compatibility reports using disposable or backed-up scripts are welcome.

Those gaps are intentional targets for community testing rather than hidden assumptions.
