# Implementation Plan: Instrument Editor Panel (Desktop)

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — existing `inst` grammar only; no new `.bax` syntax
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — optional `instrumentEditor` on `ChipPlugin`; no AST/ISM/scheduler changes; `__loc` already on instruments
- [x] Plugins remain isolated; core does not gain plugin dependencies — host renders generic widgets from plugin schema; plugins do not ship React
- [x] Determinism and compatibility preserved (or migration documented) — write-valid-only via `validateInstrument`; `CHIP_INSTRUMENT_META` kept as fallback
- [x] Tests planned for new behavior — serialize round-trip, schema/fallback, waveform presets, panel visibility

## Implementation Plan



### AST / engine changes

- Extend `[packages/engine/src/chips/types.ts](../../packages/engine/src/chips/types.ts)` with `ChipInstrumentEditor` and `instrumentEditor?` on `ChipPlugin`.
- Export the types from `@beatbax/engine`.
- No new `InstrumentNode` fields for v1.
- Optional: public `serializeInstrument(name, node, options)` used by writeback and tests (today serialization is only covered indirectly).



### Parser changes

None required for v1. Keep `__loc`. If statement-range writeback needs end location, add it then — do not expand `inst` to multi-line syntax.

### Chip plugins

- Game Boy first: full schema (types, fields, macros, waveform, presets).
- Then NES, SMS, Spectrum-128.
- Update `[docs/contributing/creating-plugins.md](../../../docs/contributing/creating-plugins.md)` and the plugin starter template.



### Desktop UI


| Area            | Files / notes                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Right tab       | `[tabs.ts](../../apps/desktop/src/renderer/src/components/shell/tabs.ts)` — add `'instruments'` to `RightTabId` / `RIGHT_TAB_ORDER`                                                       |
| Panels menu     | `[panels-menu.ts](../../apps/desktop/src/renderer/src/components/shell/panels-menu.ts)` — side-group entry                                                                                |
| View menu       | `[menu-bar.ts](../../apps/desktop/src/renderer/src/components/shell/menu-bar.ts)` — `PANEL_CHECK_IDS` + feature flag                                                                      |
| Feature flag    | `[feature-flags.ts](../../packages/app-core/src/utils/feature-flags.ts)`, `[settings/features.tsx](../../apps/desktop/src/renderer/src/components/settings/features.tsx)`, settings store |
| Panel component | New `apps/desktop/src/renderer/src/components/panels/DesktopInstrumentEditor.tsx` (native React, same mount pattern as Help / Pattern Grid)                                               |
| Preview         | Reuse `startInstNotePreview`; teach `instChannelId` to read `instrumentEditor.types`                                                                                                      |
| MIDI            | When Instruments tab focused, route note-on/off to preview; Record-armed still does step entry                                                                                            |
| CodeLens        | Optional **Edit** command that shows the tab and selects the instrument                                                                                                                   |




### CLI / Web UI / Export

No CLI or export changes. Web UI is out of scope for v1 (document as follow-up).

### Documentation updates

- This spec.
- Plugin author guide: how to declare `instrumentEditor`.
- Grammar instruments page: link “edit graphically in Desktop”.
- Help panel: short Instruments section (host-owned, not chip-replaced).

---

## Testing Strategy



### Unit tests

- Schema types: Game Boy waveform length/bit depth; NES has no waveform; SMS attenuation range.
- Fallback editor derived from `CHIP_INSTRUMENT_META` when schema is absent.
- `serializeInstrument` round-trip: parse → serialize → parse equals fields (env CSV vs object normalised).
- Macro graph model: loop marker, empty-omits-field, signed pitch.
- Waveform: hex paste, 16-value tile to 32, clamp 0–15.
- `previewChannel` mapping vs current `instChannelId` behaviour for GB/NES/AY/SMS.



### Integration / e2e

- Desktop: enable flag → Instruments tab visible; select `inst` line → panel loads fields.
- Edit duty / wave / vol_env → source line updates; parse succeeds.
- Invalid env rejected (no write) and plugin message shown.
- Preview from mini keyboard plays; MIDI audition when enabled.
- Template apply inserts/overwrites expected fields.
- e2e in `apps/desktop/tests/e2e/` following Help / Visualizer tab tests.

---

## Migration Path

- Feature flag off by default: no change for existing users.
- Existing songs need no source migration.
- Plugins without a schema keep working via the degraded host fallback.
- Once GB/NES/SMS/Spectrum ship schemas, `CHIP_INSTRUMENT_META` can later be generated from the same schema (follow-up) so autocomplete and the panel cannot drift.

---
