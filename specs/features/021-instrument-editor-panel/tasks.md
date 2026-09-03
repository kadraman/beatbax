# Tasks: Instrument Editor Panel (Desktop)

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

1. `ChipInstrumentEditor` types + `instrumentEditor?` on `ChipPlugin`; Game Boy schema + presets.
2. Desktop panel shell: right tab, feature flag, instrument list, selection from editor.
3. Schema-driven field widgets + write-valid-only source writeback.
4. Waveform canvas (Game Boy first): draw, hex, presets, play-while-drawing.
5. Macro graphs with loop markers.
6. Plugin presets + copy-from song instrument.
7. Mini keyboard + MIDI audition + live preview.
8. NES / SMS / Spectrum schemas (and constraint copy).
9. Tests: schema, serialize round-trip, panel units, desktop e2e.
10. Plugin author docs + Help blurb.

---
