# Sega Master System / Game Gear PSG - Composition Guide

This guide covers practical composition techniques for the Sega Master System and Sega Game Gear PSG sound architecture. It is written for composers and arrangers working in BeatBax or any PSG-first workflow.

---

## Contents

1. [Composition Techniques](#1-composition-techniques)
2. [Channel Roles in Practice](#2-channel-roles-in-practice)
3. [The Impossible Arrangement Problem](#3-the-impossible-arrangement-problem)
4. [Why These Techniques Still Matter](#4-why-these-techniques-still-matter)
5. [Evolved BeatBax SMS Patterns](#5-evolved-beatbax-sms-patterns)

---

## 1. Composition Techniques

The SMS/Game Gear PSG provides three fixed square channels plus one noise channel. There are no hardware envelopes, no hardware vibrato, and no filter stage. Most expression comes from software timing and arrangement choices.

---

### 1.1 Arpeggios for Harmonic Density

The problem: three tonal voices are not enough for full chords plus bass and melody.

The technique: cycle chord tones quickly on one channel so the ear fuses them into implied harmony.

Common patterns:

| Pattern | Character |
|---------|-----------|
| Root-5th-octave | Open and energetic |
| Root-3rd-5th | Bright triad shimmer |
| Root-flat3-5th | Darker minor color |
| Root-5th-flat7th | Driving dominant feel |

Because all tone channels share the same fixed square timbre, interval choice and rhythm carry most of the harmonic identity.

---

### 1.2 Octave Layering to Simulate Weight

The problem: the PSG low end can feel thin compared with chips that have dedicated low-frequency channels.

The technique: double important bass notes one octave up on a second tone channel at lower level. The low note provides foundation while the upper octave adds audible definition.

Typical layout:

- Tone 3: bass root line
- Tone 2: occasional octave reinforcement on strong beats
- Tone 1: melody remains free

This is one of the most common ways to make SMS/Game Gear arrangements feel fuller without adding channels.

---

### 1.3 Software Envelopes for Articulation

The problem: no hardware ADSR.

The technique: write volume changes per row/tick to create envelope shapes.

Important BeatBax SMS convention:

- `vol` and `vol_env` are SN76489 attenuation values.
- `0` is loudest.
- `15` is mute.
- A "fade out" usually moves upward (for example `2 -> 6 -> 10 -> 15`).

Useful envelope patterns:

| Shape | Write pattern | Sound |
|------|---------------|-------|
| Pluck | 2-4 fast upward attenuation steps (for example `0,4,8,12,15`) | Punchy and short |
| Sustain-ish | Hold low attenuation, then slight upward drift (for example `6,6,7,8`) | Stable lead |
| Swell | Start with high attenuation then step downward (for example `14,12,10,8`) | Soft attack pad-like behavior |
| Gate | Alternate low attenuation and mute (`x,15,x,15`) | Chopped rhythmic pulse |

On this chip, instrument design is mostly a data-sequencing problem, not oscillator configuration.

---

### 1.4 Vibrato and Pitch Slides by Register Writes

The problem: no dedicated vibrato/portamento hardware.

The technique: periodically rewrite tone period values.

Common vibrato parameters:

| Parameter | Typical range |
|-----------|----------------|
| Depth | +/-1 to +/-4 period units |
| Rate | 4-8 Hz equivalent |
| Delay | 0-2 rows before onset |

Fast stepped slides and short bends are especially effective on this PSG because pitch changes are immediate and bright.

---

### 1.5 Noise Channel Drum Design

The problem: no PCM drum path in the base PSG workflow.

The technique: build a small synthetic drum kit from noise mode, noise rate, and volume-decay timing.

Starter kit:

| Drum role | Mode | Rate | Envelope style |
|-----------|------|------|----------------|
| Snare | White | Medium | Fast decay |
| Closed hat | White | High | Very fast decay |
| Open hat | White | High/Medium | Moderate decay |
| Metal click | Periodic | High | Very short gate |
| Low thump illusion | Periodic or white | Low | Slower decay |

Switching rate/mode per hit yields more realistic percussion than static settings.

---

### 1.6 Tone-3-Coupled Noise Tricks

The problem: pure noise percussion can feel untuned.

The technique: use the noise setting that derives timing from Tone 3, then modulate Tone 3 to move the perceived drum color.

Results:

- Tuned snare-like tones
- Metallic tom-like effects
- Animated fills that track harmonic movement

This is a signature PSG trick that rewards careful sequencing.

---

### 1.7 Game Gear Stereo Arrangement

The Game Gear stereo router allows each channel to be assigned L, R, or both.

Practical usage:

- Melody slightly isolated (L or R)
- Counter-line opposite side
- Bass centered (both)
- Noise often centered for groove stability

Since routing is discrete (not continuous pan), abrupt switches can sound dramatic. Use them deliberately at phrase boundaries rather than every row.

---

### 1.8 Fast Tempos to Mask Channel Limits

The problem: slower tempos expose single-voice compromises and obvious channel reuse.

The technique: moderate-to-fast tempos help arpeggios fuse and make voice handoffs feel intentional.

At BPM $160$, a 1/16 step is:

$$
\frac{60}{160} \times \frac{1}{4} = 93.75\text{ ms}
$$

That is fast enough for harmonic shimmer but still rhythmic enough for groove clarity.

---

### 1.9 Repetition with Micro-Variation

The problem: short loop forms can feel mechanical.

The technique: keep loops compact, but vary one tiny detail every 4 or 8 bars.

Reliable micro-variations:

- One extra noise hit before loop reset
- One-note lead pickup
- Temporary stereo swap on Game Gear
- One-bar octave reinforcement in bass

These small changes dramatically improve perceived musical intent.

---

### 1.10 Compose for Channel Loss During SFX

The problem: gameplay sound effects may temporarily steal channels.

The technique: keep musical priority clear:

- Melody must survive if one support channel drops
- Bass motion should still read if noise/percussion disappears
- Avoid placing essential harmonic information only in one fragile layer

Resilient arrangements are easier to integrate into real games.

---

## 2. Channel Roles in Practice

A common SMS/Game Gear role map:

| Channel | Primary role | Secondary role |
|---------|--------------|----------------|
| Tone 1 | Lead melody | Fast arpeggio line |
| Tone 2 | Harmony/counter-melody | Octave support |
| Tone 3 | Bass/foundation | Arpeggio anchor / noise-coupling source |
| Noise | Percussion | Texture and FX bursts |

On Game Gear, these roles are often combined with side routing for separation, but arrangement should still work when collapsed to mono.

---

## 3. The Impossible Arrangement Problem

You will frequently need more voices than available channels.

Common solutions:

1. Harmonic reduction: play roots and guide tones, omit less critical chord tones.
2. Time-division voicing: alternate two lines rapidly on one channel.
3. Percussion dropout: drop noise in dense melodic passages and re-enter later.
4. Register separation: keep melody, harmony, and bass in distinct octaves to maximize clarity.
5. Stereo-as-structure (Game Gear): route competing lines to opposite sides to reduce masking.

---

## 4. Why These Techniques Still Matter

The SMS/Game Gear PSG teaches core composition discipline:

- Strong melody first
- Rhythmic precision over texture clutter
- Intentional note economy
- Arrangement resilience under constraints

Those are durable skills, whether you are writing strict chiptune, retro game audio, or modern hybrid electronic music.

---

## 5. Evolved BeatBax SMS Patterns

This section documents the techniques that have emerged from building the BeatBax SMS example songs. These are the patterns that worked in practice, not just in theory.

Reference songs:

| Song | What it demonstrates |
|------|----------------------|
| `songs/sms/instruments/sms_percussion_layered_template.bax` | Layered tone+noise percussion |
| `songs/sms/instruments/sms_percussion_layered_slow.bax` | Layered percussion at slower tempos |
| `songs/sms/instruments/sms_gg_stereo.bax` | Game Gear stereo routing and mix balance |
| `songs/sms/instruments/sms_noise_channel.bax` | Noise drum design with `noise_rate_env` |
| `songs/sms/instruments/sms_macro_arp_env.bax` | `arp_env` macro — one-shot and looping |
| `songs/sms/instruments/sms_macro_pitch_env.bax` | `pitch_env` macro — glide into note |
| `songs/sms/instruments/sms_macro_noise_rate_env.bax` | `noise_rate_env` macro — animated noise timbre |
| `songs/sms/battle_field.bax` | Full arrangement combining all techniques |

---

### 5.1 Layered Percussion: Tone Body + Noise Transient

The single noise channel is not enough for a convincing drum kit on its own. The technique is to dedicate one or two tone channels to pitched percussion bodies and use the noise channel only for transients and hats.

**Channel plan:**

| Channel | Role |
|---------|------|
| Tone 1 | Kick body (low C, short downward `pitch_env`) |
| Tone 2 | Snare body (mid D, brief snap pitch motion) |
| Tone 3 | Bass line (yields to kick on beat 1, uses rests for space) |
| Noise | Kick/snare transients + hi-hats |

**Kick body instrument:**

```bax
inst kbody type=tone1 vol_env=[0,2,4,7,10,13,15] pitch_env=[0,-2,-4,-6,-8,-10]
```

- `vol_env` decays fast — 7 frames from attack to mute
- `pitch_env` falls in semitones each frame, giving the "thud" shape
- No `vol=` needed when `vol_env` is present — it owns the full amplitude shape

**Snare body instrument:**

```bax
inst sbody type=tone2 vol_env=[2,5,8,11,13,15] pitch_env=[3,1,0,0,-1]
```

- Starts slightly flat (attenuation 2 = moderately loud), softer attack than kick
- Pitch snaps briefly upward then settles — mimics the crack of a membrane

**Noise transient instruments:**

```bax
inst knoise type=noise noise_mode=white noise_rate=2 vol_env=[0,3,7,12,15]
inst snoise type=noise noise_mode=white noise_rate=1 vol_env=[1,3,6,9,12,14,15] noise_rate_env=[0,0,1,1,2]
inst hatc   type=noise noise_mode=white noise_rate=0 vol_env=[5,10,14,15]
inst hato   type=noise noise_mode=white noise_rate=0 vol_env=[5,7,9,11,13,15]
inst rim    type=noise noise_mode=periodic noise_rate=1 vol_env=[4,8,12,15]
```

The noise transient hits simultaneously with the tone body on beat 1 and 2. The listener hears the noise "crack" fused with the tone body "thud", creating a more convincing drum sound than either layer alone.

**Groove patterns:**

```bax
pat p_kbody  = C2 . . . . . . . C2 . . . . . . .
pat p_sbody  = . . . . D3 . . . . . . . D3 . . .
pat p_noise_a = knoise hatc snoise hatc knoise hatc snoise hato knoise hatc snoise hatc knoise hatc snoise hato
```

The tone body patterns use actual note names — the instrument's `pitch_env` then shapes the perceived pitch downward from that starting point. Using C2 for kick and D3 for snare keeps the two bodies in clearly distinct registers.

**At slower tempos (90 BPM):** Envelopes need to be slightly longer to stay audible between hits. See `sms_percussion_layered_slow.bax` for adjusted envelopes and a fill/break pattern library:

```bax
# Fill: fast hat runs with snare drops
pat p_fill  = knoise hatc hatc snoise hatc hatc knoise hatc hatc snoise hatc hatc snoise snoise hatc hato

# Break: sparse kick and open hat only
pat p_break = knoise . hato . . . hato . knoise . hato . . . hato .
```

---

### 5.2 Mixing and Balancing SMS Channels

The SN76489 attenuation scale runs 0 (loudest) to 15 (mute). Balancing means choosing attenuation floors that keep all elements audible without any one channel dominating.

**Calibrated starting points from reference SMS VGMs:**

| Element | Attenuation floor | Notes |
|---------|------------------|-------|
| Tone lead | 4 | Loud enough to carry melody, not piercing |
| Tone harmony | 5 | Sits below lead; leave headroom |
| Tone bass | 4 | Matches lead; anchors the mix |
| Kick transient | 3 | Needs to punch through tones |
| Snare transient | 4 | Balanced with tones |
| Hi-hat | 5–6 | Background texture |
| Open hat | 6 | Quieter than closed hat |

**The critical mistake:** setting noise transients to `vol=0` while tones sit at `vol=4` or higher. At `vol=0`, the noise channel overpowers everything on the first frame, then the `vol_env` decay reads poorly against the sustained tones. Instead, start noise `vol_env` at 3–4 to match the tones.

**`vol` vs `vol_env`:** Do not combine both on the same instrument. `vol_env` takes full ownership of the amplitude shape. Use `vol` only on instruments that hold a constant level.

```bax
# Correct: vol_env owns the shape, no vol= needed
inst kick  type=noise noise_mode=white noise_rate=2 vol_env=[3,5,7,10,13,15]

# Also correct: constant level with no vol_env
inst lead_vib type=tone1 vol=4
```

---

### 5.3 Macro System: `vol_env`, `pitch_env`, `arp_env`, `noise_rate_env`

BeatBax SMS instruments support four macro arrays that advance per 60 Hz frame. These are the primary expressive tools on a chip with no hardware envelopes.

#### `vol_env` — Volume shape

Array of attenuation values (0–15) stepped each frame. Supports a loop point with `|`.

```bax
# One-shot decay
vol_env=[0,3,6,9,12,15]

# Sustain plateau then decay
vol_env=[2,5,8,11|11]        # loops at index 3 (attenuation 11) until note ends
```

"Counts up toward 15" is the mental model — each entry is a louder-to-quieter step.

#### `pitch_env` — Semitone pitch shape

Array of semitone offsets from the played note, stepped each frame. Useful for:

- **Glide into note:** start above and fall (`pitch_env=[5,4,3,2,1,0,0,0]`)
- **Kick thud:** fall below (`pitch_env=[0,-2,-4,-6,-8,-10]`)
- **Snare crack:** small positive snap (`pitch_env=[3,1,0,0,-1]`)
- **Tension bend:** rise during a pedal note (`pitch_env=[0,1,2,3,4,5,7]`)

```bax
# Pitch drop for kick body — downward from C2
inst kbody type=tone1 vol_env=[0,2,4,7,10,13,15] pitch_env=[0,-2,-4,-6,-8,-10]
```

#### `arp_env` — Arpeggio macro

Array of semitone offsets from base note, cycled each frame. The loop point (`|`) controls where the cycle restarts.

```bax
# One-shot: plays -12, -12, 0, 0, +12, +12 then stops
arp_env=[-12,-12,0,0,12,12]

# Looping minor triad
arp_env=[-12,0,12|0]         # after reaching 12, loops back to index 1 (0)
```

Unlike the inline `arp:` effect (which operates per scheduler tick), `arp_env` advances per 60 Hz frame independently of BPM. This means the arpeggio speed is fixed in absolute time, not musical tempo — which often sounds better for SMS-style shimmer.

#### `noise_rate_env` — Animated noise rate

Array of noise rate values (0–3) stepped each frame. This is unique to the SMS noise channel.

```bax
# Snare: click-then-body — fast transient click, settles to mid rate
noise_rate_env=[0,0,1,1,2]

# Oscillating sweep between rates
noise_rate_env=[0,1,2,1|0]   # loops for animated noise sweep

# Tone3-sync pulse
noise_rate_env=[0,3,0,3,0,3|0]   # alternates between fixed and Tone3-derived
```

Rate values:
- `0` = fastest clock (~6,991 Hz NTSC), bright
- `1` = medium (~3,496 Hz), snare range
- `2` = slowest (~1,748 Hz), deep kick range
- `3` = derived from Tone 3 period (tuned noise)

---

### 5.4 Inline Effects on Notes

Inline effects attach directly to note tokens using `<effect>` syntax. They run per scheduler tick rather than per 60 Hz frame.

**Vibrato:**

```bax
# vib:depth,rate,waveform,durationRows,delayRows
pat pedal_d = D5<vib:4,5,sine,0,4>:16
```

- `depth` (0–15): intensity — larger = wider pitch wobble. Not semitones; the formula is $\Delta f = \text{depth} \times f^2 / 131072$.
- `rate`: LFO speed in Hz (5 = five cycles per second)
- `waveform`: `sine`, `triangle`, `square`, `saw` (or number 0–15)
- `durationRows`: how many pattern rows vibrato is active (0 = full note)
- `delayRows`: rows to wait before onset — use 4 for a stable attack before wobble begins

**Cut:**

```bax
pat harm_a1 = A4<cut:3>:8 D4<cut:3>:8
```

Mutes the note after N ticks. Essential for staccato stab articulation on tone channels — without it, sustained tones blur together.

**Pitch_env (inline override):**

```bax
pat pedal_rise = D5<vib:4,5,sine,0,4><pitch_env:[0,1,2,3,4,5,7]>:16
```

Multiple effects can be chained on a single note. Here vibrato and a pitch rise happen simultaneously during a pedal bar — the combination builds tension before a reprise.

---

### 5.5 Sequence-Level Instrument Overrides

The `:inst(name)` transform on a sequence entry switches which instrument plays a pattern without rewriting the pattern itself. Combined with `:oct()` and `:rev`, this keeps patterns DRY while allowing per-section variation.

```bax
# Same pedal_d pattern, played by the lead_vib instrument in the break section
seq lead_main = ... pedal_d:inst(lead_vib) pedal_d:inst(lead_vib) ...

# Stab patterns replayed an octave up with a different instrument
seq harm_main = harm_b1:inst(stab_hi) harm_b2:inst(stab_hi) ...

# Reverse and octave-down variant of the same base pattern
seq s_main = p_main p_main:rev p_main:inst(i_tone1_arp2):oct(-1) p_main:inst(i_tone1_arp2):rev:oct(-1)
```

This is the primary tool for building arrangement variation from a small pattern vocabulary.

---

### 5.6 Game Gear Stereo Routing

The `gg:pan` instrument property assigns a channel to L, R, or C (both). This is per-instrument, not per-note.

```bax
inst lead  type=tone1 vol=4 vol_env=[4,5,6,7|7] gg:pan=R
inst harm  type=tone2 vol=5 vol_env=[5,6,7,8|8] gg:pan=L
inst bass  type=tone3 vol=4 vol_env=[4,5,6,7|7] gg:pan=C
inst kick  type=noise noise_mode=white noise_rate=2 vol_env=[3,5,7,10,13,15] gg:pan=C
```

Practical rules that emerged from `sms_gg_stereo.bax`:

- **Center bass and drums** — low frequencies and groove anchors need to be mono for compatibility
- **Split melody and harmony** — opposite sides maximizes clarity without needing a mixer
- **Drums: multiple instrument tokens, single channel** — the noise channel is one physical channel but you can drive it with different instrument tokens per hit (`kick`, `snare`, `hihat`, `ohat`, `rim`) by using them directly as pattern tokens:

```bax
pat drums_a = kick hihat . hihat snare hihat . ohat kick hihat . hihat snare hihat rim ohat
```

Each token in a noise pattern fires its own instrument's envelope independently.

