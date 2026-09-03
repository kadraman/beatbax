# Agent instructions (BeatBax)

BeatBax is a production-quality live-coding language and toolchain for chiptune. Treat it as a stable system: correctness, determinism, and compatibility over speed.

## Authority

1. [specs/constitution.md](specs/constitution.md)
2. [specs/global/](specs/global/)
3. The **active** feature under [specs/features/](specs/features/) (or a shipped spec under [specs/complete/](specs/complete/) when changing that behavior; [specs/archive/](specs/archive/) is historical only)
4. User-facing docs in [docs/](docs/) (grammar, chips, exports, QA)
5. Code

Do not invent language features or syntax. Do not assume [ROADMAP.md](ROADMAP.md) items are implemented. Ask when a spec is missing.

Index: [specs/STATUS.md](specs/STATUS.md). Process: [specs/README.md](specs/README.md).

## Workflow

1. Read the constitution and relevant global contracts.
2. Open or update `specs/features/NNN-slug/` (`spec.md` → `plan.md` → `tasks.md`).
3. Implement incrementally from `tasks.md`.
4. Add tests; run `npm test`.
5. Update specs and user-facing docs if behavior changes.

## Do not

- Load every file under `specs/complete/` or `specs/archive/` by default.
- Soften validation to hide invalid songs.
- Depend on plugins from core, or change AST/ISM/scheduler from a plugin.
