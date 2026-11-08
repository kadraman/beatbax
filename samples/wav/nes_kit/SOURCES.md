# NES kit sources (Feature 109, audition pass 5)

Prepared WAVs in this folder. Intermediate downloads live in `_dl/` (not required at runtime).
See `samples/dmc/NOTICE` for encoded byte sizes and SHA-256.

## Full 808 kit (Michael Fischer TR-808, 1994)

- Repo: https://github.com/tidalcycles/sounds-tr808-fischer (CC0 1.0)
- Files under `_dl/fischer808/`:
  - `BD0025.WAV` + `BD0000.WAV` click → `kick_808` (short thump; long BD5050 sine-glide sounded like a laser after DMC)
  - `SD5050.WAV` → `snare_808`
  - `CH.WAV` → `hat_808`
  - `OH50.WAV` → `hat_open_808`
  - `CP.WAV` → `clap_808`
  - `CY5050.WAV` → `cymbal_808` / `crash_cym`
  - `RS.WAV` → `rim_808`
  - `CB.WAV` → `cowbell_808`
  - `MA.WAV` → `maracas_808`
  - `LT50.WAV` / `MT50.WAV` / `HT50.WAV` → `tom_*_808`
- Prep: mono, silence trim, loudnorm, encode @ dmc_rate 15

## Other kept sources

- phoenix1291 OGA 16-bit pack — kick_punch, hat_closed
- Spring Spring — snare_tight / snare_fat
- Virtuosity Drums — hat_open
- spaghettiSFX — shaker
- GRD-music JDXi — kick_909 / hat_909 / hat_open_909
- ani_music — snare_909
- SFXMint — orch_hit / orch_hit_up
- Kenney — voice_*
- BeatBax synth — kick_body, crash (tinny), rim, cowbell
- Bass C0–C1 — pitch-shifted phoenix Instrument__001
