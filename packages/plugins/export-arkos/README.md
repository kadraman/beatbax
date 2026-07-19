# @beatbax/plugin-exporter-arkos

Arkos Tracker 3 exporter for BeatBax Spectrum-128 / Amstrad CPC songs.

Exports:

- `.aks` — full song (AT3 `formatVersion` 3.0 plain XML) — default (CLI and desktop)
- `.aki` — instrument bank only — CLI `export arkos --instruments`

Instruments are embedded in the `.aks`. The `.aki` is an optional extract for
reuse/import in other Arkos Tracker songs.

## Usage

```bash
# Full song (same as desktop AKS export)
node bin/beatbax export arkos songs/spectrum-128/instruments/ay_synth_channels.bax

# Instrument bank only
node bin/beatbax export arkos songs/spectrum-128/instruments/ay_synth_channels.bax --instruments
```

## v1 supported subset

Supported:

- `chip spectrum-128` / `chip cpc` / aliases (`spectrum`, `ay`, `amstrad-cpc`, …)
- Up to 3 channels (`tone1` / `tone2` / `tone3`)
- Notes, rests, sustains
- Instrument `vol`, `noise_rate`, `tone_mix`, `tone`
- Deterministic pattern/order lowering from resolved channel events

Instrument sustain (v1): constant-`vol` instruments export as a **single looping cell**
so Arkos holds the note for the full pattern row (matching BeatBax). Without the
loop, AT3 would play one instrument frame then silence — notes sound clipped.

Rejected (fail-hard diagnostics):

- `arp_env`, `pitch_env`, `vol_env`, `env_bass`, `env_shape`
- `noise_frames`, `tone_frames`
- Inline pattern effects

## Register in app code

```ts
import { exporterRegistry } from '@beatbax/engine';
import arkosExporterPlugin from '@beatbax/plugin-exporter-arkos';

if (!exporterRegistry.has(arkosExporterPlugin.id)) {
  exporterRegistry.register(arkosExporterPlugin);
}
```

## Verification songs

- `songs/spectrum-128/instruments/ay_synth_channels.bax`
- `songs/spectrum-128/instruments/ay_noise_mixing.bax`
- `songs/spectrum-128/instruments/ay_percussion_demo.bax` (may fail v1 if macros present)
