---
"@beatbax/engine": minor
---

Add tier-2 sequence modifiers and harden modifier parsing and expansion.

- **Tier-2 modifiers** in `refExpander`, structured parsing, and AST: `invert`/`inv`, `every(N,MOD)`, `off(N)`/`lag(N)`, `pick(...)`, `chunk(N)`, and `shuffle(seed)`. Modifiers chain left-to-right with colons (e.g. `lead_core:rot(1):lag(1)`).
- **`every(N,MOD)`** applies only token-local inner modifiers: requires exactly one output token and rejects `inst`/`pan` overrides; warns and leaves the token unchanged otherwise.
- **Peggy grammar** for modifier arguments allows one level of nested parentheses (e.g. `every(2,oct(+1))`); deeper nesting is not supported and no longer mis-parsed as a truncated body.
- **Demo and tests**: rework `songs/features/advanced_modifiers_demo.bax` with a playable arrangement plus `demo_*` reference seqs; add `modifier-chain`, `tier2-modifiers`, and parser regression coverage.
