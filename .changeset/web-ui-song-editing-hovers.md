---
"@beatbax/engine": patch
"@beatbax/plugin-chip-sms": patch
"@beatbax/plugin-chip-spectrum-128": patch
---

Web UI song-editing polish: chip-aware instrument hovers, MIDI idle preview, editor UX improvements, and parser validation fixes.

### @beatbax/web-ui _(not versioned — local app)_

- **Instrument hovers** on `inst` lines: GM program names (`gm=`), percussion/melodic `note=`, and chip-aware property keywords/values (`type`, `vol`, `duty`, `noise_mode`, `noise_rate`, `chipRegion`, etc.). Property parsing preserves camelCase keys; chip-provided docs show on string enum values (e.g. `chipRegion=cpc`).
- **SMS `vol_env` sparklines** now show perceived loudness (attenuation inverted: 0 = loudest, 15 = silent).
- **MIDI step entry** previews notes on the idle keyboard without arming Record; audition runs after a successful insert; parse fallback when the pattern grid is empty.
- **Editor UX**: persistent fold-comments setting; View menu and toolbar polish for word-wrap and fold toggles; channel mixer mock/test alignment for built-in NES per-channel volume.
- **Tests** updated for renamed settings keys (`CHANNEL_MIXER`), event-bus payloads, hover column positions, and quick-fix titles.
- Add feature design doc: `docs/features/virtual-piano-keyboard.md`.

### @beatbax/engine

- Add NES `hoverDocs` entries for `type`, `duty`, and `vol` (keyword hovers in the web editor).
- **Parser:** resolve unknown `chip` via `chipRegistry.has()` and skip Game Boy instrument validation when the chip is unknown, avoiding misleading cascade errors (e.g. NES-only types flagged on a typo'd chip name).
- Regression test: unknown chip reports only the chip error, not spurious instrument type/property warnings.

### @beatbax/plugin-chip-sms

- Add `hoverDocs` for `type` and `vol` (SMS attenuation semantics documented for editor hovers).

### @beatbax/plugin-chip-spectrum-128

- Add `hoverDocs` for `type` and per-channel `tone1` / `tone2` / `tone3` (editor keyword and value hovers).
