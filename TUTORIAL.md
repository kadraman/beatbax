# BeatBax — Quick Tutorial

This tutorial shows how to write `.bax` songs, use the CLI for playback and export, and work with the browser demo. BeatBax is a complete live-coding language for Game Boy-style chiptunes with deterministic playback and multiple export formats.

**Files used in the demo**
- `songs/sample.bax` — example song shipped with the repo.
- `apps/web-ui/` — browser demo UI that loads and plays `.bax` files.
- `songs/metadata_example.bax` — example showing `song` metadata directives (name, artist, description, tags).
- See `docs/metadata-directives.md` for details on metadata syntax and export mapping.

**Language Quick Reference**

- inst definitions: define instruments and their params.
  - Example: `inst leadA type=pulse1 duty=60 env=gb:12,down,1 gm=81`
  - Fields: `type` (pulse1|pulse2|wave|noise), `duty` (pulse duty %), `env` (envelope), `wave` (16-entry wavetable), `sweep` (frequency sweep)
  - `sweep` (Pulse 1 only): `time,direction,shift`
    - `time`: 0-7 (0=off, 7=slowest)
    - `direction`: `up` (pitch up) or `down` (pitch down)
    - `shift`: 0-7 (amount of change per step)
    - Example: `inst riser type=pulse1 sweep=5,up,2`
    - Note: Pitch `up` increases the frequency register, while `down` decreases it, following Game Boy hardware behavior.
  - `gm` (optional): General MIDI program number (0-127). When present the MIDI
    exporter emits a Program Change for the corresponding track using this value.

- effect presets: define reusable named effect RHS strings that can be applied
  inline or as a sequence/pattern modifier. Syntax: `effect name = vib:4,8,sine,4` or `effect arpMinor = arp:3,7`.
  Example: `pat melody = C4<wobble>`, `C4<arpMinor>:4`, or `seq lead => pat melody:wobble`.
  - Arpeggio effect (`arp`): Cycles through semitone offsets at chip frame rate (60Hz for Game Boy) to simulate chords.
    - Syntax: `<arp:3,7>` for minor chord (root → +3 → +7 → root...)
    - Always includes root note (offset 0) in the cycle
    - Example presets: `effect arpMinor = arp:3,7`, `effect arpMajor = arp:4,7`, `effect arpMajor7 = arp:4,7,11`
    - UGE export: supports up to 2 offsets (3 notes including root)

- pat definitions: pattern tokens (notes, rests, named tokens, inline inst changes).
  - Notes: `C4`, `G#5`, `A3` — scientific pitch notation.
  - Rests: `.` (cuts the previous note).
  - Sustains: `_` or `-` (extends the previous note).
  - Duration shorthand: `C4:4` (equivalent to `C4 _ _ _`).
  - Grouping and repeat: `(C5 E5 G5)*2`
  - Named tokens: `snare` or `hihat` (mapped to `inst` entries by scheduler)
  - Inline temporary instrument override: `inst(name,N)` — next N non-rest tokens use `name`
    - **Important:** The count `N` applies to the next N *non-rest* tokens (notes/sustains only)
    - Rests (`.`) do NOT consume from the count; use this to apply the same instrument to multiple notes separated by rests
    - Example: `inst(lead_in,2) C4 . C4` — both C4 notes use `lead_in`, the rest doesn't count
  - Inline permanent instrument: `inst(name)` — change default instrument for the pattern

- seq / channel: map patterns and instruments to Game Boy channels
  - **Full syntax with explicit seq**: `seq myseq = pat1 pat2` then `channel 1 => inst leadA seq myseq`
  - **Shorthand with seq keyword**: `channel 1 => inst leadA seq pat1 pat2` (inline pattern list)
  - **Shorthand with pat keyword**: `channel 1 => inst leadA pat pat1 pat2` (same as seq, more explicit)
  - **Single pattern shorthand**: `channel 1 => inst leadA pat melody` (omit list, just one pattern)
  - Channels: 1 (Pulse1), 2 (Pulse2), 3 (Wave), 4 (Noise)

Note: For multi-channel arrangements prefer using the `arrange` construct. `arrange` blocks are expanded early so per-arrange defaults and per-slot modifiers (for example `:inst(name)` or `:oct(-1)`) are applied during expansion and flow into the per-channel ISM. `channel` mappings continue to work for backward compatibility but are considered a legacy/fallback for compact examples and single-channel usage.

