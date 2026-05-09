---
title: "AY-3-8910 / YM2149 Chip Plugin"
status: proposed
authors: ["kadraman","GitHub Copilot"]
created: 2026-05-09
issue: "https://github.com/kadraman/beatbax/issues/108"
---

## Summary

Implement `@beatbax/plugin-chip-ay3-8910` — a BeatBax chip plugin for the General Instrument AY-3-8910 PSG (Programmable Sound Generator) and its Yamaha clone variant YM2149. The plugin will support the three-channel PSG architecture, on-chip envelope generator, and noise subsystem used across Atari ST, MSX, Amstrad CPC, and other 1980s platforms. Export formats will include VGM register streams, WAV/OGG rendered audio, and MIDI for preview/DAW integration.

---

## Problem Statement

The AY-3-8910 (and functionally identical YM2149) is a foundational PSG used in numerous 8-bit and 16-bit platforms with active homebrew communities. BeatBax currently supports the related SN76489 (SMS), but the AY-3-8910 family remains unimplemented, limiting the ability to compose music for:

- **Atari ST** — one of the most popular platforms using the YM2149 variant for native chiptune production
- **MSX / MSX2** — widespread 8-bit computer platform with dedicated music production workflows
- **Amstrad CPC** — popular European microcomputer with active homebrew scene
- **Vectrex** — arcade-like vector graphics console
- **ZX Spectrum 128** (via AY-3-8912)

The chip shares significant PSG semantics with the SN76489 (already implemented) but has crucial differences in envelope handling and feature set that require dedicated support:

1. **Programmable envelope generator** — the AY-3-8910 has an on-chip 16-bit counter with selectable envelope shapes (attack-decay, repeat modes), whereas SN76489 has only simple decay
2. **Per-channel noise control** — noise can be mixed independently on each channel
3. **Register-based noise rate** — noise rate is set via separate I/O register, not inline with tone commands
4. **Mixer control** — explicit tone/noise enable bits per channel (separate from volume)

Without dedicated plugin support, composers cannot take advantage of the chip's envelope capabilities or properly map songs to Atari ST / MSX production workflows.

---

## Proposed Solution

### Summary

Implement a complete AY-3-8910 plugin by:

1. **Define the AST extension** — add instrument types and channel options specific to the chip's envelope modes
2. **Implement the `ChipChannelBackend`** — three melodic channels (A, B, C) with envelope, noise, and mixer control
3. **Add parser / language support** — instrument directives for envelope shape and noise behavior
4. **Implement dual rendering** — PCM render (CLI) + Web Audio playback (browser/Electron)
5. **Export support** — VGM v1.61 register stream via the multi-chip VGM exporter plugin
6. **New Song Wizard templates** — sample instruments, effects, and structure for quick Atari ST / MSX onboarding

---

### Technical Overview

#### Hardware Characteristics

| Property | Value | Notes |
|---|---|---|
| **Channels** | 3 PSG channels (A, B, C) | Monophonic, no hardware multi-note channels |
| **Frequency range** | ~31 Hz – 125 kHz | 12-bit tone value (0x000–0xFFF) |
| **Volume** | 4-bit (16 levels, 0–15) | Linear attenuation OR 2-bit + envelope |
| **Noise** | 5-bit noise rate | Independent mixer bit per channel |
| **Envelope** | 16-bit counter, 16 shapes | Attack-decay, repeat, decay-only, etc. |
| **Clock rate** | 1.77–2.0 MHz (platform-dependent) | Atari ST: 2.0 MHz; MSX: 3.58 MHz nominal / 1.79 MHz effective |
| **I/O registers** | 16 x 8-bit | Address latch + data I/O model (write-only) |

#### Platforms and Clocking

