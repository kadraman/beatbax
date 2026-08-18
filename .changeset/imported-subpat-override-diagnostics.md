---
"@beatbax/engine": patch
"@beatbax/cli": patch
"@beatbax/app-core": patch
---

Song-local instruments may keep a kit `subpat=` name after last-wins override.

The parser no longer stacks plugin "subpat was not resolved" warnings on top of the import-pending "not defined" warning, and CLI/Desktop drop that leftover once import bind fills `subpatRows`.