Extended `seq` syntax examples
- Multiple sequences on one channel (comma-separated): `seq a,b` — plays `a` then `b`.
- Repetition: `seq a * 2` or shorthand `a*2` repeats `a` twice.
- Space-separated list: `seq a b` is a shorthand for multiple items.
- Parenthesized group repetition: `(a b)*2` repeats the group twice.

Examples:
```
# comma-separated and space-separated
channel 1 => inst leadA seq lead,lead2
channel 2 => inst bass  seq lead lead2

# repetition and group repetition
seq bass_repeat = bass_pat*2
seq arranged = (lead_pat lead_alt)*2 bass_repeat
channel 3 => inst wave1 seq arranged
```

Notes:
- Inline modifiers may be applied per-item, e.g. `lead:inst(leadB):slow(2)`.
- The parser and CLI validate sequence definitions; empty `seq NAME =` lines are reported as errors by `verify`, and `play`/`export` will abort on such errors.

**Transforms (applied at parse/expansion time)**
- `:oct(n)` — transpose by octaves
- `:+N` or `:-N` — semitone transpose
- `:rev` — reverse pattern
- `:slow(N)` — repeat each token N times (default 2)
- `:fast(N)` — take every Nth token (default 2)

**Noise Channel Note Mapping (for UGE Export)**

When exporting to hUGETracker (`.uge` format), the Game Boy noise channel uses a **1:1 note mapping** with no automatic transpose:

- C2 → index 0 (C-3 in hUGETracker = lowest noise)
- C5 → index 24 (C-5 in hUGETracker = mid-range)
- C6 → index 36 (C-6 in hUGETracker)
- C7 → index 48 (C-7 in hUGETracker = bright percussion)
- C9 → index 72 (C-9 in hUGETracker = maximum)

**Writing percussion patterns:**
```bax
# Write notes in the exact octave range you want in hUGETracker
inst kick  type=noise env=gb:12,down,1 width=15  # Use C2-C3 (deep)
inst snare type=noise env=gb:10,down,2 width=7   # Use C5-C6 (mid)
inst hat   type=noise env=gb:8,down,1 width=7    # Use C7-C8 (bright)

# These notes export directly: C2→0, C5→24, C7→48
pat drums = C2 . C5 . C7 C7 C2 C5
```

**Custom transpose override:**
```bax
# Shift all notes up 1 octave (12 semitones) for this instrument
inst shifted_kick type=noise env=gb:12,down,1 uge_transpose=12
```

See `songs/percussion_demo.bax` for a complete working example.

### Panning (stereo)
Panning controls stereo position and can be specified in multiple forms:
- `gb:pan=<L|R|C>` — Game Boy NR51 terminal mapping (exact hardware L/R/C flags)
- `pan=<num>` or `<pan:num>` — numeric pan in range `[-1.0, 1.0]` (`-1.0` left, `0` center, `1.0` right)
- Inline note tokens: `C5<pan:-1.0>` or `C6<pan:L>` apply to a single note
- Effect parameter rules: parameters are comma-separated, trimmed, numeric tokens are converted to numbers (e.g., `1` → `1`), and empty params (consecutive commas or empty entries) are ignored and removed.
- Sequence-level transforms: `seqname:pan(1.0)` applies numeric pan to an entire sequence occurrence

Notes:
- Browser (WebAudio) playback uses a StereoPannerNode when available for smooth numeric panning.
- Exporting to hUGETracker (`export uge`) maps `gb:pan` to NR51 bits exactly; numeric `pan` values are snapped (pan < -0.33 → L, pan > 0.33 → R, otherwise C) unless you use the `--strict-gb` flag which rejects numeric pans.

Example:
```
pat stereo = C5<pan=-1.0> E5<pan=0.0> G5<pan=1.0> C6<gb:pan:L>
seq bass_seq = bassline bassline:pan(gb:R) bassline bassline:pan(1.0)
```

### Portamento (pitch slide)
Portamento creates a smooth pitch glide between notes, commonly used in bass lines and melodic phrases.

**Syntax**
- `<port:speed>` — slide to the current note's pitch from the previous note's pitch (legato, no retrigger)
- `speed`: portamento speed (0-255, higher = faster slide)

**Behavior**
- Portamento slides from the last played frequency to the target note's frequency
- **Legato mode**: Notes with portamento do NOT retrigger the envelope, creating one continuous sound
- State is tracked per-channel, so portamento works correctly across rests and sustains
- First note in a pattern never receives portamento (no previous pitch to slide from)
- The duration (`:N`) specifies how long the pitch is held, while `<port:speed>` controls slide speed

