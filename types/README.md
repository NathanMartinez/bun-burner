# Game definitions

`../NetscriptDefinitions.d.ts` is an unchanged copy of Bitburner's Netscript declarations from tag `v3.0.1`:

https://github.com/bitburner-official/bitburner-src/blob/v3.0.1/src/ScriptEditor/NetscriptDefinitions.d.ts

SHA-256 of the repository blob (LF line endings): `bfabb0f495cc89133ba042420f5d6d514c7f068502565e3bc5f90da5e60242ed`. Git may convert line endings in a Windows checkout, changing the working-file hash without changing the repository blob.

The accompanying upstream license is preserved in `BITBURNER-LICENSE.txt`. It applies to the upstream declarations; it does not select a license for this connector's original code.

These declarations describe in-game `NS` APIs. They are separate from our Remote API contracts in `src/bitburner/types.ts`. They contain React stand-in types, not a complete React/JSX typing package.

The checked-in snapshot is authoritative for the game-script type-check configuration. Use `import type { NS } from "@ns"`; this import is erased by the game's TypeScript transformation. The alias is for type imports only, not executable game modules.

`getDefinitionFile` can retrieve declarations from a connected game, but connection startup does not download or overwrite this file. A future refresh should fetch into a temporary file, review the diff and game version, run the game type-check, and commit the deliberate update. Do not silently change developers' types during a connection.
