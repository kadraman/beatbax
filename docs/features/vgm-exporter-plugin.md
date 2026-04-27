---
title: "VGM Exporter Plugin"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-04-27
issue: "https://github.com/kadraman/beatbax/issues/99"
---

## Summary

Implement a VGM (Video Game Music) exporter as a standalone BeatBax exporter plugin (`@beatbax/plugin-exporter-vgm`) that converts a validated ISM into a standard `.vgm` register stream file.

Initial target: **Sega Master System / Game Gear SN76489 PSG**.

Designed to extend to additional chips (e.g. Genesis YM2612 + SN76489, PC-Engine HuC6280) in later versions without core changes.

---

## Problem Statement

BeatBax has mature Game Boy and NES chip plugins with export paths to hardware-compatible formats (UGE for Game Boy, FamiTracker `.ftm` and FamiStudio `.fms` for NES). The SMS chip plugin (`@beatbax/plugin-chip-sms`) has no equivalent native export path.

VGM is the standard open format for Sega hardware music. It is:

- Natively supported by every major SMS/Game Gear emulator (Mesen, OpenMSX, RetroArch).
- Playable on real hardware via flash cartridges and dedicated VGM players.
- Required for sharing SMS/Game Gear compositions outside of BeatBax.
- Used as a common verification format when comparing emulator accuracy against reference hardware behaviour.

Without VGM export, SMS compositions authored in BeatBax cannot leave the BeatBax ecosystem.

---

## Proposed Solution

### Summary

Create `packages/plugins/exporter-vgm/` as a standalone npm package (`@beatbax/plugin-exporter-vgm`) that:

- Implements the `ExporterPlugin` interface from `packages/engine/src/export/types.ts`
- Consumes a validated ISM produced by the SMS chip plugin
- Emits a spec-compliant VGM file (version 1.61 minimum for SN76489 + Game Gear stereo support)
- Supports GD3 tag metadata (title, system, composer, date, notes) sourced from ISM metadata fields
- Declares `supportedChips: ['sms']` in v1; other chips can be added in later versions

The SMS chip plugin (`@beatbax/plugin-chip-sms`) will declare this exporter in its `exporterPlugins` array so that installing the SMS plugin is sufficient to make `beatbax export vgm` available without a separate install.

### VGM Format Overview (SN76489)

VGM is a binary format. The relevant structure for SN76489 export is:

#### Header (minimum 64 bytes at offset 0x00)

| Offset | Size | Field | SMS value |
|--------|------|-------|-----------|
| `0x00` | 4 | Magic | `"Vgm "` (0x56 0x67 0x6D 0x20) |
| `0x04` | 4 | EOF offset | Relative to `0x04`; total file size − 4 |
| `0x08` | 4 | Version | `0x00000161` (VGM 1.61) |
| `0x0C` | 4 | SN76489 clock | `3579545` (NTSC) or `3546895` (PAL) in Hz |
| `0x10` | 4 | YM2413 clock | `0` (not used for SMS PSG-only export) |
| `0x14` | 4 | GD3 offset | Relative to `0x14`; `0` if no GD3 tag |
| `0x18` | 4 | Total samples | Total 44100 Hz sample count for the track |
| `0x1C` | 4 | Loop offset | Relative to `0x1C`; `0` if no loop |
| `0x20` | 4 | Loop samples | Sample count in loop region; `0` if no loop |
| `0x24` | 4 | Rate | Frame rate hint (60 for NTSC, 50 for PAL); `0` = auto |
| `0x28` | 2 | SN76489 feedback | `0x0009` (standard SMS LFSR feedback) |
| `0x2A` | 1 | SN76489 shift register width | `16` |
| `0x2B` | 1 | SN76489 flags | `0` (standard) |
| `0x34` | 4 | VGM data offset | Relative to `0x34`; `0x4C` (points past header to data start) |

> **Version 1.61 minimum** is required for the `0x4F` Game Gear stereo command. If Game Gear stereo is not used, version 1.10 is sufficient. The exporter should always write 1.61 for simplicity.

#### Command Bytes (VGM data stream)