| Platform | Chip | Clock (MHz) | CPU | Year | Notes |
|---|---|---|---|---|---|
| **Atari ST** | YM2149 | 2.0 | Motorola 68000 | 1985 | Yamaha clone; primary platform for AY music |
| **MSX** | AY-3-8910 | 1.79 | Zilog Z80 | 1983+ | Standard sound chip; clock divided from main crystal |
| **MSX2** | YM2149 | 1.79 | Zilog Z80 | 1986+ | Yamaha variant; same timing as original MSX |
| **Amstrad CPC** | AY-3-8910 | 1.0 | Zilog Z80 | 1984 | Slower clock; fewer envelope modes usable |
| **Vectrex** | AY-3-8910 | 1.5 | Motorola 6809 | 1982 | Arcade-style vector console; less common in homebrew |
| **ZX Spectrum 128** | AY-3-8912 | 1.77 | Zilog Z80 | 1986 | Variant with reduced I/O; Spectrum AY is present but undocumented |

---

### Language Extensions

#### Instrument Definition

Instruments for AY-3-8910 will extend the existing BeatBax instrument syntax with envelope and noise-shape parameters:

```bax
# Basic tone instrument (no envelope, simple decay via volume macro)
inst lead type=tone vol=12

# Tone with built-in envelope generator
inst pad type=tone env=attack_decay vol=use_envelope

# Tone with noise mixed
inst bass type=tone noise=on noise_rate=12 vol=12

# Pure noise (percussion)
inst kick type=noise noise_rate=8 vol=14 env=decay_quick

# Filtered tone + envelope
inst bell type=tone env=repeat_decay vol=use_envelope brightness=high
```

#### Instrument Grammar

New BeatBax instrument fields for AY-3-8910 channels:

| Field | Type | Values | Default | Description |
|---|---|---|---|---|
| `type` | enum | `tone`, `noise` | `tone` | Channel mode |
| `env` | enum | `none`, `attack_decay`, `attack_decay_repeat`, `decay_only`, `decay_repeat`, `attack_only`, `hold`, `attack_hold` | `none` | Envelope shape (maps to AY register 0x0D bits 0–3) |
| `noise_rate` | int | 0–31 | 0 | Noise generator rate register (0x06 value) |
| `noise` | enum | `on`, `off` | `off` | Enable noise mixing on this channel |
| `vol` | int | 0–15 | 15 | Direct volume OR `use_envelope` to use envelope amplitude |
| `use_envelope` | bool | true / false | false | If true, envelope generator controls volume; ignore `vol` field |

**Semantics:**
- When `vol=use_envelope` (or `env` is non-`none` and no explicit `vol`), the channel volume is controlled by the envelope generator's 4-bit output, and the channel's direct volume register (0x08–0x0A) is set to maximum (15).
- When `type=noise`, the channel mixes only noise; tone is masked off.
- When `noise=on` with `type=tone`, both tone and noise are mixed into the channel's output.
- The `noise_rate` register is global (0x06) but is typically set once per song or per sequence context. During multi-chip playback, BeatBax will validate that all active AY channels use compatible noise rates or emit a warning.

#### No New Top-Level Directives

The AY-3-8910 does not require song-level extensions (like `scale`, `chip region`, etc.); it is configured via the `chip ay3-8910` or `chip ym2149` directive and channel-level instrument choices.

---

### Export Formats

#### 1. VGM (Video Game Music) Register Stream

Via `@beatbax/plugin-exporter-vgm`, the engine will export AY-3-8910 register writes as VGM v1.61+. The VGM header will correctly set:

- `vgm_aylChip` (if supported in the VGM version)
- Clock rate based on `song.chipRegion` (Atari ST: 2.0 MHz; MSX: 1.79 MHz; default to 2.0 MHz)
- Register writes in the correct port I/O sequence (address latch + data byte)

**VGM Compatibility:**
- Playable in VGMPlay, mesen, Foobar2000 (with VGM plugin), OpenMSX, and other emulators with AY support
- Exportable to native Atari ST / MSX executable via third-party converters (e.g., PSGplay, Vgm2PSG)

