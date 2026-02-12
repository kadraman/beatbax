# Instruments Reference

## Wavetable (Wave) — format & design

### Format & sizing
- BeatBax expects 16 4-bit samples (values 0–15) for `wave=[...]`. When exporting to UGE, 16-entry tables are repeated to fill the 32-nibble Wave RAM slot.
- Input may be a JS array or a JSON-like string (e.g., `"[0,1,2,...]"`). Values are clamped to 0..15 on export.

### Normalization & headroom
- Ensure your wavetable reaches near the top (max ≈ 15) for good perceived loudness. Very-low peaks result in quiet output even with `volume=100`.
- Avoid strong DC bias; if your table is mostly >8 or <8, rescale or center the waveform to prevent bias-related artifacts.

### Design tips & examples
- Bass: smooth symmetric shapes (triangle-like) with limited high harmonics.
- Pads: midharmonic-rich shapes, consider gentle asymmetry for warmth.
- Metallic: asymmetric, high-harmonic shapes (may alias at high pitches).

Example wavetables:
```
# Smooth bass
wave = [0,2,4,6,8,10,12,14,15,14,12,10,8,6,4,2]
# Metallic bell
wave = [15,0,12,3,9,6,6,9,3,12,0,15,0,12,3,9]
```

### Aliasing considerations
- High-harmonic tables may alias when played at high pitches; reduce high-frequency content for very high notes or lower the octave for those parts.

## Wave Channel Volume 🔊

The Game Boy wave channel has a global volume control separate from the wavetable data. BeatBax supports specifying this per-wave instrument using `volume=` (or `vol=` with a percent suffix).

Valid values:

- `volume=0` or `vol=0%` — Mute (0%)
- `volume=25` or `vol=25%` — Quiet (25%)
- `volume=50` or `vol=50%` — Medium (50%)
- `volume=100` or `vol=100%` — Loud (100%) — **default**

Quick reference (BeatBax → hUGE → NR32)

| BeatBax `volume=` | hUGE stored value | NR32 (hex) |
|---:|:---:|:---:|
| `100` | `1` | `0x20` |
| `50`  | `2` | `0x40` |
| `25`  | `3` | `0x60` |
| `0`   | `0` | `0x00` |

Note: hUGE stores the raw selector value (0..3); hUGEDriver writes NR32 = (value << 5). This is an output-level selector — not a per-note envelope.

Examples:

```
inst bass type=wave wave=[0,4,8,12,15,12,8,4,0,4,8,12,15,12,8,4] volume=100
inst pad  type=wave wave=[8,11,13,14,15,14,13,11,8,4,2,1,0,1,2,4] vol=50%
```

Interoperability / round-trip note:
- When importing a `.uge` file, the raw `volume` (0..3) should be mapped back to BeatBax `volume=` percentages (1→100, 2→50, 3→25, 0→0) so round-trips remain human-readable. Keep in mind this is a selector only — editing it in an existing song will not affect already-sounding notes until they're retriggered.

Best practices:
- Use `volume=100` for leads and bass to sit well with pulse channels.
- Use `volume=50` for background pads or textures.
- Avoid `volume=25` unless intentionally very quiet.
- `volume=0` is useful for temporarily muting a wave instrument without removing it.

**Important:** `volume=` is an output-level selector (stored as 0..3 in UGE). Changes to this value only take effect when the note is retriggered or the instrument is changed — they do not immediately alter already-sounding notes.

---

FAQ

- Q: Can I change `volume=` mid-note and expect an instantaneous level change?
  - A: No — the Game Boy hardware (and hUGEDriver) only applies the output-level when the note is triggered or the instrument changes; mid-note changes do not affect the sounding voice.

- Q: Why does my wave sound quiet even at `volume=100`?
  - A: Check your wavetable peak values — if the maximum sample < 15 the waveform may be quieter than expected. Also verify panning and the channel mix.

Mixing tips

- Use `volume=100` for melodic leads and bass patches to match pulse channel perceived loudness.
- Use `volume=50` for background pads or textures to avoid masking leads.
- Reserve `volume=25` for very quiet textures or layered effects.

Testing & validation

- Export to UGE (`npm run cli -- export uge <file> out.uge`) and inspect using the UGE reader or `dx` tools to verify the `output_level` field for wave instruments. Unit tests in the engine include `packages/engine/tests/uge-wave-volume.test.ts` to assert raw storage semantics.

