---
"@beatbax/engine": patch
"@beatbax/plugin-chip-sms": patch
"@beatbax/plugin-chip-spectrum-128": patch
---

Polish New Song Wizard chip metadata and starter demos across built-in and plugin chips.

- Extend `NewSongWizardMetadata` with optional `blurb`, `channels`, `highlights`, `eraTag`, `styleTags`, and `listeningNote`; add optional `ChipPlugin.status` (`Stable` | `Beta` | `Experimental`).
- Enrich Game Boy / NES wizard cards; improve NES starter (DMC kick/snare/clap, louder lead) and apply modest `NES_LISTENING_GAIN` for listening parity with SMS/GB.
- Honor Game Gear `gg:pan` / `gg_pan` in Web Audio and PCM pan resolution (alongside `pan` / `gb:pan`).
- SMS/Game Gear: clearer stereo starter, sustaining lead so vib/port are audible, and `status: 'Beta'`.
- Spectrum/CPC: GB-shaped starter demo with multiplexed AY drums, quieter defaults, and `status: 'Experimental'`.