#### 2. MIDI (preview / DAW integration)

Like other BeatBax chips, AY-3-8910 will export MIDI with:
- Note pitch mapped to MIDI note numbers (assuming equal temperament)
- Channel 1 / 2 / 3 → MIDI channels 1 / 2 / 3
- Instrument volume → MIDI velocity
- Envelope shape ignored (MIDI has no envelope-shape equivalent)

#### 3. WAV / OGG (rendered audio)

Full audio rendering via the dual-path renderer (PCM + Web Audio node graph). Quality equivalent to Atari ST / MSX hardware playback at the configured sample rate.

---

### Parser & AST Changes

#### Instrument AST Node

The existing `InstrumentNode` in the BeatBax AST will be extended to support optional AY-specific fields:

```typescript
// Pseudo-TypeScript; actual AST lives in schema/ast.schema.json

interface InstrumentNode {
  id: string;
  chipId: 'gameboy' | 'nes' | 'sms' | 'ay3-8910' | 'ym2149' | ...;

  // Existing fields
  type?: 'tone' | 'noise' | 'mixed';

  // AY-specific (optional, ignored for other chips)
  env?: 'none' | 'attack_decay' | 'attack_decay_repeat' | ...;
  noise_rate?: number;  // 0–31
  noise?: 'on' | 'off';
  vol?: number | 'use_envelope';
  use_envelope?: boolean;
}
```

#### Parser Validation

The parser will:
1. Reject invalid `env` shape values with a diagnostic
2. Validate `noise_rate` in range 0–31
3. Warn if `use_envelope=true` but `env=none` (no envelope shape configured)
4. Reject nonsensical combinations (e.g., `type=noise vol=use_envelope` without an envelope)

---

### Implementation Phases

#### Phase 1: Core Backend (weeks 1–2)

- Implement `ChipChannelBackend` for AY-3-8910
  - Oscillator, noise, and envelope generators
  - State machine for envelope shapes (attack-decay, decay-repeat, etc.)
  - Mixer control (tone/noise per channel)
- Implement `ChipPlugin` interface
  - Channel factory
  - Instrument validation
  - Clock rate + frame rate setup
- PCM render path for CLI / headless playback
- **Test:** Full unit test suite for oscillator, envelope, and mixer; integration tests for multi-channel playback

#### Phase 2: Web Audio & Effects (weeks 2–3)

- Implement `createPlaybackNodes()` for Web Audio browser playback
- Integrate with effects system (`effects/index.ts`) for real-time audio processing
- Add envelope parser helper (if shared utility is not already available)
- **Test:** Web Audio node graph tests; browser playback verification

#### Phase 3: Language & AST (week 3)

- Extend parser to recognize AY-specific instrument fields
- Update Peggy grammar with `env=...`, `noise=...`, `noise_rate=...`
- Add AST validator rules for AY instruments
- Update schema `ast.schema.json`
- **Test:** Parser unit tests; error message validation

#### Phase 4: VGM Export (week 4)

- Update `@beatbax/plugin-exporter-vgm` to handle AY-3-8910 register writes
- Implement register sequencer (address latch + data I/O)
- Set correct clock rate based on `chipRegion`
- **Test:** VGM file validation; playback in VGMPlay; register sequence correctness

#### Phase 5: UI & New Song Wizard (week 4)

- Add UI contributions (`uiContributions`) with Atari ST / MSX help docs
- Implement `newSongWizard` templates for quick onboarding
- Create documentation and examples
- **Test:** Web UI rendering; template correctness

#### Phase 6: Documentation & Release (week 5)

- Add plugin to `docs/contributing/creating-plugins.md`
- Create tutorial: "Composing for Atari ST with BeatBax"
- Publish to npm as `@beatbax/plugin-chip-ay3-8910`
- Update ROADMAP
- **Test:** Full integration test; end-to-end composition + export workflow

