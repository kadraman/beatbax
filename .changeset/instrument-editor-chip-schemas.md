---
"@beatbax/engine": minor
"@beatbax/plugin-chip-sms": patch
"@beatbax/plugin-chip-spectrum-128": patch
---

Add Instrument Editor support for chip plugins and engine helpers.

- Expose optional `instrumentEditor` schemas on chip plugins (Game Boy, NES, SMS, Spectrum 128) for typed fields, macros, and waveform UI.
- Add `serializeInstrument` / `parseInstrumentBody` / waveform helpers for editor writeback; empty `[]` list values parse as empty arrays and are omitted when serializing.
- Add `normalizeWaveSamples` so hosts normalize wavetable data to each plugin schema’s `length` / `min` / `max` instead of Game Boy’s fixed 32-entry table.
- Gate SMS `arp_env` to `tone1` / `tone2` / `tone3` so the editor does not offer Add Arpeggio on noise (rejected by `validateSmsInstrument`).
- Extend plugin API / chip types so hosts can discover editor schemas without hard-coding per chip.
