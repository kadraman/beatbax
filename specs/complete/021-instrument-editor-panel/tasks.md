# Tasks: Instrument Editor Panel (Desktop)

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Implementation Checklist

- [x] T001 `ChipInstrumentEditor` types + `instrumentEditor?` on `ChipPlugin`; Game Boy schema + presets.
- [x] T002 Desktop panel shell: right tab, feature flag, instrument list, selection from editor.
- [x] T003 Schema-driven field widgets + write-valid-only source writeback.
- [x] T004 Waveform canvas (Game Boy first): draw, hex paste, presets; audition via Preview strip.
- [x] T005 Macro graphs with loop markers.
- [x] T006 Plugin presets + copy-from song instrument.
- [x] T007 Mini keyboard + MIDI audition + live preview.
- [x] T008 NES / SMS / Spectrum schemas (and constraint copy).
- [x] T009 Tests: schema, serialize round-trip, panel units.
- [x] T010 Plugin author docs + Help blurb.
- [x] T011 Hardware `envelope` / `sweep` widgets + live previews; macro tabs with click/drag paint and signed baselines.
- [x] T012 Instrument dropdown / New / CodeLens reveal the `inst` line without focusing Monaco; restore panel focus so A–J preview. **Show in editor** remains the focus-source action.
- [x] T013 Hardware and Macros: defined tabs and remaining Add chips share one row.
- [x] T014 Instrument Editor writeback uses undoable Monaco edits so Add Envelope/Sweep/macro can be undone.
- [x] T015 `sample` widget: bundledSamples dropdown (`@chip/name`) plus custom-ref text field (no filesystem Browse).
- [x] T016 Game Boy `subpat`: Show-in-editor link to the `subpat` block; macro lock copy: “Software macros are locked while subpat is set.”
- [x] T017 `sample` widget splits scheme (Bundled / Local / HTTPS / GitHub) from value (bundled name, or path/URL remainder). Host composes the stored ref.
- [x] T018 Game Boy `subpat` row shows the name plus an icon (hover: jump to the `subpat` definition); no “Show in editor” text button.
- [x] T019 Subpat go-to-source reveals and highlights the `subpat` line (not the selected `inst`, even when they share a name).