| Byte | Description |
|------|-------------|
| `0x4F <dd>` | Game Gear stereo byte write. `dd` encodes L/R enable per channel (bits 4–7 = left, 0–3 = right for Tone1/Tone2/Tone3/Noise). |
| `0x50 <dd>` | SN76489 PSG write. `dd` is the register byte as described in the hardware guide. |
| `0x61 <lo> <hi>` | Wait `(hi << 8 | lo)` samples (16-bit little-endian). |
| `0x62` | Wait 735 samples (= 1/60 s at 44100 Hz). |
| `0x63` | Wait 882 samples (= 1/50 s at 44100 Hz). |
| `0x66` | End of sound data. |

#### SN76489 Register Write Encoding

Tone channel period (10-bit value `N`):

```
Byte 1 (latch):  1  CH CH  0  D3 D2 D1 D0   ; low 4 bits of N; CH = channel 0–2
Byte 2 (data):   0  0  D9 D8 D7 D6 D5 D4   ; high 6 bits of N
```

Volume (4-bit attenuation `V`, 0 = max, 15 = mute):

```
Byte 1 (latch):  1  CH CH  1  V3 V2 V1 V0   ; CH = channel 0–3
```

Noise control:

```
Byte 1:          1  1  1  0  0  FB R1 R0   ; FB = feedback mode (0=periodic, 1=white); R1R0 = rate (0–2) or 3 = Tone3
```

#### GD3 Tag (Metadata)

GD3 is appended after the VGM data stream. All strings are UTF-16LE, each terminated by `\0\0`.

| Field | Source |
|-------|--------|
| Track title (English) | ISM `metadata.title` |
| Track title (Japanese) | Empty |
| Game name (English) | ISM `metadata.game` or empty |
| Game name (Japanese) | Empty |
| System name (English) | `"Sega Master System"` or `"Sega Game Gear"` based on `gg:pan` usage |
| System name (Japanese) | Empty |
| Track author (English) | ISM `metadata.author` or empty |
| Track author (Japanese) | Empty |
| Date | ISM `metadata.date` or empty |
| VGM creator | `"BeatBax @beatbax/plugin-exporter-vgm <version>"` |
| Notes | ISM `metadata.notes` or empty |

### ISM → VGM Translation

The scheduler expands all software macros (`vol_env`, `arp_env`, `pitch_env`, `noise_rate_env`) into per-tick register-level events before export. The VGM exporter operates entirely on the expanded ISM event stream:

```
for each tick in ISM:
  collect all PSG state changes in this tick
  emit 0x50 <byte> for each changed register (in channel order: Tone1, Tone2, Tone3, Noise, Volume×4)
  emit 0x4F <stereo> if gg:pan state changed (Game Gear target only)
  emit wait command for elapsed samples since last write
```

Tick-to-sample conversion:

$$
\text{samples per tick} = \frac{44100}{\text{ticksPerSecond}}
$$

Where `ticksPerSecond = (BPM × ticksPerBeat) / 60`.

Wait commands are emitted using the most compact encoding:
- Prefer `0x62` (735 samples) and `0x63` (882 samples) for whole 60/50 Hz frames.
- Use `0x61 <lo> <hi>` for non-frame-aligned waits.
- Accumulate consecutive zero-change ticks into a single wait rather than emitting redundant PSG writes.

### Effects Handling

Because VGM is a register-stream format, BeatBax effects are handled by the scheduler before the VGM exporter is invoked. The exporter never inspects effect AST nodes directly — it only sees the expanded per-tick ISM event stream. This means effect fidelity in VGM output is determined entirely by how accurately the scheduler can express each effect as SN76489 register writes.