**Examples**
```bax
# Basic portamento bass line (each portamento note continues the previous envelope)
inst bass type=pulse2 duty=25 env=10,down
pat port_bass = C3 . E3<port:8> . G3<port:8> . C4<port:8> .

# Continuous legato slide (ONE note sliding through pitches)
pat legato_slide = C4:4 C5<port:12>:4 C6<port:12>:4 C5<port:12>:4

# Varying portamento speeds
pat melody = C4 E4<port:4> G4<port:8> C5<port:16>

# Portamento with octave transpose
pat bass_line = C3 . E3<port:8> . G3<port:8> .
seq bass_seq = bass_line:oct(-1)  # Transposes correctly with effects

# Fast portamento for glide effects
pat glide = C4 C5<port:32> C4<port:32> C5<port:32>
```

**Export behavior**
- **UGE (hUGETracker)**: Exports as `3xx` (tone portamento) effect with speed mapped directly to `xx` parameter
- **MIDI**: Exports as text metadata in track events
- **JSON**: Includes `port` effect with `speed` parameter in the ISM
- **WAV**: Rendered with cubic smoothstep easing for natural-sounding pitch curves

**Common patterns**
```bax
# Smooth bass slides
pat bass1 = C2 . E2<port:6> . G2<port:6> . C3<port:6> .
pat bass2 = C2 . C3<port:12> C2<port:12> .

# Melodic portamento (slower for expressiveness)
pat lead = C5 . E5<port:4> . G5<port:4> . E5<port:4> .

# Fast glissando effect
pat gliss = C4 G4<port:32> C5<port:32> G5<port:32>
```

See `songs/effects/port_effect_demo.bax` for a complete working example.

## Vibrato (`vib`) Effect

Vibrato adds periodic pitch modulation to notes for expressive, musical variation:

```bax
# Basic vibrato: depth and rate
pat melody = C5<vib:6,5> E5<vib:4,8> G5<vib:3,10>

# With waveform name (smooth sine-like vibrato)
pat smooth_vib = C5<vib:6,5,sine> D5<vib:4,6,triangle>

# With waveform name and duration (2 rows)
pat short_vib = C5<vib:6,5,square,2>:8 D5<vib:3,6,sine,2>:8

# Named preset for reusable vibrato
effect wobble = vib:4,8,sine,4
pat preset_demo = C5<wobble> E5<wobble>
```

**Parameters:**
1. `depth` (required): Vibrato amplitude, 0-15 (higher = wider pitch variation)
2. `rate` (required): Vibrato speed in Hz-like units (higher = faster modulation)
3. `waveform` (optional): LFO shape - name or number 0-15. Default: `none` (0)
   - Common waveforms: `sine` (smooth), `square` (stepped), `triangle` (smooth), `saw` (rising/falling)
   - See `/docs/features/effects-system.md` for complete list of 16 official hUGETracker waveforms
4. `durationRows` (optional): Length in pattern rows. Default: full note duration

**Export behavior:**
- **UGE (hUGETracker)**: Exports as `4xy` (vibrato) where `x`=waveform (0-15), `y`=depth (0-15)
  - Vibrato appears on BOTH the note row AND the first sustain row for immediate modulation
  - Note: hUGETracker has no true sine wave; `sine` maps to `triangle` (waveform 2) for smooth vibrato
- **MIDI**: Vibrato encoded as pitch bend messages with modulation
- **JSON**: Includes `vib` effect with all parameters in the ISM

**Waveform aliases:** The parser recognizes common aliases:
- `sine`, `sin` → 2 (triangle - smoothest available)
- `square`, `sqr`, `pulse` → 1
- `triangle`, `tri` → 2
- `saw`, `sawtooth` → 3
- `ramp` → 4 (sawtooth down)
- `noise`, `random` → 5

See `songs/effects/vibrato.bax` for a complete working example.

## Volume Slide (`volSlide`) Effect

Volume slide creates smooth or stepped volume changes over the duration of a note, enabling fade-ins, fade-outs, and dynamic volume automation:

