# Dynamic Chip Module Loading (post‑MVP)

Status: proposed

Summary
-------
Add a runtime mechanism to select and load audio chip backends (e.g. `gameboy`, `nes`, `sid`) based on a top-level `chip` directive in the source AST. This feature is intentionally post‑MVP: the parser already accepts `chip <name>` and the `Player` currently validates the directive and defaults to `gameboy`. This spec documents the requirements and design for implementing dynamic chip module selection and safe loading in a future iteration.

Motivation
----------
- Allow the language to be multi‑chip: the same song language should target different audio backends.
- Keep parsing and AST stable: `chip` is part of AST and used to pick a backend at playback/export time.
- Make it straightforward to add new chips (plug‑in style) without changing core scheduling or parser semantics.

Requirements
------------
1. The runtime must select a chip backend based on `ast.chip` (string). If absent, default to `gameboy` (current behavior).
2. Supported chips correspond to folders under `src/chips/<chip>/` containing the expected runtime API.
3. The loader must fail fast with a clear error when a requested chip isn't available.
4. The loader must expose a stable minimal API the Player relies on (see API section).
5. Loading should support both ESM dynamic `import()` and a synchronous fallback (for bundlers that prefer static imports).
6. Keep security/safety in mind: evaluate unknown / third‑party chips before loading in privileged/CI contexts.

Design & API
-----------
Public contract (minimal): each chip module folder must export the following:

- `apu` helpers
  - `noteNameToMidi(note:string, octave:number): number | null`
  - `midiToFreq(midi:number): number`

- channel drivers (per fixed channels for the chip) or a generic channel factory:
  - For Game Boy, existing modules: `pulse`, `wave`, `noise` functions return arrays of created AudioNodes when scheduled.
  - A common adapter interface will be defined so `Player` can call `chip.playNote(channelId, ctx, noteSpec, time, dur, inst)` and receive created nodes.

- capability flags (optional): `supportsEnvelope`, `supportsWaveRam`, `channelCount` etc.

Loader behavior
---------------
1. At Player initialization or at `playAST` time, inspect `ast.chip`.
2. Map the chip name to a module path `../chips/${chip}/index` (or a registry) and attempt dynamic import: `const chipMod = await import(modulePath)`.
3. Validate `chipMod` exports the minimal API surface. If not, throw a descriptive error.
4. Provide an adapter layer that maps chip API to Player scheduling calls. Example:

```ts
// pseudocode
const chipMod = await import(`../chips/${chip}/index`);
if (!chipMod || typeof chipMod.createChannel !== 'function') throw new Error(...);
const channels = chipMod.createChannels(audioCtx, /*options*/);
// later when scheduling:
channels[chanId].playNote({ midi, freq, time, dur, inst });
```

Fallbacks & bundler considerations
---------------------------------
- Where dynamic `import()` is unavailable or bundlers require static imports, provide a compile-time registry (`src/chips/registry.ts`) that exports known chips. The Player can fall back to: `const chipMod = registry[chip]`.
- For third‑party plugin chips (outside the repo), provide a documented plugin API and a registration mechanism (e.g., `registerChip('mychip', chipModule)`). This enables runtime registration in host apps.

Security & Safety
-----------------
- Loading arbitrary code should be done only in trusted hosts. CI/test environments should avoid auto-loading untrusted chips.
- Document recommended vetting for third‑party chips (code review, minimal API surface, no network access).

Tests & Acceptance Criteria
--------------------------
1. Unit test: requesting a supported chip returns a module with the expected API (mock the dynamic import or use the static registry).
2. Unit test: requesting an unsupported chip throws a descriptive error.
3. Integration test: a simple `.bax` with `chip gameboy` plays through the Player using the Game Boy module via the new loader (OfflineAudioContext can be used for headless testing).

Migration notes
---------------
- The parser already emits `ast.chip`. The Player currently validates and defaults to `gameboy`. Implementing this feature requires changes mainly in `src/audio/playback.ts` (chip loader/adapter) and the addition of an optional `src/chips/registry.ts` to support bundlers.

Implementation plan (high level)
-------------------------------
1. Define adapter interface and a minimal `src/chips/index.ts` that exports a registry for known chips.
2. Implement dynamic loader in `src/audio/playback.ts` that tries `import()` then falls back to registry.
3. Update Player initialization to create channel adapters from loaded chip module and use them in scheduling logic.
4. Add tests and documentation in `docs/features/` (this file).

Notes
-----
This document is intentionally forward looking — it should be used as the authoritative spec when adding multi‑chip runtime support after the MVP scope is complete.
