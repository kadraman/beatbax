---
"@beatbax/plugin-exporter-arkos": patch
"@beatbax/engine": patch
"@beatbax/cli": patch
---

Align Arkos song export with desktop (.aks only) and add CLI `--instruments` for optional `.aki` bank export.

- Default `export arkos` writes the full song `.aks` (instruments already embedded).
- `export arkos --instruments` writes the instrument bank `.aki` only.
