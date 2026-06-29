# ZX Spectrum 128 Composition Guide

This guide focuses on practical arrangement for the ZX Spectrum 128 AY-3-8912 PSG target in BeatBax.

## Core Constraints

- Three tone channels (A/B/C → `tone1`, `tone2`, `tone3`).
- **One shared noise generator** (R6 noise period, 5-bit).
- **One shared hardware envelope** (R11–R13).
- Per-channel mixer (R7): independent tone/noise enable bits.

These constraints define almost every successful Spectrum arrangement pattern.

## Practical Channel Strategy

Common role split:

- Channel A: lead melody
- Channel B: arpeggio/harmony support
- Channel C: bass (often envelope-driven buzz bass)

Percussion is not a fourth channel — it **borrows** a tone channel’s mixer and volume for short noise/tone bursts. Two workable layouts:

1. **Split kit** — one drum lane per channel (hat / snare / kick on A/B/C). Hits can use different `noise_rate` values because only one noise voice is active per tick.
2. **Multiplexed kit** — one channel, many named instruments (`kick`, `snare`, `hatc`, …) as pattern tokens. Same rule: **stagger hits** so only one noise timbre is needed per tick, or accept that R6 follows the last writer.

See `songs/spectrum-128/instruments/ay_percussion_demo.bax` for both layouts in one song.

## Envelope Bass Technique

The classic Spectrum buzz bass runs a **low square wave** through the **hardware envelope as a fast sawtooth** (shape **8**, repeating decay). BeatBax sets `env_bass=true` to route the channel through envelope mode with a very short period — many complete 16-step saw ramps per tone cycle:

$$
N_{env} \approx \max\!\left(1,\ \left\lfloor \frac{N_{tone}}{2048} \right\rfloor\right),\quad N_{tone} = \left\lfloor \frac{f_{clock}}{16 \times f_{note}} \right\rfloor
$$

At bass frequencies $N_{env}$ often clamps to **1**, giving ~100+ envelope level steps per tone period (gritty buzz). Shape **10** (zigzag) or ~8 steps/period sounds like tremolo/vibrato — avoid. Do not layer `pitch_env` bass on another channel over the same roots while `env_bass` is active. Do **not** use `vol_env` on another instrument in the same phrase — both program R11–R13.

### How trackers use buzz bass (arrangement)

On real Spectrum / AY music, buzz bass is almost always a **long drone**, not short stabs:

- **Hold the root** on channel C for a bar or several beats while melody and arpeggios move on A/B.
- **Change pitch occasionally** (new root every 1–2 bars), not every step — the “buzz” is the timbre from the fast hardware envelope on that held note.
- **Arpeggios above** (channel A/B) provide harmony; the bass stays on one pitch so the envelope modulation stays steady.
- **Pitch slides** appear in some tunes (portamento between roots), but the hallmark is sustain + timbre, not fast `pitch_env` wobble on the bass channel.

In BeatBax, one pattern token = one tick. A lone `C2` is only ~117 ms at 128 BPM unless you extend it:

```bax
# Whole-bar C2 (16 steps): hit once, sustain 15 ticks
pat bass_bar = C2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _

# Two roots per bar: half-bar each
pat bass = C2 _ _ _ _ _ _ _ G1 _ _ _ _ _ _ _
```

Use **`.`** for silence between roots, **`_`** to lengthen the previous note. Do not expect `C2 . . .` to hold — dots are rests.

`pitch_env` on a normal (non-`env_bass`) bass line is fine for slides; on `env_bass=true` it retunes every 60 Hz frame and usually fights the buzz — prefer held roots and rare note changes.

## Arpeggios as Harmony Compression

Use fast arpeggios to imply chords while preserving channels for bass and melody.

Typical patterns:

- Root-5th-octave
- Root-3rd-5th
- Root-flat3-5th

At frame-rate stepping, these fuse into stable harmonic color on real hardware and emulators.

---

## Percussion Design (BeatBax AY Plugin)

BeatBax models AY percussion with **software macros** stepped at **60 Hz** (`vol_env`, `pitch_env`) plus optional **transient mixer windows** (`noise_frames`, `tone_frames`, `tone_vol`). This is not the same as latching a hardware envelope shape on R13 — use software `vol_env` for independent drum decay on each hit, and reserve hardware R11–R13 for one melodic/buzz-bass part if needed.

