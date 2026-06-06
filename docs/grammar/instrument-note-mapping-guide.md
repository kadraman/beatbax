# Instrument Note Mapping - User Guide

> 🔧 **Technical Specification:** For implementation details, see [features/instrument-note-mapping-spec.md](features/instrument-note-mapping-spec.md)

## Overview

When using instrument names as pattern tokens (e.g., `snare`, `hihat`, `kick`), you can now specify a default note value that will be used automatically. This is especially useful for percussion programming where different drum sounds should map to different pitches.

## Syntax

Add a `note=` parameter to your instrument definition:

```
inst <name> type=<type> [<params>...] note=<note>
```

## Example: Percussion Kit

```
chip gameboy
bpm  140

# Define percussion with specific default notes
inst kick       type=pulse1 duty=12.5 env=15,down,1 note=C2
inst snare      type=noise  gb:width=7  env=13,down,1 note=C6
inst hihat_cl   type=noise  gb:width=15 env=6,down,1  note=C6
inst hihat_op   type=noise  gb:width=15 env=8,down,3  note=D6
inst tom_low    type=noise  gb:width=7  env=14,down,5 note=C5
inst tom_high   type=noise  gb:width=7  env=12,down,3 note=E5

# Use instrument names directly - notes are automatic!
pat kick_pat  = kick . . . kick . . .
pat snare_pat = . . . . snare . . .
pat hh_pat    = hihat_cl hihat_cl hihat_op hihat_cl

channel 1 => inst kick pat kick_pat
channel 4 => inst snare pat snare_pat hh_pat
```

## Before vs. After

### Before (explicit notes required)

```
inst snare type=noise gb:width=7 env=12,down

# Had to write explicit notes for every hit
pat drums = inst(snare) C6 . inst(snare) C6 .  # Repetitive and noisy
```

### After (instrument name is enough)

```
inst snare type=noise gb:width=7 env=12,down note=C6

# Just use the instrument name!
pat drums = snare . snare .  # Clean and readable
```

## How It Works

1. **For Pulse/Wave instruments with `note=`:** The specified note is played when you use the instrument name as a token.

2. **For Noise instruments with `note=`:** The note value is stored for UGE export compatibility, but playback uses the noise parameters (width, divisor, shift) to generate the sound. Noise channels don't use traditional pitch.

3. **Without `note=` parameter:** Defaults to C5 (index 24) for backward compatibility in exports.

4. **Explicit note overrides:** You can still use explicit note syntax to override:
   ```
   inst kick note=C2
   pat p = inst(kick) C3  # Uses C3, not C2
   ```

## Important: Noise Channel Behavior

**The Game Boy noise channel does not use traditional musical pitch.** When you specify `note=C6` for a noise instrument:

- ✅ The note value is saved and used when exporting to UGE format
- ❌ The note value does NOT affect the sound during playback
- ✨ The actual noise sound is controlled by `gb:width`, `divisor`, and `shift` parameters

Example:
```
inst snare type=noise gb:width=7 env=13,down note=C6

# During playback: Renders white noise with width=7
# During UGE export: Saved as C-7 in hUGETracker file (one octave higher display)
pat drums = snare . . .
```

## UGE Export

When exporting to hUGETracker, the default notes are used. **Important:** hUGETracker displays notes ONE OCTAVE HIGHER than BeatBax's MIDI notation:

- `snare` (with `note=C6`) → exports as C-7 in hUGETracker
- `hihat_cl` (with `note=C6`) → exports as C-7 in hUGETracker
- `kick` (with `note=C2`) → exports as C-3 in hUGETracker

## Recommended Note Ranges

For Game Boy percussion (BeatBax notation → hUGETracker display):

- **Kicks** (pulse channels): `note=C2` (exports as C-3 in hUGETracker)
- **Snares** (7-bit noise): `note=C6` (exports as C-7 in hUGETracker)
- **Closed hi-hats** (15-bit noise): `note=C6` to `note=D6` (exports as C-7 to D-7)
- **Open hi-hats** (15-bit noise): `note=D6` to `note=E6` (exports as D-7 to E-7)
- **Toms** (7-bit noise): `note=C5` to `note=E5` (exports as C-6 to E-6)
- **Cymbals** (15-bit noise): `note=E6` to `note=F6` (exports as E-7 to F-7)

**Remember:** hUGETracker displays all notes one octave higher than BeatBax uses them.

## Limitations

**Sharp notes (`#`) in `note=` values:** Due to parser limitations, sharp symbols (`#`) in note values are currently treated as comments. Use flat equivalents or natural notes:
- ❌ `note=C#7` (treated as comment)
- ✅ `note=Db7` (works correctly)
- ✅ `note=D7` (works correctly)

## See Also

- [instruments.md](instruments.md) — Full instrument reference
- [uge-export-guide.md](uge-export-guide.md) — UGE export documentation
- [percussion_demo.bax](../songs/percussion_demo.bax) — Complete percussion examples
- [features/instrument-note-mapping-spec.md](features/instrument-note-mapping-spec.md) — Technical specification
