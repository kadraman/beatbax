---
"@beatbax/engine": minor
---

Add `listTopLevelDefinitions(source)` to `@beatbax/engine/parser`. It lists top-level `pat`, `seq`, `inst` and `effect` definitions with their stored name and 1-based line, reading every form the grammar accepts: shorthand patterns (`name = …`), hyphenated names, and `pat X:rev = …`, which is listed as `X`.