```bax
# Basic volume slide: positive for fade-in, negative for fade-out
pat fade_in  = C4<volSlide:+6>:8 E4<volSlide:+6>:8 G4<volSlide:+6>:8
pat fade_out = C5<volSlide:-3>:8 G4<volSlide:-3>:8 E4<volSlide:-3>:8

# Stepped volume slide (delta, step count)
# Second parameter creates audible steps instead of smooth ramp
pat stepped = C4<volSlide:+8,4>:16 E4<volSlide:-8,4>:16

# Named presets for reusable volume slides
effect fadeIn  = volSlide:+5
effect fadeOut = volSlide:-5
pat preset_demo = C4<fadeIn>:4 E4<fadeOut>:4

# Combining with other effects
pat combo = C4<vib:3,6,volSlide:+3>:4 E4<port:12,volSlide:-2>:4
```

**Parameters:**
1. `delta` (required): Volume change rate (signed integer)
   - Positive values = fade in / crescendo
   - Negative values = fade out / decrescendo
   - Typical range: ±1 to ±15 (units are relative gain changes)
2. `steps` (optional): Number of discrete steps for the slide
   - If omitted: smooth linear ramp over note duration
   - If provided: stepped volume changes create audible "terracing"

**Important considerations:**

1. **Low-volume instruments:** When using instruments with very low initial volume (e.g., `env=0` or `env=1`):
   - Start from `env=1` instead of `env=0` to avoid complete silence
   - Use larger delta values (+10 to +15) to become audible quickly
   - Use longer note durations (:12 or :16) to allow the slide to complete
   - Apply `inst(name,N)` to cover ALL notes that need the same starting volume

   ```bax
   # Good: starts near-silent but audible, fades in over 12 ticks
   inst lead_in type=pulse1 env=1,flat
   pat fade = inst(lead_in,2) C4<volSlide:+14>:12 . C4<volSlide:+14,4>:12
   ```

2. **Note re-triggering:** On monophonic channels (all Game Boy channels), identical consecutive pitches blend into one continuous note:
   - Insert a rest (`.`) between same-pitch notes to force re-trigger
   - Different pitches automatically re-trigger

   ```bax
   # Without rest: blends into one 16-tick note
   pat blend = C4<volSlide:+4>:8 C4<volSlide:+4>:8  # Sounds like one note

   # With rest: two distinct notes with separate volume slides
   pat separate = C4<volSlide:+4>:8 . C4<volSlide:+4>:8  # Two distinct fades
   ```

3. **Instrument override count:** The `inst(name,N)` count applies only to non-rest tokens:
   - Rests (`.`) do NOT consume from the count
   - Example: `inst(lead_in,2) C4 . C4` applies `lead_in` to both C4 notes

**Export behavior:**
- **UGE (hUGETracker)**: Exports as volume slide effect (tracker-specific opcode)
- **MIDI**: Exports as CC #7 (volume) automation
- **JSON**: Includes `volSlide` effect with delta and steps parameters in the ISM
- **WAV**: Rendered with linear or stepped gain automation

See `songs/effects/volume_slide.bax` for a complete working example.

## Tremolo (`trem`) Effect

Tremolo creates periodic amplitude (volume) modulation, adding rhythmic pulsation or shimmer to notes:

```bax
# Basic tremolo: depth and rate
pat shimmer = C4<trem:6,4>:8 E4<trem:8,6>:8 G4<trem:10,8>:8

# With waveform name (different modulation shapes)
pat varied = C4<trem:8,6,sine>:4 E4<trem:8,6,square>:4 G4<trem:8,6,triangle>:4

# With waveform and duration (2 rows)
pat short_trem = C5<trem:10,8,square,2>:8 E5<trem:6,4,sine,2>:8

# Named presets for reusable tremolo
effect shimmer = trem:6,4,sine
effect pulse = trem:10,8,square
pat preset_demo = C4<shimmer>:4 E4<pulse>:4

# Combining with other effects
pat combo = C4<vib:3,6,trem:6,4>:4 E4<port:12,trem:8,6>:4 G4<trem:8,6,volSlide:+3>:4
```

**Parameters:**
1. `depth` (required): Tremolo amplitude, 0-15 (higher = more pronounced volume variation)
   - Maps to 0-50% volume modulation internally
2. `rate` (required): Tremolo speed in Hz (higher = faster pulsation)
3. `waveform` (optional): LFO shape - `sine`, `triangle`, `square`, or `saw`. Default: `sine`
4. `durationRows` (optional): Length in pattern rows. Default: full note duration

