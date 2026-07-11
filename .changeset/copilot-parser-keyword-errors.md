---
"@beatbax/engine": patch
---

Improve unknown-keyword parse errors and include `effect` in the valid keyword list.

- Centralise `VALID_KEYWORDS` and `unknownKeywordMessage()` so Peggy recovery and error enhancement report the same keyword list (including `effect`, `song`, and `import`).
- Avoid mislabeling malformed `effect` lines as unknown top-level keywords.
- Add `parser.effect-syntax-error.test.ts` regression coverage.
