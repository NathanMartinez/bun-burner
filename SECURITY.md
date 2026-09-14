# Security and Data Safety

Bun Burner is a local development tool that can read and write source files.

This document is intentionally short.

## Default network scope

Bun Burner listens on:

```text
127.0.0.1:12525
```

by default.

That binds the normal listener to the local machine.

Do not expose Bun Burner's listener to an untrusted network unless you understand the consequences of allowing a Bitburner Remote API connection to reach it.

TLS/WSS is not currently configured by Bun Burner.

## File writes

When synchronization is enabled, Bun Burner can:

- write supported source files into the configured local sync root;
- upload supported source files into Bitburner.

Production synchronization does **not** automatically propagate deletion.

A tracked file missing from one side is treated as a conflict rather than permission to delete the other copy.

## Beta precautions

Current testing has not observed unexpected source-file deletion by Bun Burner.

That is not a guarantee against every possible software, operating-system, editor, or filesystem failure.

For first-time beta testing:

1. use a disposable workspace or copied scripts;
2. do not move the only copy of valuable work into a new sync root;
3. keep important scripts in Git or another backup;
4. prefer an ordinary local filesystem path;
5. avoid OneDrive/cloud-backed roots until they are better characterized;
6. review conflicts instead of deleting `.bun-burner/` state;
7. do not run multiple Bun Burner instances against the same workspace.

## Cloud-backed directories

OneDrive and other cloud-backed sync roots are **unvalidated and non-blocking** for v0.1.0-beta.1. Community testing with disposable or backed-up scripts is welcome; no support or confirmed-failure claim is made.

Transient Windows `EBUSY` / file-busy behavior was observed during disposable OneDrive testing.

Post-exit deletion succeeded, but the owning process and exact cause were not conclusively identified.

Use a normal local sync root for the beta unless you are intentionally helping test cloud-backed behavior.

## Reporting a security or data-safety problem

If you find behavior that could unexpectedly destroy, expose, or corrupt user data, please stop using the affected workflow and report it with the smallest safe reproduction you can provide.

GitHub issues:

https://github.com/NathanMartinez/bun-burner/issues

Please avoid posting secrets, private source code, authentication material, or unrelated personal files in public issue logs.

## Scope

Bun Burner is not a sandbox against hostile software running on the same machine.

It cannot prevent another editor, process, filesystem driver, synchronization service, or user action from modifying files while synchronization is running.

Its safety guarantees apply to Bun Burner's own synchronization decisions, not arbitrary external filesystem mutation.
