# UGE Transpose Feature

## Overview

The `uge_transpose` parameter allows you to author BeatBax songs with low bass frequencies for web playback while automatically transposing them up for UGE export to meet hUGETracker's C3 minimum note requirement.

## The Problem

**hUGETracker Limitation**: The minimum note in hUGETracker is C3 (MIDI 48). Any notes below this are rejected or transposed up automatically.

**Bass Sound Quality**: Good bass lines typically use C2 (65.41 Hz) or lower. Using C3 (130.81 Hz) sounds too high and lacks the "punch" needed for bass.

**Conflict**: You want to author with C2 for good-sounding web playback, but need C3+ for valid UGE exports.

## The Solution

Add `uge_transpose=+12` to your instrument definition:

```bax
# Bass instrument with UGE transpose
inst bass_low type=pulse2 duty=25 env=gb:15,down,1 uge_transpose=+12 gm=34
```

- **Web/Browser Playback**: Uses the original C2 frequency (proper bass sound)
- **UGE Export**: Automatically transposes up 12 semitones (C2 → C3)
- **Result**: Best of both worlds!

## Usage Examples

### Basic Bass Pattern

```bax
chip gameboy
bpm 120

# Define bass with uge_transpose
inst bass type=pulse2 duty=25 env=gb:15,down,1 uge_transpose=+12 gm=34

# Author with C2 (sounds good in web)
pat bassline = C2 . G2 . C2 . G2 . A2 . G2 .

# Assign to channel
channel 2 => inst bass seq main

play
```

### Kick Drums

```bax
# Kick drum with uge_transpose
inst kick type=pulse1 duty=12.5 env=gb:15,down,1 length=16 uge_transpose=+12 gm=35

# Author with C2 for deep kick sound
pat kick_pattern = C2 . . . C2 . . . C2 . . . C2 . . .

channel 1 => inst kick seq kicks
```

### Multiple Octave Ranges

```bax
# Different transpose amounts for different octaves
inst bass_very_low  type=pulse2 duty=25 env=gb:15,down,1 uge_transpose=+24 gm=34  # C1 → C3 (2 octaves)
inst bass_low       type=pulse2 duty=25 env=gb:15,down,1 uge_transpose=+12 gm=34  # C2 → C3 (1 octave)
inst bass_normal    type=pulse2 duty=25 env=gb:15,down,1 gm=34                    # C3+ (no transpose)
```

## Parameter Details

- **Parameter Name**: `uge_transpose`
- **Valid Values**: Any integer (positive or negative)
  - `+12` = transpose up 1 octave
  - `+24` = transpose up 2 octaves
  - `-12` = transpose down 1 octave (use cautiously)
- **Scope**: Applied only during UGE export, not during web playback
- **Per-Instrument**: Each instrument can have its own transpose setting

## How It Works

1. **Parse Phase**: The parser reads the `uge_transpose` value from the instrument definition
2. **Web Playback**: The audio engine uses the original note frequencies (C2 = 65.41 Hz)
3. **UGE Export**: The exporter adds the transpose value to MIDI note numbers before writing to UGE
   - C2 (MIDI 36) + 12 = C3 (MIDI 48) ✅
4. **Result**: Web sounds deep, UGE file is valid

## Common Transpose Values

| Original Octave | UGE Transpose | Exported Octave | Use Case |
|-----------------|---------------|-----------------|----------|
| C1 (MIDI 24)    | `+24`         | C3 (MIDI 48)    | Sub-bass |
| C2 (MIDI 36)    | `+12`         | C3 (MIDI 48)    | Standard bass |
| C3 (MIDI 48)    | `0` (omit)    | C3 (MIDI 48)    | No transpose needed |

## Validation

The UGE exporter will still warn you if notes are below C3 before transposing:

```
[UGE Export] Note C2 is below hUGETracker minimum (C3). Transposed up 1 octave(s).
```

This is informational - the transpose is applied automatically, and the export succeeds.

## Compatibility

- **Web-UI/Browser**: Full support (uses original frequencies)
- **CLI Playback**: Full support (uses original frequencies)
- **UGE Export**: Full support (transposes automatically)
- **MIDI Export**: Uses original frequencies (no transpose applied)
- **JSON Export**: Uses original frequencies (no transpose applied)

## Best Practices

1. **Use `+12` for bass instruments**: Most common case (C2 → C3)
2. **Use `+24` for sub-bass**: If you want very low frequencies (C1 → C3)
3. **Don't use negative values**: Transposing down may cause issues if notes go below C3
4. **Test both playbacks**: Listen in web and verify UGE export sounds correct (one octave higher)
5. **Document your intent**: Add comments explaining why you're using transpose

## Example Files

See these demonstration files:
- [songs/bass_transpose_test.bax](../songs/bass_transpose_test.bax) - Simple comparison example
- [songs/instrument_demo.bax](../songs/instrument_demo.bax) - Bass instruments with transpose
- [songs/percussion_demo.bax](../songs/percussion_demo.bax) - Kick drums with transpose

## Limitations

**Physical Reality**: The Game Boy hardware cannot actually produce frequencies below C3 well. The `uge_transpose` feature is a compromise:
- Your web playback will sound like C2 (good for composition)
- The actual Game Boy/hUGETracker will play C3 (one octave higher)
- This is a limitation of the hardware, not the software

If you need the exact same frequency in both web and UGE, use C3+ and omit `uge_transpose`.
