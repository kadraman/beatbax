---
"@beatbax/app-core": patch
---

Show instrument `subpat` tables as BeatBax source on hover (monorepo internal).

Hovering an `inst` with `subpat=` no longer prints `[object Object]`. The second fence is the named table (`.`, `fx:1,1`, `jump:4`, `halt`, …), using the resolved AST so kit tables imported into the song still appear.
