# BeatBax Constitution

**Version**: 1.0.0 | **Ratified**: 2026-09-03 | **Last Amended**: 2026-09-03

This document is binding on all specifications, plans, tasks, and implementations. Feature specs MUST NOT contradict it. If they conflict, change the spec — not this constitution — unless the constitution is being amended on purpose.

Every `plan.md` MUST include a **Constitution Check** against these principles.

---

## I. Specifications First (NON-NEGOTIABLE)

- Do not invent language features, syntax, or behavior.
- Do not infer intent from code alone when a spec exists.
- Align implementations with documented specs (`specs/` is authoritative for engineering behavior).
- Only implement features that are specified under `specs/features/` (or `specs/complete/` for shipped behavior), or that the user has explicitly approved.
- If essential information is missing, ask before implementing.

## II. Production Quality (NON-NEGOTIABLE)

BeatBax is a production-quality system, not a prototype. Prefer correctness, determinism, and long-term maintainability over speed.

- TypeScript only; ESM-first.
- No stub logic in shipped paths.
- No runtime patching of compile-time concerns.
- Prefer boring, explicit code.

## III. Core Contracts Are Stable (NON-NEGOTIABLE)

These subsystems are core infrastructure. Changes require spec review, downstream impact analysis, and tests updated first or in parallel:

- Parser / grammar
- AST schema and node shapes
- Sequence and pattern expansion
- Scheduler and timing model
- ISM (Intermediate Song Model)

Do **not** casually change AST meanings, ISM semantics or ordering, scheduler timing, or expansion/transform ordering.

## IV. Language Semantics

- Patterns are channel-agnostic.
- Sequences are ordered pattern references plus transforms.
- Channels consume sequences and apply defaults/overrides.
- Transforms are compile-time only.
- Runtime MUST never patch logic that should exist at compile time.

## V. Plugin Isolation (NON-NEGOTIABLE)

- Core MUST never depend on plugins; plugins depend on core.
- Chip plugins implement isolated audio backends only. They MUST NOT change core AST, scheduler, or ISM semantics.
- Export plugins consume **validated ISM only** and MUST fail loudly on unsupported features.
- Plugins MUST be optional, discoverable, and side-effect free on import.
- Core work MUST preserve plugin compatibility and MUST NOT assume a fixed set of chips or exporters.

## VI. Compatibility and Determinism (NON-NEGOTIABLE)

- Preserve AST stability.
- No silent breaking changes.
- Determinism is critical (parse, expand, schedule, export).
- Do not “fix” problems by softening validation.

## VII. Tests Back Behavior (NON-NEGOTIABLE)

- New behavior requires tests.
- Refactors MUST NOT reduce coverage.
- Tests MUST assert determinism and export correctness where those are affected.

## VIII. Client Boundaries

- `desktop-full` (Electron) is the primary IDE.
- `web-lite` is a reduced browser client; do not assume desktop-only APIs in shared or web-lite code.
- Core logic MUST remain platform-agnostic. Do not use Node.js APIs in browser code.
- Desktop renderer/web-ui: TypeScript, Vite, Nano Stores, Tailwind, ESM. Mutations via named store actions only.

## IX. Agent Constraints

Agents MUST NOT:

- hallucinate undocumented syntax
- invent language features
- assume roadmap items are implemented
- skip constitution checks in feature plans

Agents MUST:

- follow specs verbatim
- ask when uncertain
- preserve stability above all

---

## Authority stack

1. This constitution
2. [`specs/global/`](global/) contracts
3. The active feature folder under [`specs/features/`](features/) (or [`specs/complete/`](complete/) for shipped behavior)
4. User-facing docs under `docs/` (grammar, chips, exports, QA) — not a substitute for specs
5. Code

[ROADMAP.md](../ROADMAP.md) is product direction, not an engineering spec. New chip or language work still needs a feature folder.