**Export behavior:**
- **WebAudio/WAV**: Full tremolo rendering with accurate LFO modulation via GainNode
- **UGE (hUGETracker)**: Exported as meta-event only (no native tremolo effect in hUGETracker)
  - Can be approximated manually in tracker with volume column automation
- **MIDI**: Documented via text meta event (MIDI has no native tremolo)
- **JSON**: Includes `trem` effect with all parameters in the ISM

**Waveforms:**
- `sine` - Smooth, natural tremolo (default)
- `triangle` - Linear rise/fall volume modulation
- `square` - Hard on/off pulsation (gate effect)
- `saw` - Asymmetric ramping volume changes

See `songs/effects/tremolo.bax` for a complete working example.

## Note Cut (`cut`) Effect

Note cut (also called "note gate") terminates a note after a specified number of ticks, creating staccato and percussive articulation:

```bax
# Basic note cut: stop note after N ticks
pat staccato = C4<cut:4>:8 E4<cut:6>:8 G4<cut:3>:8 C5<cut:8>:8

# Named presets for common articulations
effect short = cut:2
effect medium = cut:4
effect long = cut:8

pat articulated = C4<short>:4 E4<medium>:4 G4<long>:4

# Combining with other effects
pat combo = C4<vib:4,6,cut:8>:8 E4<cut:4,volSlide:+2>:8 G4<arp:4,7,cut:6>:8
```

**Parameters:**
1. `ticks` (required): Number of ticks after note onset before cutting (0-255)
   - Lower values = shorter, more percussive notes
   - Higher values = longer sustain before cut

**Behavior:**
- Cuts note by setting gain to 0 after the specified tick delay
- Works with all channel types (pulse1, pulse2, wave, noise)
- Useful for creating rhythmic patterns and percussive effects
- Especially effective with `flat` or `sustain` envelopes

**Export behavior:**
- **WebAudio/WAV**: Full note cut rendering via scheduled GainNode automation
- **UGE (hUGETracker)**: Exports as `E0x` Note Cut effect (x = ticks)
- **MIDI**: Documented via text meta event
- **JSON**: Includes `cut` effect with `ticks` parameter in the ISM

**Common patterns:**
```bax
# Percussive staccato melody
inst stab type=pulse1 duty=50 env=gb:12,flat,1
pat stabby = C5<cut:2> . E5<cut:2> . G5<cut:2> . C6<cut:2> .

# Rhythmic gating pattern
inst gate type=pulse2 duty=25 env=gb:10,flat,1
pat gated = C4<cut:4>:8 C4<cut:3>:8 C4<cut:6>:8 C4<cut:2>:8

# Drum-like melodic hits
inst kick type=pulse1 duty=12 env=gb:15,down,1
pat kicks = C2<cut:4> . C2<cut:3> . C2<cut:6> C2<cut:4>
```

See `songs/effects/notecut.bax` for a complete working example.

## Retrigger (`retrig`) Effect

**Status: WebAudio-only, not supported in UGE export**

Retrigger creates rhythmic stuttering by repeatedly restarting a note at regular intervals with optional volume fadeout:

```bax
# Basic retrigger: interval in ticks
pat stutter = C4<retrig:4>:16 E4<retrig:8>:16 G4<retrig:2>:16

# With volume fadeout (experimental, works best with down envelopes)
pat fade_stutter = C4<retrig:4,-2>:16 E4<retrig:6,-1>:16

# Named presets for common retrigger patterns
effect fast_stutter = retrig:2
effect drum_roll = retrig:4
effect slow_pulse = retrig:8

pat demo = C4<fast_stutter>:16 E4<drum_roll>:16 G4<slow_pulse>:16

# Combining with other effects
pat combo = C4<retrig:4,pan:-1.0>:16 E4<retrig:6,vib:4,6>:16
```

**Parameters:**
1. `interval` (required): Number of ticks between each retrigger (1-255)
   - Lower values = faster stuttering (2-4 for glitchy effects)
   - Higher values = slower pulsing (6-12 for drum rolls)
2. `volumeDelta` (optional): Volume change per retrigger (e.g., -2 for fadeout)
   - Experimental feature, may not be audible with `flat` envelopes
   - Use `down` or other decaying envelopes for best results

**Behavior:**
- Schedules multiple note restarts at regular intervals
- Each retrigger creates a full envelope restart
- Retriggering stops when reaching note duration
- Compatible with other effects (pan, vib, etc.)
- Prevents infinite recursion by filtering out retrig effect from retriggered notes

