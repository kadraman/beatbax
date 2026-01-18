# Master Volume Feature Implementation

## Summary

Implemented a `volume` directive to control master output level for all channels, normalizing playback volume between CLI (Node.js) and browser contexts. This prevents clipping and ensures consistent loudness across different playback environments.

## Changes Made

### 1. Parser & AST Updates

- **Added `VolumeStmt`** to grammar (`packages/engine/src/parser/peggy/grammar.peggy`)
  - Added `Float` rule to support decimal values
  - Added `VolumeStmt` rule after `BpmStmt`
  - Updated `Statement` union to include `VolumeStmt`

- **Updated AST types** (`packages/engine/src/parser/ast.ts`)
  - Added `volume?: number` field to `AST` interface

- **Updated parser index** (`packages/engine/src/parser/peggy/index.ts`)
  - Added `VolumeStmt` interface
  - Added `topVolume` accumulator variable
  - Added case handler to clamp volume to 0-1 range
  - Updated AST construction to include `volume` field

### 2. Song Model Updates

- **Updated SongModel** (`packages/engine/src/song/songModel.ts`)
  - Added `volume?: number` field to `SongModel` interface

- **Updated resolver** (`packages/engine/src/song/resolver.ts`)
  - Pass `volume` from AST to SongModel in `resolveSong` return

### 3. WebAudio Playback (Browser & Node.js)

- **Updated Player class** (`packages/engine/src/audio/playback.ts`)
  - Added `masterGain: GainNode | null` property
  - Create master gain node on first `playAST()` call
  - Set master gain value to `ast.volume ?? 0.25` (default 0.25)
  - Updated wrapper functions to accept `destination?: AudioNode` parameter
  - Pass `this.masterGain` to all chip playback functions

- **Updated chip functions** to accept optional `destination` parameter:
  - `playPulse()` in `packages/engine/src/chips/gameboy/pulse.ts`
  - `playWavetable()` in `packages/engine/src/chips/gameboy/wave.ts`
  - `playNoise()` in `packages/engine/src/chips/gameboy/noise.ts`
  - All functions now connect to `destination || ctx.destination`

### 4. PCM Rendering (WAV Export & CLI)

- **Updated renderSongToPCM** (`packages/engine/src/audio/pcmRenderer.ts`)
  - Apply master volume multiplier to all samples after channel mixing
  - Default to `0.25` if `song.volume` is undefined
  - Apply volume **before** normalization step

### 5. Tests

- **Created test suite** (`packages/engine/tests/parser.volume.test.ts`)
  - Tests parsing `volume` directive
  - Tests default behavior (undefined when not specified)
  - Tests clamping to 0-1 range
  - Tests passing volume through resolver to SongModel
  - Tests float value handling
  - **All 5 tests passing**

### 6. Documentation

- **Created comprehensive guide** (`docs/volume-directive.md`)
  - Syntax and range (0.0 to 1.0)
  - Default behavior explanation (0.25 for 4-channel headroom)
  - Example usage
  - Implementation notes (WebAudio vs PCM)
  - Comparison with instrument-level volume controls

- **Updated metadata directives** (`docs/metadata-directives.md`)
  - Renamed to "Song Metadata and Global Directives"
  - Added "Global Playback Directives" section
  - Documented `chip`, `bpm`, `volume`, `time`, `ticksPerStep`
  - Cross-referenced volume-directive.md

- **Updated README.md**
  - Added `volume 0.25` example with comment explaining default

## Default Volume Rationale

**Default: `1.0` (100%, no attenuation)**

BeatBax uses `1.0` by default to match **hUGETracker's behavior**, which outputs channels at full envelope volumes without master attenuation.

**Why this works**:
- Game Boy hardware has natural analog limiting/compression
- Most songs use varied envelopes, rests, and dynamics (not all channels at max simultaneously)
- Emulators often have built-in limiting
- Browser/system audio can handle transient peaks

**Clipping considerations**:

With 4 channels at maximum envelope volume (15/15):

```
4 channels × 1.0 amplitude = 4.0 peak amplitude → may clip in digital systems
```

However, this worst-case rarely occurs in practice. Users experiencing clipping should adjust:

- **Most songs**: `volume 0.5` to `1.0` (default)
- **Dense mixes** (4 channels, high envelopes): `volume 0.3` to `0.5`
- **Extremely dense**: `volume 0.25`

Alternatively, use WAV export normalization for automatic level control.

## Test Results

- **All 142 existing tests still passing** (3 skipped as before)
- **5 new volume directive tests passing**
- **CLI playback tested successfully** with `volume 0.5`
- **Build verified** across all packages (engine + cli)

## Files Modified

### Core Implementation
- `packages/engine/src/parser/peggy/grammar.peggy`
- `packages/engine/src/parser/ast.ts`
- `packages/engine/src/parser/peggy/index.ts`
- `packages/engine/src/song/songModel.ts`
- `packages/engine/src/song/resolver.ts`
- `packages/engine/src/audio/playback.ts`
- `packages/engine/src/chips/gameboy/pulse.ts`
- `packages/engine/src/chips/gameboy/wave.ts`
- `packages/engine/src/chips/gameboy/noise.ts`
- `packages/engine/src/audio/pcmRenderer.ts`

### Tests
- `packages/engine/tests/parser.volume.test.ts` (new)

### Documentation
- `docs/volume-directive.md` (new)
- `docs/metadata-directives.md` (updated)
- `README.md` (updated)

### Examples
- `songs/effects/vibrato-volume-test.bax` (new test file)

## Backward Compatibility

✅ **Fully backward compatible**

- Existing `.bax` files without `volume` directive use default `0.25`
- AST, SongModel, and all APIs handle `volume: undefined` gracefully
- All existing tests pass without modification

## Next Steps (Optional)

1. Add `volume` to JSON export schema for documentation
2. Consider per-channel volume controls (future enhancement)
3. Add volume automation/envelope effects (future enhancement)
4. Document interaction with WAV export normalization options
