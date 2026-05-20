---
"@beatbax/engine": minor
---

Remove the `arrange` directive and its `defaults(...)` modifier from the BeatBax language.

- Parser, AST, and resolver no longer accept or expand `arrange` blocks.
- Multi-channel layouts use `channel` mappings with comma-separated `seq` items (see `songs/features/sequence_demo.bax`).
- Songs that used `arrange` must be migrated before they will parse.
