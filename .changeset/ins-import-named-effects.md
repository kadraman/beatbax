---
"@beatbax/engine": minor
"@beatbax/app-core": patch
"@beatbax/cli": patch
---

Allow named `effect` presets in imported `.ins` kits (last-wins, same as instruments).

`.ins` files may now contain `effect drift = vib:3,4` alongside `inst` / `import` / `subpat`. Resolve merges them onto the song AST so `<drift>` works without copying the lines into every `.bax`. Song-local presets still override the kit. Parser/CLI/Desktop drop false "effect is not defined" diagnostics after a successful import.
