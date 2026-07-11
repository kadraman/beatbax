---
"@beatbax/engine": patch
---

Fix inline effect parameter parsing and comma-chained preset validation.

- **Positional empty parameters**: `parseEffectParams()` now preserves skipped slots (e.g. `vib:6,5,,2` keeps the default waveform and applies `durationRows` on the 4th param instead of collapsing values into earlier positions).
- **Shared `effectsInline` module**: deduplicated `parseEffectParams` / `parseEffectsInline` from `resolver` and `resolver.browser` into `song/effectsInline.ts` for use by the parser and resolver.
- **Comma-chained preset effects**: undefined-effect validation parses the full inline effect body so chains like `<exprVib,pan:R>` no longer false-positive when a defined preset is followed by `pan`.
- Add regression tests for positional vibrato params, preset+pan chains, and effect-param parsing.
