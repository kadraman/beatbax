# Global specifications

Cross-cutting contracts. Feature specs MUST NOT silently contradict these files.

| File | Invariants |
|------|------------|
| [language.md](language.md) | Grammar, AST, ISM, compile-time transforms |
| [architecture.md](architecture.md) | Pipeline and client profiles |
| [plugins.md](plugins.md) | Chip and exporter plugin rules |
| [compatibility.md](compatibility.md) | Stability, determinism, breaking changes |
| [testing.md](testing.md) | Required tests for new behavior |

These are short MUST/MUST NOT docs with pointers into `docs/` and shipped feature specs. Full composer references stay in `docs/grammar/`, `docs/chips/`, and `docs/exports/`.
