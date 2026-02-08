# Sound Chip Roadmap for BeatBax

This document lists candidate retro sound chips to implement in BeatBax, prioritized by impact and effort, with capability summaries and recommended export formats. For each chip the document notes whether exported formats can be used for homebrew game development (drivers, tracker formats, or register-stream formats).

## Principles

- Prioritize chips with strong chiptune communities and existing tracker/export ecosystems.
- Provide both human-editable tracker exports and machine-playable register/driver streams where possible.
- Prefer common archival formats (VGM, NSF, SID, MOD, SPC) plus tracker-specific formats (hUGETracker, FamiTracker, GoatTracker, etc.)

## Priority implementation order

| Chip | Implemented | Estimated effort | Notes |
|---|:---:|---|---|
| Game Boy APU (DMG-01) | [x] | Low | Core already implemented in engine-core |
| SN76489 (PSG — SMS / Game Gear) | [ ] | Low | Reuse PSG primitives; quick VGM/register export |
| AY‑3‑8910 / YM2149 (PSG family) | [ ] | Low–Medium | Similar PSG semantics to SN76489; broad platform coverage (Atari ST, MSX) |
| NES APU / RP2A03 | [ ] | Medium | DMC sample path and FamiTracker/NSF ecosystem integration |
| YM2413 (OPLL) | [ ] | Medium | Preset-based 2‑op FM — easiest FM entry (MSX/PC‑88 coverage) |
| OPL2 / YM3812 (AdLib / early FM) | [ ] | Medium | PC FM; requires operator/patch handling and OPL register export |
| YM2612 (Genesis) [+ SN76489 PSG for Genesis where applicable] | [ ] | High | Complex FM operator mapping; high impact for Genesis scene |
| Amiga / Paula (MOD/sample playback) | [ ] | Medium | Sample bank tooling and MOD export; strong tooling ecosystem |
| SNES / SPC700 + DSP (BRR + DSP effects) | [ ] | High | BRR compression and DSP effects (echo, FIR) increase complexity |
| C64 / SID (6581/8580) | [ ] | High | Emulating analog filters and chip quirks is QA-heavy |
| Pokey | [ ] | Medium | Niche but distinctive sound; register-driven export useful for homebrew |
| HuC6280 (PC‑Engine) | [ ] | Medium | PSG + waveform features; used in PC‑Engine/TG‑16 homebrew |
| SAA1099 | [ ] | Medium | Niche stereo PSG; register dumps/VGM export path |
| SCC / FDS wavetable (namco/fds) | [ ] | Medium | Wavetable chips — useful for unique timbres; moderate effort |

## Detailed chip summaries

- **Game Boy (DMG‑01)**
  - Channels: 4 (Pulse1, Pulse2, Wave, Noise)
  - Features: duty control, envelopes, 16×4-bit wave RAM, LFSR noise
  - Difficulty: Low (already implemented in BeatBax core)
  - Suggested plugin name: `@beatbax/plugin-chip-gameboy`
  - Export formats: hUGETracker `.uge` (v6), JSON ISM, WAV/OGG (rendered audio), MIDI (approximate)
  - Homebrew suitability: Yes — `hUGETracker`/`.uge` is the canonical tracker format used for Game Boy homebrew and toolchains; register/driver exports and binary pattern data can be consumed by GB homebrew projects.

- **NES / RP2A03**
  - Channels: 5 logical (2 pulse, triangle, noise, DMC sample channel)
  - Features: square duty, triangle for bass, noise, sample DMC (bit-crushed samples)
  - Difficulty: Medium
  - Suggested plugin name: `@beatbax/plugin-chip-nes`
  - Export formats: FamiTracker `.ftm` (tracker), NSF (NES Sound Format), VGM (register stream), WAV/OGG (rendered), MIDI (approximate)
  - Homebrew suitability: Yes — `NSF` and register-stream (`VGM`) or engine-ready pattern exports (for e.g., FamiTone/FamiTracker drivers) make direct inclusion in NES homebrew feasible.