### Instrument fields

| Field | Role |
|-------|------|
| `tone_mix=true` | Enable noise in the channel mixer (required for noise drums) |
| `noise_rate` | R6 period **0–31** (0 = fastest/brightest, 31 = slowest/darkest). **Global** — one value active per tick |
| `tone=true` / omit | With `tone_mix`, default is **noise-only** unless `tone=true` |
| `note=` | Pitch for named pattern tokens (`kick`, `snare`, …) and stick/tone layers |
| `vol` / `vol_env` | Fixed level or per-frame decay array `[15,12,9,…,0]` |
| `pitch_env` | Semitone bend per frame (kick body drop) |
| `noise_frames` | Mix noise for first **N** 60 Hz frames only (kick attack click) |
| `tone_frames` | Mix tone for first **N** frames only (snare stick, hat/crash ping) |
| `tone_vol` | Cap tone-path volume **0–15** separately from noise (`vol` / `vol_env`) |

### Noise period cheat sheet

| `noise_rate` | Character | Typical use |
|--------------|-----------|-------------|
| 0–1 | Brightest hiss | Crash |
| 2–4 | Bright/metallic | Closed hat, kick transient |
| 5–8 | Mid | Snare body, rim |
| 9+ | Darker | Special FX (avoid for standard kit unless staggered) |

**Rule:** If two drums overlap on the same tick with different `noise_rate` values, the arbitrator keeps the last write and emits a diagnostic — stagger hits or use the same rate for simultaneous voices.

### Named drum tokens

Define one `inst` per drum name, then use the name as a pattern hit (not a note letter):

```bax
inst kick type=tone3 vol=15 tone_mix=true noise_rate=4 …
pat groove = kick . hatc . snare . hatc
channel 3 => inst kick pat groove
```

Each channel line still has a default `inst` (for typing), but inline tokens switch the hit’s instrument properties. Set `note=` on the instrument when a hit needs pitch (kick body, stick layer).

### Pattern duration and sustains

A named token lasts **one pattern step** by default. Long `vol_env` tails (crash, open hat) are cut off when the step ends unless you extend the note:

- **`.`** — rest / silent step (does **not** extend the previous hit)
- **`_`** — sustain: adds one tick of ring-out to the **previous** hit on that channel

Example — crash with 17-frame fade needs extra ticks:

```bax
pat fill = kick snare crash _ _ _ rim .
```

At 128 BPM with default `stepsPerBar`, one step ≈ 117 ms (~7 frames at 60 Hz). Plan roughly **one `_` per 7 frames** of envelope you need to hear, or tune by ear.

---

## Drum Recipes (reference implementations)

Copy from `songs/spectrum-128/instruments/ay_percussion_demo.bax` or adapt below.

### Kick

Hardware-style recipe: low tone body, pitch falls from above, bright noise for 1–3 frames, then tone-only decay.

```bax
inst kick type=tone3 vol=15 tone=true tone_mix=true noise_rate=4 noise_frames=3 \
  note=C3 pitch_env=[+5,+2,0,-2,-4,-6] vol_env=[15,12,9,6,3,0]
```

- **C2–C3** — body pitch (C3 = punchier, C2 = subbier).
- **`pitch_env`** — starts above body, steps down (the “thump”).
- **`noise_frames=3`** — noise click only at the attack; tone carries the sustain.

### Snare

Noise body, optional short stick tone under the noise (not piercing):

```bax
inst snare type=tone2 vol=15 tone=true tone_mix=true noise_rate=6 \
  tone_frames=1 tone_vol=4 note=E5 vol_env=[15,12,9,6,4,2,0]
```

- **`tone_frames=1`** + **`tone_vol=4`** — brief stick; noise uses full `vol_env`.
- Mid **`noise_rate`** (≈ 6) for body; no stick = omit `tone=true`.

### Closed hi-hat (CH)

Noise-only body, bright noise, fast decay; optional 1-frame tick:

```bax
inst hatc type=tone1 vol=15 tone=true tone_mix=true noise_rate=2 \
  tone_frames=1 tone_vol=2 note=E7 vol_env=[15,10,6,3,0]
```

Target decay shape: **15 → 10 → 6 → 3 → 0** (~5 frames).

### Open hi-hat (OH)