---

### New Song Wizard Templates

The `newSongWizard` field will provide quick-start templates for Atari ST and MSX contexts:

#### Metadata

```typescript
metadata: {
  chipDisplayName: 'AY-3-8910 (Atari ST)',
  platform: 'Atari ST / MSX / Amstrad CPC',
  year: '1980s',
  channelSummary: '3 PSG channels with envelope',
}
```

#### Sample Instruments Template

```bax
# Three-channel PSG with envelope support
inst lead type=tone env=attack_decay vol=use_envelope
inst bass type=tone env=decay_only vol=12 noise=off
inst pad type=tone env=attack_decay_repeat vol=use_envelope
inst kick type=noise noise_rate=12 env=decay_quick vol=14
```

#### Sample Effects Template

```bax
effect vibrato = vib:2,4,sine,3
effect decay = env:decay_quick
```

#### Sample Structure Template

```bax
pat intro =
  C4 E4 G4 A4
  G4 E4 C4 D4

seq main =
  intro
  intro

play
```

---

## Implementation Plan

### Code Structure

```
packages/plugins/chip-ay3-8910/
├── src/
│   ├── index.ts                 # ChipPlugin export
│   ├── version.ts               # Version constant
│   ├── channels.ts              # ChipChannelBackend implementation
│   ├── envelope.ts              # Envelope generator state machine
│   ├── oscillator.ts            # Tone & noise generators
│   ├── mixer.ts                 # Channel mixer / output
│   ├── render.ts                # PCM render path
│   ├── webaudio.ts              # Web Audio node graph
│   └── ui-contributions.ts      # Help docs, Copilot system prompt
├── tests/
│   ├── envelope.test.ts
│   ├── oscillator.test.ts
│   ├── integration.test.ts
│   └── render.test.ts
├── package.json
├── tsconfig.json
├── README.md
└── .npmrc
```

### AST & Parser Changes

- Update `schema/ast.schema.json` to document AY-specific `InstrumentNode` fields
- Extend `Peggy` grammar in `packages/engine/src/parser/` to parse `env=`, `noise=`, `noise_rate=` directives
- Add validation rules to `packages/engine/src/resolver/` for AY instrument fields

### VGM Export Changes

- Update `packages/plugins/exporter-vgm/src/` to emit AY-3-8910 register writes
- Add `chipRegion` → clock rate mapping for Atari ST / MSX / Amstrad CPC
- Test VGM output with VGMPlay

### Dependencies

- Core: `@beatbax/engine` (ChipPlugin interface, types)
- Export: `@beatbax/plugin-exporter-vgm` (VGM output support)
- Optional: `@beatbax/plugin-exporter-famitracker` (for MIDI preview via internal conversion, if needed)

---

## Testing Strategy

### Unit Tests

1. **Envelope generator** — verify all 16 envelope shapes produce correct amplitude curves over time
2. **Oscillator** — verify correct tone frequency generation across the full 12-bit range
3. **Noise generator** — verify LFSR correctness and noise rate register mapping
4. **Mixer** — verify correct mixing of tone + noise per channel
5. **Instrument validation** — reject invalid `env` shapes, `noise_rate` out of range, nonsensical combinations

### Integration Tests

1. **Multi-channel playback** — compose a three-channel song with different instruments and verify correct audio output
2. **Envelope timing** — verify envelope state advances correctly frame-by-frame
3. **VGM export** — export a song to VGM, validate register sequence, play in VGMPlay
4. **Web Audio playback** — verify Web Audio node graph produces correct audio via AudioContext
5. **New Song Wizard** — verify templates render correctly in web UI; verify sample instruments load without error
6. **Atari ST & MSX compatibility** — compare rendered WAV output against reference recordings from real hardware (if available)

### Regression Tests

- Existing Game Boy, NES, SMS tests must continue to pass
- VGM exporter tests must handle AY-3-8910 chips without breaking other chip outputs
- Parser must not regress on existing instrument syntax

