# Instrument Note Mapping - User Guide

> 🔧 **Technical Specification:** For implementation details, see [features/instrument-note-mapping-spec.md](features/instrument-note-mapping-spec.md)

## Overview

When using instrument names as pattern tokens (e.g., `snare`, `hihat`, `kick`), you can now specify a default note value that will be used automatically. This is especially useful for percussion programming where different drum sounds should map to different pitches.

## Syntax

Add `note=` for normal BeatBax default notes, or `uge_note=` for Game Boy noise instruments when you want exact hUGETracker display notation in UGE exports:

```
inst <name> type=<type> [<params>...] note=<note>
inst <name> type=noise [<params>...] uge_note=<tracker-note>
```

## Example: Percussion Kit

```
chip gameboy
bpm  140

# Define percussion with specific default notes
inst kick       type=pulse1 duty=12.5 env=15,down,1 note=C2
inst snare      type=noise  gb:width=7  env=13,down,1 uge_note=C-7
inst hihat_cl   type=noise  gb:width=15 env=6,down,1  uge_note=C-7
inst hihat_op   type=noise  gb:width=15 env=8,down,3  uge_note=D-7
inst tom_low    type=noise  gb:width=7  env=14,down,5 uge_note=C-6
inst tom_high   type=noise  gb:width=7  env=12,down,3 uge_note=E-6

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
inst snare type=noise gb:width=7 env=12,down uge_note=C-7

# Just use the instrument name!
pat drums = snare . snare .  # Clean and readable
```

## How It Works

1. **For Pulse/Wave instruments with `note=`:** The specified note is played when you use the instrument name as a token.

2. **For Noise instruments with legacy `note=`:** Used for UGE export conversion when `uge_note=` is absent. Does **not** set the playback LFSR clock.

3. **For Noise instruments with `uge_note=`:** Sets the hUGETracker display note on UGE export **and** the NR43 LFSR clock during BeatBax playback (WebAudio and CLI/WAV). This is the **recommended** approach for Game Boy noise percussion.

4. **Without `note=` or `uge_note=` on noise:** UGE export defaults to C5 (index 24); playback uses default NR43 clock values.

5. **Explicit note overrides:** You can still use explicit note syntax to override:
   ```
   inst kick note=C2
   pat p = inst(kick) C3  # Uses C3, not C2
   ```

## Important: Noise Channel Behavior

**The Game Boy noise channel does not use traditional musical pitch**, but the **`uge_note=` label selects the LFSR clock rate** (same mapping hUGEDriver uses via `get_note_poly`).

When you specify `uge_note=C-7` for a noise instrument:

- **Playback (WebAudio + CLI/WAV):** NR43 shift/divisor are derived from `uge_note`; timbre/decay come from `gb:width`, `env`, and `length`.
- **UGE export:** Named hits write that note to the noise pattern row (e.g. `C-7`).

Legacy `note=C6` without `uge_note=` still converts for UGE export (`C-7` in hUGETracker) but **does not** set the playback clock.

Example:
```
inst snare type=noise gb:width=7 env=13,down uge_note=C-7

# Playback: 7-bit LFSR at the C-7 clock rate, envelope from env=
# UGE export: pattern row shows C-7
pat drums = snare . . .
```

## UGE Export

When exporting to hUGETracker, `uge_note=` takes priority for named instrument hits and uses hUGETracker display notation directly:

- `snare` (with `uge_note=C-7`) → exports as C-7 in hUGETracker
- `hihat_cl` (with `uge_note=C-8`) → exports as C-8 in hUGETracker
- `tom_low` (with `uge_note=C-6`) → exports as C-6 in hUGETracker

If `uge_note=` is not present, legacy `note=` values are still supported. **Important:** hUGETracker displays those legacy BeatBax notes one octave higher than BeatBax's MIDI notation:

- `snare` (with `note=C6`) → exports as C-7 in hUGETracker
- `hihat_cl` (with `note=C6`) → exports as C-7 in hUGETracker
- `kick` (with `note=C2`) → exports as C-3 in hUGETracker

## Recommended Note Ranges

For Game Boy percussion using `uge_note=`:

- **Kicks** (noise channel): `uge_note=C-6`
- **Snares** (7-bit noise): `uge_note=C-7`
- **Closed hi-hats** (15-bit noise): `uge_note=C-7` to `uge_note=D-7`
- **Open hi-hats** (15-bit noise): `uge_note=D-7` to `uge_note=E-7`
- **Toms** (7-bit mode): `uge_note=C-6` to `uge_note=E-6`
- **Cymbals** (15-bit noise): `uge_note=E-7` to `uge_note=F-7`

For pulse and wave instruments, continue using normal BeatBax notes and `uge_transpose` when needed.

## UGE tempo alignment

BeatBax uses your written `bpm` for playback; UGE export rounds to integer ticks per row (`round(896 / bpm)`). For **exact timing** between BeatBax and hUGETracker, use BPM values where **896 ÷ bpm is an integer** — commonly **128**, **112**, **224**, **64**, or **56**. See [uge-export-guide.md](../exports/uge-export-guide.md#tempo-and-bpm-alignment).

## Limitations

**Sharp notes (`#`) in `note=` and `uge_note=` values:** `#` starts a comment in `.bax` files. Unquoted sharps are truncated or ignored:

- ❌ `note=C#7` or `uge_note=C#7` (parsed as `C` only)
- ✅ `uge_note="C#7"` (quoted sharp for hUGETracker display notation)
- ✅ `note=Db7` (flat equivalent for legacy `note=` on pulse/wave)

## See Also

- [instruments.md](instruments.md) — Full instrument reference
- [uge-export-guide.md](../exports/uge-export-guide.md) — UGE export and BPM alignment
- [songs/gameboy/instruments/gb_percussion_demo.bax](../../songs/gameboy/instruments/gb_percussion_demo.bax) — Pulse + noise kit with `uge_note=`
- [songs/gameboy/instruments/gb_uge_note_demo.bax](../../songs/gameboy/instruments/gb_uge_note_demo.bax) — Noise parity reference