Same noise colour as closed, **longer** decay via more `vol_env` steps (not a longer pattern step):

```bax
inst hato type=tone1 vol=15 tone_mix=true noise_rate=2 \
  vol_env=[15,13,11,9,7,5,3,1,0]
```

~9 frames ≈ 150 ms at 60 Hz — clearly longer than closed, still shorter than crash.

### Crash

Brightest noise, slow 1-step fade, short ping; **must** sustain in the pattern:

```bax
inst crash type=tone3 vol=15 tone=true tone_mix=true noise_rate=1 \
  tone_frames=2 tone_vol=4 note=E7 \
  vol_env=[15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0]

pat outro = … crash _ _ _ . . .
```

- **`noise_rate=1`** — brightest top end.
- **17-step** `vol_env` — slow fade (not a snare-style drop).
- **`crash _ _ _`** — pattern ring-out so the tail is not truncated.

Alternatives not yet in the plugin: alternating `noise_rate` per frame (metallic beating) or dual-channel crashes with two noise periods — require staggered hits or future `noise_rate_env` support.

### Rim

Short mid-noise hit:

```bax
inst rim type=tone2 vol=11 tone_mix=true noise_rate=6 vol_env=[15,8,3,0]
```

---

## Arrangement Patterns

### Split kit (three channels)

```bax
channel 1 => inst hatc  seq hat_lane
channel 2 => inst snare seq snare_lane
channel 3 => inst kick  seq kick_lane
```

Each lane pattern uses rests (`.`) so lanes do not all fire on the same tick unless intentional.

### Multiplexed kit (one channel)

Drive channel 3 with mixed tokens; put `rest_bar` on other channels during the kit section:

```bax
pat rest_bar = . . . . . . . . . . . . . . . .
seq kit_block = groove syncop fill outro
seq hats      = rest_bar rest_bar rest_bar rest_bar
channel 1 => inst hatc seq hats
channel 3 => inst kick seq kit_block
```

---

## Anti-Patterns

- **Different `noise_rate` on overlapping hits** — last writer wins; other drums get the wrong timbre.
- **Two instruments with `vol_env` in the same phrase** — fights over R11–R13 if mapped to hardware envelope; BeatBax software `vol_env` is per-hit safe, but buzz-bass / hardware env still conflict.
- **Long crash without `_` sustains** — envelope truncated at one pattern step.
- **High `note` + full volume stick on snare/hat** — use `tone_vol` and 1–2 `tone_frames`, not sustained square tone.

---

## Spectrum-Specific Export Intent

When composing for this plugin, prioritize export paths that match common Spectrum/homebrew workflows:

- Tracker-oriented: PT3 and Arkos formats where supported
- Register-stream: VGM or raw register streams

Use rendered WAV/OGG as preview artifacts, not as hardware-native outputs.

---

## Reference Songs

| Song | Purpose |
|------|---------|
| `songs/spectrum-128/instruments/ay_percussion_demo.bax` | Full named kit, split + multiplexed layouts, all drum recipes |
| `songs/spectrum-128/instruments/ay_macro_arp_pitch.bax` | Melody macros (`arp_env`, `pitch_env`) |
| `songs/spectrum-128/instruments/ay_synth_channels.bax` | Minimal tone A/B/C smoke check |
| `songs/spectrum-128/instruments/ay_noise_mixing.bax` | Per-channel R7 mixer routing |
| `songs/spectrum-128/instruments/ay_buzz_bass.bax` | Buzz bass (`env_bass`) |
| `songs/spectrum-128/instruments/ay_all_macros.bax` | Valid macro combination |
| `songs/spectrum-128/instruments/ay_noise_rate_conflict.bax` | Intentional R6 conflict (verify warning) |
| `songs/spectrum-128/instruments/ay_vol_env_conflict.bax` | Intentional R11–R13 conflict (verify warning) |
| `songs/spectrum-128/effects/ay_effects_showcase.bax` | Supported inline effects (vib, port, bend, volSlide, trem, cut, etc.) |
| `songs/spectrum-128/effects/ay_unsupported_effects_demo.bax` | Invalid / SMS-only effects (`noise_rate_env`, `sweep`, …) for `verify` |
| `songs/spectrum-128/amstrad-cpc-demo.bax` | Same arrangement with `chip cpc` |