- **C64 / SID (6581/8580)**
  - Channels: 3 (analog-like waveforms, ring modulation, filters on 8580)
  - Features: multi-waveforms, complex envelopes, filter/ring modulation (chip-dependent)
  - Difficulty: High (emulation of analog quirks + filter differences)
  - Suggested plugin name: `@beatbax/plugin-chip-sid`
  - Export formats: PSID/RSID (`.sid`), SID player register dumps, VGM (partial), GoatTracker exports, WAV/OGG (rendered)
  - Homebrew suitability: Partial — `.sid` is archival/playback-focused; for native C64 homebrew you generally export register sequences or tracker patterns (GoatTracker) compatible with existing SID drivers.

- **Sega Genesis / YM2612 (+ PSG SN76489)**
  - Channels: YM2612 FM operators (6 channels via 4-operator/6-op mapping) + SN76489 PSG (3 squares + noise)
  - Features: FM synthesis (complex operators), PCM via DAC tricks, stereo outputs
  - Difficulty: High
  - Suggested plugin name: `@beatbax/plugin-chip-ym2612`
  - Export formats: VGM (captures YM2612 & PSG register writes), GYM (Genesis music format), WAV/OGG, tracker exports (e.g., Deflemask-compatible data)
  - Homebrew suitability: Yes — `VGM`/`GYM` or driver-ready register dumps are commonly used for Genesis homebrew; compilation into engine-friendly data structures is required.

- **Atari ST / YM2149 (AY‑3‑8910 family)**
  - Channels: 3 PSG channels, envelope generator on-chip
  - Features: PSG envelopes, easy square/noise synthesis
  - Difficulty: Low–Medium
  - Suggested plugin name: `@beatbax/plugin-chip-ym2149`
  - Export formats: VGM, AY/AYM tracker formats, MOD conversions, WAV/OGG
  - Homebrew suitability: Yes — AY/PSG register streams or tracker exports are usable in homebrew targets (e.g., for YM2149-driven systems).

- **SN76489 (Sega Master System / Game Gear / SMS)**
  - Channels: 3 square + noise
  - Features: simple PSG, tone/noise control
  - Difficulty: Low
  - Suggested plugin name: `@beatbax/plugin-chip-sn76489`
  - Export formats: VGM, PSG tracker exports, WAV/OGG
  - Homebrew suitability: Yes — `VGM` or register-stream drivers are usable; simple to target directly in SMS/Game Gear homebrew.

- **Amiga / Paula**
  - Channels: 4 hardware sample channels (8-bit signed PCM) with period-based pitch
  - Features: sample playback, simple mixing, per-channel volume
  - Difficulty: Medium
  - Suggested plugin name: `@beatbax/plugin-chip-paula`
  - Export formats: MOD (4-channel tracker), WAV (rendered), noise/sample packs, AHX/ProTracker variants
  - Homebrew suitability: Yes — `MOD` is the canonical format for Amiga music and is directly used in Amiga demos/homebrew; exporting module data or raw sample banks is appropriate.

- **SNES / SPC700 + DSP**
  - Channels: 8 sample channels with ADPCM/BRR samples, DSP effects (echo, FIR)
  - Features: sample-based synthesis, on-chip DSP effects, BRR compression
  - Difficulty: High
  - Suggested plugin name: `@beatbax/plugin-chip-spc700`
  - Export formats: SPC (SNES sound file), BRR sample banks, WAV/OGG, MIDI (approximate)
  - Homebrew suitability: Partial — `SPC` is a playback format for emulators; for real SNES homebrew you need engine-driver-ready BRR sample banks and track data compatible with existing SPC drivers or custom engines.

- **OPL2 / YM3812 (AdLib / early FM)**
  - Channels: 9 FM channels (2‑operator FM per channel; some chips allow channel stacking)
  - Features: 2-op FM synthesis, classic PC FM timbres
  - Difficulty: Medium
  - Suggested plugin name: `@beatbax/plugin-chip-opl2`
  - Export formats: OPL register dumps, VGM, chiptune trackers that target OPL (e.g., AdLibTracker), WAV/OGG
  - Homebrew suitability: Partial — OPL register logs and driver-friendly patches can be used in PC‑engineered homebrew (DOS, retro FPGA builds); conversion required for modern usage.

