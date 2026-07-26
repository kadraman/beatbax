---
"@beatbax/engine": patch
"@beatbax/plugin-chip-sms": patch
"@beatbax/plugin-chip-spectrum-128": patch
---

Polish New Song Wizard chip metadata and starter demos across built-in and plugin chips.

- Extend `NewSongWizardMetadata` with optional `blurb`, `channels`, `highlights`, `eraTag`, `styleTags`, and `listeningNote`; add optional `ChipPlugin.status` (`Stable` | `Beta` | `Experimental`).
- Enrich Game Boy / NES / SMS / Spectrum wizard cards with friendlier blurbs and highlights; improve NES starter (DMC kick/snare/clap, louder lead) and apply modest `NES_LISTENING_GAIN` for listening parity with SMS/GB.
- Fix wizard content correctness: Game Boy pulse `duty=50` (was invalid `60`), strip GB image data-URL prefix, use NES (not Famicom) chip art, and tighten NES highlight copy.
- Honor Game Gear `gg:pan` / `gg_pan` in Web Audio and PCM pan resolution (alongside `pan` / `gb:pan`).
- SMS/Game Gear: clearer stereo starter, sustaining lead so vib/port are audible, and `status: 'Beta'`.
- Spectrum/CPC: GB-shaped starter demo with multiplexed AY drums, quieter defaults, and `status: 'Experimental'`; use classic `env_shape=8` buzz bass; separate drum kit from packs that use `env_bass` / `vol_env` so template pairings avoid shared R11–R13 conflicts; clarify envelope-lead as software `vol_env`.