| Effect | VGM Export | Export mechanism | Fidelity notes |
|--------|------------|-----------------|----------------|
| `pan` / `gg:pan` | ✅ Exported | `0x4F` stereo command on each `gg:pan` state change | Discrete L/C/R only. Generic `pan` numeric values are snapped to nearest discrete routing before export. Requires VGM ≥ 1.61. |
| `vib` | ✅ Exported | Per-tick period writes (`0x50`) as the scheduler steps the LFO | Fidelity is constrained by the 10-bit period register. Fine vibrato depth may be unachievable at high pitches (small period → coarse steps). |
| `port` | ✅ Exported | Stepped period writes per tick toward target pitch | Non-linear curves (exp, log) are quantised to integer period steps. Slides are perceptibly coarser at low pitches. |
| `arp` | ✅ Exported | Per-tick period writes cycling through semitone offsets | Classic SMS technique. Clean export. |
| `volSlide` | ✅ Exported | Per-tick volume writes (`0x50`, volume latch byte) | 4-bit attenuation (16 steps). Smooth fade curves are quantised; steep slides may produce audible stairstepping. |
| `trem` | ✅ Exported | Periodic per-tick volume writes simulating amplitude LFO | Same 4-bit quantisation as `volSlide`. High-rate tremolo with low depth may be inaudible after quantisation. |
| `cut` | ✅ Exported | Single volume write setting attenuation to `15` (mute) at the cut tick | Exact and reliable. |
| `retrig` | ⚠️ Exported with warning | Period register rewrite at each retrigger tick; volume envelope restarted | SN76489 has no explicit key-on. Phase reset on period rewrite is implementation-defined and may differ between VGM players and real hardware. The exporter emits the register writes and appends a GD3 note warning. |
| `bend` | ✅ Exported | Stepped period writes toward target pitch with optional curve | Same quantisation constraints as `port`. |
| `sweep` | ❌ Rejected at validation | N/A | `sweep` is a Game Boy NR10 hardware feature. The SMS chip validator rejects it before export is attempted. |
| `echo` | ❌ Rejected at validation | N/A | No delay buffer and no spare channels on SN76489. The SMS chip validator rejects it before export is attempted. |

**Effect export summary:**
- ✅ 9 of 11 effects export to VGM via the register write stream.
- ⚠️ `retrig` emits register writes but appends a GD3 note warning about phase-reset emulation variance.
- ❌ `sweep` and `echo` never reach the exporter — they are hard errors at the SMS chip validation stage.

#### `retrig` GD3 warning

When the ISM contains retrigger events, the exporter appends the following to the GD3 notes field:

```
[BeatBax] retrig effect used: SN76489 phase reset on period rewrite is emulation-dependent.
Behaviour may differ between VGM players and real hardware.
```

This warning does not block export — the VGM file is still written.

### PSG State Tracking

The exporter maintains a shadow register map to avoid redundant writes:

```typescript
interface SN76489State {
  tonePeriod: [number, number, number];   // 10-bit, channels 0–2
  volume: [number, number, number, number]; // 4-bit attenuation, channels 0–3
  noiseControl: number;                   // feedback + rate bits
  ggStereo: number;                       // 8-bit Game Gear stereo register (0xFF = all channels both sides)
}
```

A register write is emitted only when the new value differs from the shadow state. On song start, emit all registers unconditionally to establish a known hardware state (some VGM players start from an undefined register state).

### Package Structure

```
packages/plugins/exporter-vgm/
├── package.json             # @beatbax/plugin-exporter-vgm, peerDep: @beatbax/engine ^1.0.0
├── tsconfig.json
├── src/
│   ├── index.ts             # ExporterPlugin entry point
│   ├── vgmWriter.ts         # VGM binary builder (header, commands, GD3)
│   ├── ismToVgm.ts          # ISM event → PSG register write translation
│   ├── psgState.ts          # SN76489 shadow register state tracker
│   ├── gd3.ts               # GD3 tag encoder (UTF-16LE strings)
│   └── constants.ts         # Clock values, command bytes, register masks
└── tests/
    ├── vgmWriter.test.ts
    ├── ismToVgm.test.ts
    ├── psgState.test.ts
    ├── gd3.test.ts
    └── vgm-exporter.test.ts  # Integration: full ISM → VGM round-trip
```

### Example Plugin Entry Point

```typescript
// packages/plugins/exporter-vgm/src/index.ts
import type { ExporterPlugin } from '@beatbax/engine';
import { buildVgm } from './vgmWriter.js';

const vgmExporterPlugin: ExporterPlugin = {
  id: 'vgm',
  label: 'VGM (Video Game Music)',
  version: '1.0.0',
  extension: 'vgm',
  mimeType: 'audio/x-vgm',
  supportedChips: ['sms'],

  validate(ism) {
    if (ism.chip !== 'sms') {
      return { valid: false, errors: [`VGM exporter (SN76489): unsupported chip '${ism.chip}'`] };
    }
    return { valid: true };
  },

  export(ism, _options) {
    return buildVgm(ism);
  },
};

export default vgmExporterPlugin;
```