Implementation note

- The PCM renderer applies a simple multiplier mapping (0 → 0.0, 25 → 0.25, 50 → 0.5, 100 → 1.0) to wave samples during rendering to emulate the output-level locally; the UGE writer stores the raw selector (0..3) for hUGE. For consistent results, prefer using `volume=100` for key melodic parts if you rely on round-trip UGE exports.

## Pulse (Duty) — quick reference

### Duty options
- **12.5%** — thin, cutting (good for arpeggios and trebly leads)
- **25%** — classic square-like timbre
- **50%** — balanced, full-sounding
- **75%** — darker/thicker tone

### Envelope & sweep
- `env=gb:<initial>,<up|down>,<period>` — `initial` 0–15, `period` 0 means constant volume. Use `period` to control envelope speed.
- `sweep` (Pulse 1 only) applies frequency shifts over time to create slides; use moderate parameters to avoid abrupt pitch jumps.

### Tips & pitfalls
- Short envelope periods (1–2) create plucky staccato notes; long periods create pads. `period=0` preserves initial volume.
- For low notes use wider duty or add subtle detune on pulse pair to fill spectrum.

## Noise (LFSR) — quick reference

### Modes & parameters
- `width=7` (7-bit) — metallic, high-frequency noise (hi-hats, shakers)
- `width=15` (15-bit) — broader, fuller noise (snares, ambience)
- `divisor` and `shift` control the LFSR update rate: higher `shift` → lower pitched noise. Use combinations to sculpt brightness/time.

### Percussion & envelopes
- Short, high-initial envelopes with width=7 are great for hi-hats; longer envelopes with width=15 produce snares and toms.

## Default Note Parameter (`note=`)

**New in instrument note mapping feature**

All instrument types (pulse, wave, noise) can specify a default note value using the `note=` parameter. When you use the instrument name as a pattern token (e.g., `snare` or `kick`), this note is automatically used:

```
inst kick     type=pulse1 duty=12.5 env=15,down note=C2
inst snare    type=noise  gb:width=7 env=13,down note=C6
inst hihat_cl type=noise  gb:width=15 env=6,down note=C6

pat drums = kick . snare . kick . hihat_cl .  # Uses default notes automatically
```

### Behavior

1. **Pulse/Wave instruments:** The specified note is the actual pitch played when using the instrument name as a token
2. **Noise instruments:** The note value is stored for UGE export compatibility (noise doesn't use traditional pitch during playback)
3. **Override per-note:** You can still use explicit notes: `inst(snare) D6` overrides the default
4. **No `note=` specified:** Defaults to C5 for backward compatibility in exports

### Recommended Values

For Game Boy percussion (follows hUGETracker conventions):

- **Kicks** (pulse channels): `note=C2` (deep bass)
- **Snares** (7-bit noise): `note=C6` (exports as C-7 in hUGETracker)
- **Closed hi-hats** (15-bit noise): `note=C6` to `note=D6` (exports as C-7 to D-7)
- **Open hi-hats** (15-bit noise): `note=D6` to `note=E6` (exports as D-7 to E-7)
- **Toms** (7-bit noise): `note=C5` to `note=E5` (exports as C-6 to E-6)
- **Cymbals** (15-bit noise): `note=E6` to `note=F6` (exports as E-7 to F-7)

**Important:** hUGETracker displays notes ONE OCTAVE HIGHER than BeatBax's MIDI notation:
- BeatBax `note=C6` → exports as C-7 in hUGETracker
- BeatBax `note=C2` → exports as C-3 in hUGETracker

See [instrument-note-mapping-guide.md](instrument-note-mapping-guide.md) for complete usage examples.

## Cheat-sheet (at-a-glance)

| Instrument | Key params | Typical defaults |
|---|---:|:---|
| Wave | `wave=[16]`, `volume=` | wave values 0..15, volume default `100` |
| Pulse | `duty`, `env`, `sweep` | duty 50, env=gb:15,down,1 |
| Noise | `width`, `divisor`, `shift`, `env` | width=15, divisor=3, shift=4 |

## Tests & examples
- See `songs/instrument_demo.bax` and the added tutorial example for quick demos.
- Test suggestions: validate `parseWaveTable()` clamps values and repeats 16→32, envelope parsing edge cases, and noise frequency mapping under unit tests.

For other instrument details, consult the respective sections (pulse, noise) in this document or the individual feature pages in `/docs/features/`.