**Export behavior:**
- **WebAudio playback**: Fully supported with all features
- **PCM renderer (CLI)**: Not yet supported, use `--browser` flag for CLI playback
- **UGE (hUGETracker)**: **NOT SUPPORTED** - hUGETracker has no native retrigger effect
  - When exporting songs with retrigger to UGE, a warning will be displayed
  - Retrigger effects will be omitted from the output
  - Warning: `[WARN] [export] Retrigger effects detected in song but cannot be exported to UGE`
- **MIDI**: Exports as text metadata
- **JSON**: Includes `retrig` effect with all parameters in the ISM

**Limitations:**
- Volume fadeout may not be audible with `flat` envelopes
- PCM renderer does not support retrigger (use browser playback)
- Cannot be exported to UGE format (no hUGETracker equivalent)

**Workaround for UGE export:**
Expand retrigger into multiple note events manually:
```bax
# Instead of retrigger effect:
pat auto_retrig = C4<retrig:4>:16

# Use explicit notes for UGE compatibility:
pat manual_retrig = C4:4 C4:4 C4:4 C4:4
```

**Common patterns:**
```bax
# Fast glitchy stutter (2-tick intervals)
pat glitch = C5<retrig:2>:16 E5<retrig:2>:12 G5<retrig:2>:8

# Drum roll effect (4-tick intervals)
pat roll = C4<retrig:4>:32 C4<retrig:4>:32

# Slow pulsing bass (8-tick intervals)
pat pulse_bass = C2<retrig:8>:32 E2<retrig:8>:32 G2<retrig:8>:32

# With volume fadeout for echo-like decay
pat echo_stutter = C5<retrig:6,-1>:32
```

See `songs/effects/retrigger.bax` for a complete working example.

**Important:** Remember that retrigger effects will trigger a warning when exporting to UGE format and will not be included in the exported file.

**Tempo & Per-Channel Speed**

- Set a master tempo with a top-level directive: `bpm 128` or `bpm=128`.
- Per-channel multipliers: use `speed=2` or `speed=2x` on a channel to play
  that channel at a multiple of the master BPM. Example: `speed=2x` plays
  twice as fast as the master tempo.

Example:
```
# Use master tempo 128 BPM
bpm 128

# Channel 1 uses master BPM (128)
channel 1 => inst leadA seq lead

# Channel 2 runs twice as fast (240 BPM effective) using a speed multiplier
channel 2 => inst leadB seq bass speed=2x
```

**Example pattern snippet**
```
inst leadA type=pulse1 duty=60 env=gb:12,down,7 gm=81
inst sn type=noise env=gb:10,down,1

# C5:4 plays for 4 ticks; E5 _ _ _ also plays for 4 ticks
pat melody = C5:4 E5 _ _ _ (G5 C6)*2 inst(sn,2) C6 C6 .

# Use a top-level BPM instead of channel-level bpm
bpm 160
channel 1 => inst leadA pat melody
channel 4 => inst sn pat drums
```

This plays the motif on channel 1, temporarily substituting the `sn` noise instrument for the next two non‑rest hits.

### Wave channel volume example

The Game Boy wave channel exposes a per-instrument output-level selector via `volume=`. This selector is stored as a raw 0..3 value in UGE (0=mute, 1=100%, 2=50%, 3=25%) and maps to the hardware NR32 register as `(value << 5)` — it is not an envelope. Therefore, changing `volume=` while a note is sustaining has no audible effect until the note is retriggered or the instrument is changed.

Example:

```
# Two wave instruments with different output levels
inst wave_loud type=wave wave=[8,11,13,14,15,14,13,11,8,4,2,1,0,1,2,4] volume=100
inst wave_soft type=wave wave=[8,11,13,14,15,14,13,11,8,4,2,1,0,1,2,4] volume=50

# Play the same pattern twice; the second occurrence is a retrigger so it takes the new level
pat hold = C4:8
seq hold_seq = hold:inst(wave_loud) hold:inst(wave_soft)
channel 3 => seq hold_seq
```

In this example the first `hold` plays at the loud output level; the second `hold` is retriggered and plays at the softer level.

## Using the CLI

BeatBax provides a command-line interface for playback, validation, and export.

### Play a song

```powershell
npm run cli -- play songs\sample.bax
```

This parses the song and starts playback. In a Node.js environment, this defaults to **headless playback** (using the native PCM renderer). To launch the browser-based Web UI for playback, use the `--browser` flag.

