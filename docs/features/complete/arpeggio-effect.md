---
title: Arpeggio Effect Implementation
status: complete
authors: ["kadraman"]
completed: 2026-01-18
---

## Summary

Implemented the `arp` effect for BeatBax, enabling rapid pitch cycling to simulate chords. The effect cycles through semitone offsets at chip-specific frame rates (60 Hz for Game Boy, 50 Hz for C64 PAL) to create the illusion of multiple simultaneous notes.

## Implementation Details

### Syntax and Usage

```bax
# Direct inline syntax
pat chords = C4<arp:3,7>:4 F4<arp:4,7>:4

# Named presets
effect arpMinor = arp:3,7
effect arpMajor = arp:4,7
effect arpMajor7 = arp:4,7,11

pat melody = C4<arpMinor>:4 F4<arpMajor>:4
```

### Behavior

- **Cycle pattern**: Always includes root note (offset 0) first
  - `arp:3,7` → Root → +3 → +7 → Root → ... (C → Eb → G → C)
  - `arp:4,7` → Root → +4 → +7 → Root → ... (C → E → G → C)
- **Timing**: Cycles at chip's native frame rate
  - Game Boy: 60 Hz (~16.667ms per step)
  - NES: 60 Hz (NTSC default)
  - C64: 50 Hz (PAL default, European demoscene standard)
  - Genesis: 60 Hz (NTSC default)
  - PC Engine: 60 Hz
- **Duration**: Continues for full note length (not just one cycle)

### Technical Architecture

#### WebAudio Renderer ([effects/index.ts](packages/engine/src/effects/index.ts))
- Chip type stored in audio context: `ctx._chipType`
- Frame rate lookup table: `CHIP_FRAME_RATES`
- Base frequency stored in oscillator: `osc._baseFreq`
- Schedules frequency changes via `setValueAtTime` at frame intervals
- Reads base freq from `_baseFreq` to avoid timing issues with scheduled values

#### PCM Renderer ([audio/pcmRenderer.ts](packages/engine/src/audio/pcmRenderer.ts))
- Per-sample frequency calculation
- Cycles through offsets based on elapsed time and frame rate
- Uses same chip frame rate constants (60 Hz for Game Boy)
- Includes root note in offset array: `[0, ...arpOffsets]`

#### Oscillator Setup ([chips/gameboy/pulse.ts](packages/engine/src/chips/gameboy/pulse.ts))
- Sets initial frequency via `setValueAtTime(aligned, start)` instead of `.value`
- Stores base frequency in `osc._baseFreq` for effect handlers
- Prevents automation timeline conflicts

### UGE Export

- Maps to hUGETracker `0xy` arpeggio effect
- First 2 offsets become x and y nibbles: `arp:3,7` → `0x37`
- Applies to note row AND all sustain rows (full note duration)
- Warns if more than 2 offsets provided (UGE limitation)
- Implementation: `ArpeggioHandler` in [ugeWriter.ts](packages/engine/src/export/ugeWriter.ts)

### Parser Integration

- Effect presets: `effect arpMinor = arp:3,7`
- Inline effects: `C4<arp:3,7>:4`
- Preset expansion: `<arpMinor>` → `<arp:3,7>`
- Grammar handles bare identifiers as effect names (Peggy parser)

## Testing and Validation

**Demo Song**: [songs/effects/arpeggio.bax](songs/effects/arpeggio.bax)
- Minor and major chord presets
- 4-note arpeggios (7th chords)
- Multi-bar sequences

**Validated Scenarios**:
- ✅ WebAudio playback (browser)
- ✅ CLI/PCM rendering (headless)
- ✅ UGE export with sustain rows
- ✅ Correct pitch cycling at 60 Hz
- ✅ Base frequency accuracy
- ✅ Effect preset expansion

**Commands**:
```bash
# Play with browser audio
node bin/beatbax play songs/effects/arpeggio.bax --browser

# CLI headless playback
node bin/beatbax play songs/effects/arpeggio.bax

# Export to UGE
node bin/beatbax export uge songs/effects/arpeggio.bax output.uge

# Export to WAV
node bin/beatbax export wav songs/effects/arpeggio.bax output.wav
```

## Known Limitations

1. **UGE export**: Limited to 2 offsets (3 notes including root)
   - 3+ offset arpeggios emit warning, only first 2 exported
2. **Wave channel**: No arpeggio support in WebAudio
   - BufferSource doesn't have `frequency` parameter
   - Would require playbackRate modulation (future work)
3. **Frame rate**: Fixed per chip, not customizable per-note
   - Could add `arpRate` parameter in future for custom speeds

## Related Files

**Core Implementation**:
- `packages/engine/src/effects/index.ts` - WebAudio arpeggio handler
- `packages/engine/src/audio/pcmRenderer.ts` - PCM renderer arpeggio
- `packages/engine/src/chips/gameboy/pulse.ts` - Base frequency storage
- `packages/engine/src/audio/playback.ts` - Chip type context storage

**Export**:
- `packages/engine/src/export/ugeWriter.ts` - UGE arpeggio mapping

**Parser**:
- `packages/engine/src/parser/peggy/grammar.peggy` - Effect syntax
- `packages/engine/src/song/resolver.ts` - Preset expansion

**Documentation**:
- `docs/features/effects-system.md` - Full effects spec
- `docs/uge-export-guide.md` - UGE mapping details
- `TUTORIAL.md` - Usage examples

**Tests**:
- `songs/effects/arpeggio.bax` - Demo song

## Future Enhancements

- Custom arpeggio rates: `<arp:3,7,rate:120>` for Hz override
- Wave channel support via playbackRate modulation
- MIDI export as note sequence
- Arpeggio patterns: `<arp:pattern:1-3-5-8>` for complex cycles
- Regional chip variants: `chip nes-pal` for 50 Hz NES
