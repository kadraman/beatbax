---
"@beatbax/engine": minor
---

Add scale-awareness: compile-time scale/lock validation, MIDI snap, and web UI authoring aids.

- **Language**: `scale <root> <mode> [warn|error|off]` directive and per-channel `lock=` (`scale`, `root+fifth`, `chord`, `chord7`, `octaves`). Bare `lock` in seq/pat lists is only treated as the lock option when followed by a valid lock value or written as `lock=...`, so existing patterns/sequences named `lock` keep working.
- **Parser**: `validateScaleLocks()` validates post-transform pitches (transpose, oct, etc.) with provenance-rich diagnostics, deduplication for repeated playback, noise-channel skip, and a single unknown-lock error (no duplicate parser/validation messages).
- **Web UI**: Monaco syntax highlighting and autocomplete for scale/lock; status-bar scale context strip while editing `pat` bodies; MIDI step-entry Off/Snap/Filter modes; scale context and snap follow nested sequence references; playback `parse:success` no longer clears scale state.
- **Docs & schema**: `metadata-directives.md`, `ast-schema.md`, `TUTORIAL.md`, `schema/ast.schema.json`, and `songs/features/scale_awareness_demo.bax`.