**Playback Flags:**
- `--browser` (or `-b`): Launch browser-based playback (opens web UI).
- `--headless` (or `--no-browser`): Force headless Node.js playback (default in Node).
- `--backend <auto|browser|node-webaudio>`: Explicitly choose the audio backend.
- `--sample-rate <hz>` (or `-r`): Set the sample rate (global flag).
- `--buffer-frames <n>`: Set the buffer size for offline rendering (default: 4096).
- `--verbose` (or `-v`): Show the parsed AST and detailed logs.

Note on `play` directive flags:
- You can add a top-level `play` directive inside a `.bax` file with optional flags `auto` and `repeat`.
  - `play auto` requests the web UI to start playback when the file is loaded.
  - `play repeat` requests continuous looping of the song.
  The web UI will attempt to resume the `AudioContext` for `play auto`, but browsers commonly require a user gesture to enable audible playback; the UI shows a prompt when this occurs.

### Verify/validate a song

```powershell
npm run cli -- verify songs\sample.bax
```

Checks the song for parsing errors and basic validation issues (undefined instruments, empty patterns, etc.).

### Inspect files

The `inspect` command provides a quick way to view file structure:

**For .bax files:**
```powershell
# Text summary (default)
node bin/beatbax inspect songs\sample.bax
# Shows: chip, tempo, pattern/sequence/instrument counts, metadata

# Full AST in JSON format
node bin/beatbax inspect songs\sample.bax --json
```

**For .uge files:**
```powershell
# Text summary (default)
node bin/beatbax inspect songs\example.uge
# Shows: version, title, BPM, pattern/instrument counts

# Detailed JSON breakdown
node bin/beatbax inspect songs\example.uge --json
# Includes: patterns with note names (C5, E5, etc.),
#           instruments with human-readable fields,
#           wavetables in hex format, orders, statistics
```

The inspect command is useful for:
- Verifying UGE exports (check that your .bax → .uge export looks correct)
- Understanding hUGETracker file structure
- Debugging instrument and pattern data
- Extracting metadata from existing community UGE files

### Export formats

BeatBax supports four export formats. Note that the **format** must be the first argument after `export`.

**JSON** (Intermediate Song Model):
```powershell
npm run cli -- export json songs\sample.bax output.json
```

**MIDI** (4-track Standard MIDI File):
```powershell
npm run cli -- export midi songs\sample.bax output.mid
```

**UGE** (hUGETracker v6 format for Game Boy):
```powershell
npm run cli -- export uge songs\sample.bax output.uge
```
*Note: UGE files use a fixed 64-row pattern grid. BeatBax automatically splits longer sequences into multiple 64-row patterns and synchronizes the order list across all 4 channels. For best results, keep your pattern definitions to multiples of 16 or 64 tokens.*

**WAV** (Offline PCM rendering):
```powershell
npm run cli -- export wav songs\sample.bax output.wav
```
*Note: WAV export supports additional flags:*
- `--duration <seconds>` (or `-d`): Limit the render length.
- `--bit-depth <16|24|32>` (or `-b`): Set the output bit depth (default: 16).
- `--channels <1,2,3,4>` (or `-c`): Select specific Game Boy channels to render (e.g., `-c 1,2`).

**UGE (hUGETracker v6 format)**
```powershell
npm run cli -- export uge songs\panning_demo.bax output.uge
# Use strict GB compatibility check to reject numeric pans instead of snapping:
npm run cli -- export uge songs\panning_demo.bax output.uge --strict-gb
```
Notes:
- `--strict-gb` treats numeric `pan` values as an error to enforce exact NR51-only semantics for Game Boy exports. In non-strict mode numeric pans are deterministically snapped (pan < -0.33 → L, pan > 0.33 → R, otherwise C).
- Use `npm run cli -- export json <file>` to get the resolved ISM which includes per-note `pan` fields for inspection.
- `--normalize`: Scale audio peak to 0.95 (0dBFS equivalent).
- `--sample-rate <hz>` (or `-r`): Set the sample rate (global flag, e.g., `npm run cli -- -r 48000 export wav ...`).

The CLI validates that the input file exists and that the format is supported before processing. If you omit the output path, a default filename based on the input will be used.

### Development mode

For faster iteration without rebuilding:

```powershell
npm run cli:dev -- play songs\sample.bax
```

## Running the demo (local)

1. Build the web UI bundle (TypeScript -> browser):