### SMS Chip Plugin Declaration

Once the VGM exporter is available, the SMS chip plugin declares it:

```typescript
// packages/plugins/chip-sms/src/index.ts
import vgmExporterPlugin from '@beatbax/plugin-exporter-vgm';

const smsPlugin: ChipPlugin = {
  name: 'sms',
  exporterPlugins: [vgmExporterPlugin],
  // ...
};
```

Installing `@beatbax/plugin-chip-sms` then automatically makes `beatbax export vgm` available with no separate install.

### CLI Usage

```bash
# Export to VGM
beatbax export vgm song.bax song.vgm

# List available exporters for the SMS chip
beatbax list-exporters --chip sms

# Verify the song is valid for VGM export
beatbax verify --chip sms song.bax
```

---

## Implementation Plan

### Phase 1 — Core Binary Builder (`vgmWriter.ts`, `constants.ts`)

- Define all command byte constants and header field offsets.
- Implement `writeVgmHeader(buf, params)`: writes the 64-byte header with correct relative offsets.
- Implement `appendCommand(buf, ...bytes)`: appends command bytes to the data stream buffer.
- Implement `appendWait(buf, samples)`: selects the most compact wait encoding.
- Implement `finaliseHeader(buf, dataSectionLength, totalSamples, gd3Offset)`: patches the EOF and total samples fields after the data section is fully built.

### Phase 2 — PSG State Tracker (`psgState.ts`)

- Implement `SN76489State` with shadow register map initialised to hardware power-on state (all channels muted).
- `applyTonePeriod(channel, period)` → returns dirty register bytes if changed.
- `applyVolume(channel, attenuation)` → returns dirty register byte if changed.
- `applyNoiseControl(mode, rate)` → returns dirty register byte if changed.
- `applyGgStereo(byte)` → returns `0x4F` command byte if changed.
- `flush()` → returns all current register bytes (used at song start to establish initial state).

### Phase 3 — ISM Translator (`ismToVgm.ts`)

- Iterate the ISM event list in tick order.
- Per tick: call `applyX()` methods on `SN76489State` for all events in that tick.
- Emit dirty register bytes as `0x50` commands.
- Emit `0x4F` command if Game Gear stereo changed.
- Accumulate elapsed samples and emit wait commands.
- Emit `0x66` end-of-data marker.
- Return `{ dataBuffer: Uint8Array, totalSamples: number }`.

### Phase 4 — GD3 Encoder (`gd3.ts`)

- Encode each metadata string as a null-terminated UTF-16LE byte sequence.
- Build and prepend the 12-byte GD3 header: magic `"Gd3 "`, version `0x100`, and total data length.
- Return the complete GD3 block as a `Uint8Array`.

### Phase 5 — Entry Point and Integration (`index.ts`)

- Wire `ismToVgm` + `vgmWriter` + GD3 together in `buildVgm(ism): Uint8Array`.
- Export the `ExporterPlugin` object.
- Add the package to `packages/plugins/chip-sms/package.json` as a peer dependency.
- Declare the plugin in the SMS chip plugin's `exporterPlugins` array.

---

## Testing Strategy

### Unit Tests

| Test file | Scope |
|-----------|-------|
| `vgmWriter.test.ts` | Header field byte positions and values; wait command selection (0x61 vs 0x62 vs 0x63); EOF offset calculation |
| `psgState.test.ts` | Shadow state deduplication (no write if unchanged); tone period 2-byte encoding; volume byte encoding; noise control encoding; GG stereo byte encoding |
| `gd3.test.ts` | UTF-16LE encoding; empty string → `\0\0`; GD3 header magic and length field |
| `ismToVgm.test.ts` | Single note → correct period + volume writes; volume macro → per-tick volume writes; pitch macro → per-tick period writes; arp macro → per-tick period sequence; noise_rate_env → per-tick noise control writes; GG stereo transitions → 0x4F commands; multi-channel ordering; `vib` effect → per-tick period modulation writes; `port` effect → stepped period writes reaching target; `volSlide` effect → per-tick attenuation writes; `trem` effect → periodic attenuation writes; `cut` effect → single mute write at cut tick; `retrig` effect → period rewrite at retrigger ticks + GD3 note appended; `bend` effect → stepped period writes with curve |

