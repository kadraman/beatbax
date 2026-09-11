---
"@beatbax/app-core": patch
"@beatbax/desktop": patch
"@beatbax/engine": patch
---

Split Instrument Editor sample scheme from value.

The NES DMC sample row no longer repeats the full `@nes/` / `local:` / `https://` / `github:` reference in two cramped fields. Scheme is a labeled dropdown; value is the bundled name or the path/URL remainder. At the right-pane minimum width the two controls stack so the value field stays usable.