```powershell
npm run web-ui:build
```

2. Run the web UI dev server and open it in a browser:

```powershell
npm run web-ui:dev
# open the URL shown by Vite (usually http://127.0.0.1:5173)
```

3. Controls in the demo:
- Paste or load a `.bax` file into the editor and click `Play` / `Apply & Play`.
- `Live` checkbox: when enabled, edits are applied (debounced) automatically.
- Per‑channel `Mute` / `Solo` controls appear after applying a song.
- Help panel: click the ❓ icon or the Show Help button (H / ? toggles the panel). The help panel surfaces the commented documentation inside `songs/sample.bax`.

## Troubleshooting
- If audio is silent in your browser, verify your browser supports WebAudio and that the demo did not throttle audio (autoplay policies may require a user gesture).
- You can inspect `window.__beatbax_player` in the console for runtime diagnostics.
- Use the `--debug` (or `-D`) flag on the CLI to see full stack traces if a command fails.
- Use the `--verbose` (or `-v`) flag to see more detailed validation information and the parsed AST.

That's all — for developer notes, see `DEVNOTES.md`.

## Importing UGE Files

BeatBax includes a UGE reader that can parse hUGETracker v6 files:

```typescript
import { readUGEFile } from 'beatbax/import';

const ugeSong = await readUGEFile('path/to/song.uge');
console.log(ugeSong.songName, ugeSong.artist);
console.log('Instruments:', ugeSong.dutyInstruments.length);
console.log('Patterns:', ugeSong.patterns.length);
```

The UGE reader provides full access to instrument tables, pattern data, order lists, and song metadata. See `packages/engine/src/import/uge/uge.reader.ts` for the complete API.

## Buffered Rendering (Performance mode)

For heavy songs or many simultaneous events, BeatBax can pre-render short audio segments and schedule them as AudioBuffer playback to reduce real-time CPU work.

How it works
- The player groups events into fixed-length segments (default 0.5s), renders each segment with an `OfflineAudioContext`, then schedules the rendered `AudioBuffer` on the real `AudioContext` to play at the correct absolute time.
- This reduces the number of live oscillator/buffer-source objects created at playback time and can substantially lower CPU usage for dense arrangements.

Enabling buffered mode
The `Player` constructor accepts a `buffered` option and tuning parameters:

- `buffered` (boolean): enable buffered rendering.
- `segmentDuration` (number, seconds): length of each pre-render segment (default `0.5`).
- `bufferedLookahead` (number, seconds): how far ahead to start rendering a segment before its playback time (default `0.25`).
- `maxPreRenderSegments` (number): optional cap on how many future segments may be queued for pre-rendering; when the cap is reached, the renderer falls back to scheduling nodes directly on the live `AudioContext`.

Example (enable buffering):

```ts
import Player from 'beatbax/audio/playback';

const audioCtx = new AudioContext();
// Enable buffered rendering with a 0.5s segment and 0.3s lookahead, max 6 segments
const player = new Player(audioCtx, { buffered: true, segmentDuration: 0.5, bufferedLookahead: 0.3, maxPreRenderSegments: 6 });
await player.playAST(parsedAst);
```

Notes & tuning
- `segmentDuration` trade-offs:
  - Smaller segments reduce latency for updates/hot-reload and reduce memory per segment, but increase overhead (more segments to render).
  - Larger segments amortize render overhead but increase memory usage and make live edits take longer to reflect.
- `bufferedLookahead`: set this to a value slightly larger than the renderer's expected render time so buffers are ready before playback. Typical values: `0.2`–`0.5`.
- `maxPreRenderSegments`: prevents unbounded pre-rendering (useful for long songs or limited-memory environments). When this limit is reached, the system falls back to scheduling nodes directly, preserving correctness at the cost of higher CPU.

Stop / per-channel cleanup
- `Player.stop()` stops both live-scheduled nodes and any pre-rendered BufferSources that are scheduled to play.
- You can also stop buffered nodes per-channel using the buffered renderer API (exposed internally). If you want a public `stopChannel(chId)` helper added to `Player`, I can add it.

Fallbacks
- If `OfflineAudioContext` is not available, buffered rendering falls back to direct scheduling of events to maintain playback correctness.

When to use buffering
- Use buffered mode for complex songs with many simultaneous oscillators or when demo profiling shows high CPU. For simple songs, direct scheduling is usually fine and has lower latency for live edits.