### Integration Tests

- Full pipeline: parse `.bax` → resolve → schedule → ISM → VGM.
- Round-trip determinism: same input always produces byte-for-byte identical VGM output.
- Verify VGM header total samples field matches actual wait command sum.
- Verify VGM output is accepted by at least one reference parser (e.g. the open-source `vgm` npm package or a Python VGM parser test fixture).
- Verify `beatbax export vgm song.bax song.vgm` CLI integration.

### Regression Tests

- No behavioral changes to Game Boy or NES chip plugins or their exporters.
- Installing `@beatbax/plugin-chip-sms` does not affect non-SMS `beatbax export` invocations.

---

## Migration Path

No migration required. VGM is a new export target; existing songs and export commands are unaffected.

---

## Implementation Checklist

- [ ] Create `packages/plugins/exporter-vgm/` package scaffold
- [ ] Implement `constants.ts` (command bytes, header offsets, clock values)
- [ ] Implement `vgmWriter.ts` (header builder, command appender, wait encoder)
- [ ] Implement `psgState.ts` (shadow register state tracker)
- [ ] Implement `ismToVgm.ts` (ISM event → PSG register write loop)
- [ ] Implement `gd3.ts` (UTF-16LE GD3 tag encoder)
- [ ] Implement `index.ts` (ExporterPlugin entry point)
- [ ] Add unit tests (all files)
- [ ] Add integration tests (parse → ISM → VGM round-trip)
- [ ] Add `@beatbax/plugin-exporter-vgm` as peer dependency in SMS chip plugin
- [ ] Declare `vgmExporterPlugin` in SMS chip plugin `exporterPlugins` array
- [ ] Verify CLI `beatbax export vgm` works end-to-end
- [ ] Add example VGM output to `songs/features/sms/`
- [ ] Document Game Gear stereo behaviour in VGM output (0x4F command, version 1.61)
- [ ] Verify `retrig` emits GD3 note warning (not a hard error)
- [ ] Verify `sweep` and `echo` are rejected before export stage (SMS chip validator, not VGM exporter)

---

## Future Enhancements

- **Genesis / Mega Drive support:** Add `supportedChips: ['genesis']` and handle dual-chip VGM headers (SN76489 + YM2612 clocks, interleaved register writes).
- **Loop point detection:** Map BeatBax `loop` directive to VGM loop offset and loop sample count fields.
- **Compressed VGZ output:** Optional `.vgz` (gzip-compressed VGM) output via the standard Node.js `zlib` module; CLI `--format vgz` alias.
- **VGM validation mode:** `beatbax verify --format vgm song.bax` pre-flight check that warns on features that cannot be represented in VGM (e.g., non-hardware-accurate timing, future chip-specific fields).
- **Multi-track VGM:** Some SMS games use multiple tracks in a single file; a `--multi-track` option could bundle an entire BeatBax project's songs into one VGM container.

---

## Open Questions

1. Should the exporter use NTSC clock (`3579545 Hz`) by default and allow `--pal` flag for PAL clock (`3546895 Hz`), or should the clock be derived from an ISM metadata field?
2. Should loop detection be in-scope for v1 or deferred to a future enhancement?
3. Should the package name be `@beatbax/plugin-exporter-vgm` (standalone) or `@beatbax/plugin-chip-sms-vgm` (chip-coupled)? Standalone is preferred given VGM's multi-chip nature.
4. Is it acceptable to require VGM version 1.61 unconditionally (for Game Gear stereo readiness), or should the exporter conditionally write 1.10 when no `gg:pan` fields are present?

---

## References

- VGM specification: https://vgmrips.net/wiki/VGM_Specification
- GD3 tag specification: https://vgmrips.net/wiki/GD3_Specification
- SN76489 register model: `docs/chips/sms/hardware_guide.md`
- Effects system: `docs/features/complete/effects-system.md`
- Exporter plugin interface: `docs/features/complete/exporter_plugin_system.md`
- SMS chip plugin (effects support table): `docs/features/sms-psg-chip-plugin.md`
- NES FamiTracker exporter (reference implementation pattern): `docs/features/complete/famitracker-export.md`