- **YM2413 / OPLL**
  - Channels: 9 melodic channels (2‑operator FM, rhythm mode using channel allocation)
  - Features: compact 2‑op FM with 15 built‑in instrument presets and one user slot; lightweight parameter set suitable for low-cost hardware
  - Difficulty: Medium
  - Suggested plugin name: `@beatbax/plugin-chip-opll`
  - Export formats: VGM (captures YM2413 register writes), OPLL register dumps, WAV/OGG (rendered), MIDI (approximate)
  - Homebrew suitability: Yes — register dumps or `VGM` streams are commonly used for MSX/PC‑88/retro builds; driver-ready register exports enable direct use in homebrew and FPGA projects.

- **Pokey (Atari 8‑bit)**
  - Channels: 4 channels with distortion/noise features
  - Features: unique distortion/noise quirks, stereo panning on some platforms
  - Difficulty: Medium
  - Suggested plugin name: `@beatbax/plugin-chip-pokey`
  - Export formats: Pokey register dumps, VGM, WAV/OGG
  - Homebrew suitability: Yes (niche) — direct register exports are commonly used for Atari homebrew.

- **HuC6280 (PC‑Engine / TurboGrafx‑16)**
  - Channels: 6 PSG channels with waveform control
  - Features: PSG plus extended features compared to basic SN76489
  - Difficulty: Medium
  - Suggested plugin name: `@beatbax/plugin-chip-huc6280`
  - Export formats: VGM, engine-ready register dumps, WAV/OGG
  - Homebrew suitability: Yes — register streams or driver-format exports are usable with PC‑Engine homebrew toolchains.

- **SAA1099 / Other Niche Chips**
  - Channels: SAA1099: 6 voices, stereo routing
  - Features: less common but notable stereo, tone/noise channels
  - Difficulty: Medium
  - Suggested plugin name: `@beatbax/plugin-chip-saa1099`
  - Export formats: VGM, register dumps, WAV/OGG
  - Homebrew suitability: Niche — usable where supported by the target platform or emulator driver; otherwise register dumps are the path.

## Common export format notes

- VGM (Video Game Music): captures register writes for many chips (YM*, SN76489, OPL2, etc.). Excellent for archival and playback in emulators; useful for homebrew when you can convert or replay register streams in the target engine.
- NSF (NES Sound Format): NES-specific container for sound playback on emulators/hardware replay; good for NES homebrew if you can wrap/convert data to the target mapper/driver.
- SID (PSID/RSID): C64 playback/archival formats — good for distribution; for native C64 engines, prefer tracker exports or register dumps.
- MOD / ProTracker / GoatTracker: module/tracker formats used by Amiga and many ports — directly usable in many homebrew/demo contexts.
- SPC: SNES-specific sound file; useful for emulated playback and reference; for SNES homebrew prefer BRR sample banks + player data.
- Tracker native formats: hUGETracker (`.uge`) for Game Boy, FamiTracker (`.ftm`) for NES-style composition workflows, GoatTracker for SID/C64 — provide the smoothest path to homebrew integration.
- WAV/OGG: rendered audio for previews and DAW workflows. Not directly playable on constrained hardware without conversion, but useful for testing and documentation.
- MIDI: Good for DAW/choreography workflows but not a hardware-native format; requires conversion to engine-specific drivers for homebrew.

## Implementation considerations

- Provide two layers of exports for each chip where feasible:
  - Tracker-native / module exports (human-editable where available)
  - Driver/register-stream exports (VGM, NSF, SID, raw register dumps) for direct inclusion in homebrew engines
- For sample-based chips (Amiga, SNES) support BRR/packed sample export and sample bank manifests.
- Provide tooling/recipes in `docs/` showing how to convert BeatBax exports into target-specific driver data (e.g., BeatBax → hUGETracker/UGE → GB builder).

## Plugin naming convention examples

- `@beatbax/plugin-chip-gameboy`
- `@beatbax/plugin-chip-nes`
- `@beatbax/plugin-chip-sid`
- `@beatbax/plugin-chip-ym2612`