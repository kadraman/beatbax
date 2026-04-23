# GitHub Copilot Instructions

## Project Overview

BeatBax is a live-coding language for creating retro-console chiptunes with associated tools and support.

Initial target hardware is the Nintendo Game Boy (DMG-01) APU and Nintendo Entertainment System (NES) Ricoh 2A03 APU.

The architecture is designed so additional chip backends (PC-Engine, SID, Genesis) can be added later.

BeatBax songs can be exported into multiple formats (JSON, MIDI, WAV) as well as chipset specific formats like hUGETracker (UGE) format for the Nintendo Gameboy so they can be used in Homebrew game development and projects.

The project is post MVP and is now stable and focused on:

- Adding **new sound chip plugins** and related **exporter plugins**
- Adding **new language features** where required
- **Improving user experience** in the Web-UI, CLI and implementing a Desktop UI
- Expanding **AI tooling** to help compose BeatBax songs
- Improving **correctness, ergonomics, and diagnostics**
- Implementing **post‑MVP features** defined by formal specifications
- Maintaining **stability, backward compatibility, and determinism**

Copilot must treat BeatBax as a **production‑quality system**, not a prototype.

---

## Authority & Source of Truth

Copilot MUST follow these rules strictly:

- **Documentation is authoritative**
  - `/docs/**/*.md` defines the source of truth
  - `/docs/features/*.md` defines feature behavior and scope

- **Specifications first**
  - Do not invent language features or behavior
  - Do not infer intent from code alone
  - Always align implementations with documented specs

- **Feature gating**
  - Only implement features that are:
    - documented in `/docs/features/`, **or**
    - explicitly approved by the user

If essential information is missing, **ask before implementing**.

---

## Project State (Post‑MVP)

### Delivered & Stable

- Deterministic parser → AST → ISM expansion pipeline
- Accurate multi‑channel Game Boy APU emulation
- Deterministic tick scheduler and playback engine
- JSON (ISM), MIDI (SMF), and hUGETracker v6 `.UGE` export
- UGE import (versions 1–6)
- Browser, CLI, and library usage
- Extensive automated test coverage

These components are **stable contracts**.

---

## Stability & Compatibility Rules

- **Preserve AST stability**
- **No silent breaking changes**
- **Determinism is critical**

---

## Language & Architecture Principles

- Patterns are **channel‑agnostic**
- Sequences are ordered pattern references + transforms
- Channels consume sequences and apply defaults/overrides
- Transforms are **compile‑time only**
- Runtime must never patch logic that should exist at compile time

---

## Plugin & Backend Expansion

BeatBax supports **pluggable sound chip backends and export formats**.

### Chip Plugins
- Implement isolated audio backends only
- Must not change core AST, scheduler, or ISM semantics

### Export Plugins
- Consume **validated ISM only**
- Must fail loudly on unsupported features

### General Plugin Rules

- **Core must never depend on plugins; plugins depend on core**
- Plugins are dynamically loaded
- Plugins must be optional, discoverable, and side‑effect free on import

All core work must:
- preserve plugin compatibility
- avoid assumptions about a fixed set of chips or exporters

### Plugin Authoring Do & Don’t

**Do**
- Treat ISM as the sole exporter input
- Keep chip implementations fully isolated
- Validate unsupported features explicitly

**Don’t**
- Patch or extend core AST
- Add scheduler hooks for a single plugin
- Assume undocumented timing guarantees

---

## Core System Guardrails (Critical)

The following subsystems are **core infrastructure**:

- Tokenizer / Parser
- AST schema and node shapes
- Sequence & pattern expansion
- Scheduler and timing model
- ISM (Intermediate Song Model)

Changes require:
- spec review
- downstream impact analysis
- tests updated first or in parallel

**Do NOT casually change:**
- AST meanings
- ISM semantics or ordering
- Scheduler timing behavior
- Expansion or transform ordering

---

## Web UI Frontend Guidelines

The BeatBax Web UI is **TypeScript‑first** and framework‑minimal.

### Technology
- TypeScript (strict)
- Vite
- Nano Stores
- Tailwind CSS
- ESM only

Do NOT assume React, Vue, or other frameworks unless explicitly stated.

### Nano Stores
- `atom` for base state
- `computed` only for real derivations
- No side effects in store definitions
- Mutations via named actions only

### Tailwind CSS
- Utility classes only
- No inline styles
- Mobile‑first
- Avoid unreadable class chains

### Frontend Boundaries
- Do not use Node.js APIs in browser code
- Core logic must remain platform‑agnostic

---

## Code Quality Rules

- TypeScript only
- ESM‑first
- No stub logic
- No runtime patching
- Prefer boring, explicit code

---

## Testing Requirements

- New behavior requires tests
- Refactors must not reduce coverage
- Tests must assert determinism and export correctness

---

## AI Behavior Constraints (Critical)

Copilot MUST NOT:
- hallucinate undocumented syntax
- invent language features
- assume roadmap items are implemented
- "fix" problems by softening validation

Copilot MUST:
- follow specs verbatim
- ask when uncertain
- preserve stability above all

---

## Workflow Reminder

1. Read `/docs/features/`
2. Implement incrementally
3. Add tests
4. Update docs if behavior changes
5. Ensure all tests pass

BeatBax values **correctness, determinism, and long‑term maintainability** over speed.