---

## Migration Path

This is a new feature with no breaking changes to existing APIs. Composers without AY-3-8910 plugins loaded will not be affected. Existing songs remain valid.

---

## Implementation Checklist

- [ ] Envelope generator implementation + unit tests
- [ ] Oscillator + noise generator + unit tests
- [ ] ChipChannelBackend implementation
- [ ] ChipPlugin interface implementation
- [ ] PCM render path
- [ ] Web Audio node graph
- [ ] Parser grammar extensions
- [ ] AST schema updates
- [ ] VGM exporter support
- [ ] New Song Wizard templates
- [ ] UI contributions (help docs, system prompt)
- [ ] Integration tests (multi-channel, export, playback)
- [ ] Documentation (plugin guide, tutorial)
- [ ] npm publish
- [ ] ROADMAP update

---

## Future Enhancements

1. **YM2612 (Genesis FM + PSG)** — full FM synthesis support alongside PSG; leverage AY backend for PSG channels
2. **OPL2 (AdLib FM)** — 2-op FM synthesis
3. **Per-platform preset library** — curated instrument presets for Atari ST, MSX, Amstrad CPC
4. **Live envelope visualization** — real-time envelope curve display in web UI
5. **Native Atari ST exporter** — direct `.snd` or `.xbios` driver export (beyond VGM)
6. **Comparison mode** — side-by-side waveform comparison with real Atari ST / MSX hardware

---

## Open Questions

1. **Noise rate synchronization** — When multiple AY channels use noise, is a single global noise generator shared (as in hardware), or should each channel have independent LFSR state? Answer: **Shared LFSR** (matches hardware); noise rate is global per song context.

2. **Envelope repeat behavior** — The AY envelope can repeat (attack-decay-repeat, decay-repeat) with a fixed period. Should BeatBax allow per-note envelope restarts, or should envelope state be channel-wide? Answer: **Channel-wide envelope state**, restarted on note-on; repeating envelopes continue indefinitely until note-off.

3. **Clocking and region locking** — Should a BeatBax song specify `chipRegion` (e.g., `chipRegion atari-st-2mhz`, `chipRegion msx-1-79mhz`) to lock the clock rate and export behavior? Answer: **Yes**, add `chipRegion` field to song AST; default to Atari ST 2.0 MHz if unspecified.

4. **Mixer mode semantics** — Is there a distinction between "tone disabled, noise only" (type=noise) vs "tone + noise mixed" (type=tone noise=on)? Answer: **Yes**; `type=noise` disables tone; `noise=on` enables mixing.

---

## References

- AY-3-8910 datasheet: https://www.general-instruments.com/semiconductors/sound/ay-3-8910
- YM2149 datasheet (Yamaha clone): https://en.wikipedia.org/wiki/YM2149
- VGM format specification: http://www.smspower.org/uploads/Music/vgmspec_v161.txt
- Atari ST sound system: https://www.atarimuseum.com/computers/16bit/st/ststuff.html
- MSX audio architecture: https://www.msx.org/wiki/Sound_Chip
- Amstrad CPC audio guide: https://www.cpcwiki.eu/index.php/Sound_Chip

---

## Additional Notes

- The AY-3-8910 and YM2149 are functionally equivalent; BeatBax will treat them as the same chip with `name: 'ay3-8910'` and aliases `['ym2149', 'psg']` in the plugin registry.
- The ZX Spectrum 128 uses an AY-3-8912 (subset), but the AY-3-8910 plugin will support it as a compatibility target.
- Atari ST remains the primary reference platform due to its popularity in chiptune communities and well-documented toolchains (e.g., Digital Magic, Oktalyzer).
- Clock rate defaults to 2.0 MHz (Atari ST) for best compatibility; MSX compositions should set `chipRegion msx` to use 1.79 MHz and obtain correct playback tempo.
