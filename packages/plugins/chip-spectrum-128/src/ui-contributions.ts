/**
 * BeatBax web-UI contributions for the ZX Spectrum 128 / AY-3-8912 chip plugin.
 *
 * Provides:
 *  - copilotSystemPrompt  — hardware reference injected into the AI system prompt
 *  - hoverDocs            — keyword hover docs for Spectrum 128-specific syntax
 *  - helpSections         — help-panel sections tailored to Spectrum/AY authoring
 */
import type { ChipHelpContext, ChipUIContributions } from '@beatbax/engine';
import { resolvePlatformRegionFromSong } from './platform-profiles.js';

// —— CoPilot system prompt ———————————————————————————————————————

const copilotSystemPrompt = `
══ ZX SPECTRUM 128 / AMSTRAD CPC — AY-3-8912 PSG HARDWARE — READ FIRST ══

Exactly 3 channels (A/B/C). Channel-to-type mapping is FIXED:
  channel 1 → type=tone1   (voice A)
  channel 2 → type=tone2   (voice B)
  channel 3 → type=tone3   (voice C)

NEVER write two "channel <number> =>" lines for the same channel.
Use channels 1–3 only (AY-3-8912 has exactly 3 channels).

CLOCK:
  ZX Spectrum 128 (default): AY clock = 1,773,400 Hz, 50 Hz PAL tick.
  Amstrad CPC (chip cpc): AY clock = 1,000,000 Hz, 50 Hz PAL tick.
  Note: 3.5469 MHz is the Spectrum 128 CPU clock — DO NOT use it for period tables.
  Tone period: N = floor(f_clock / (16 × f_tone)),  clamped to 1–4095.

INSTRUMENTS  (inst <name> type=<type> [field=value ...])

  type=tone1 | type=tone2 | type=tone3  (channels 1, 2, 3)
    Fixed 50% duty square wave — NO hardware duty control.
    vol        — Fixed amplitude, 0 (silent) – 15 (loudest).
    vol_env    — HARDWARE envelope program on R11–R13.
                 ⚠ GLOBAL: only ONE vol_env may be active at a time across all channels.
                 For per-channel volume shaping use BeatBax volSlide effect instead.
    arp_env    — Arpeggio in semitone offsets (software, ~60 Hz).
    pitch_env  — Pitch bend in semitones; knots are linearly interpolated over the held note (smooth slide). arp_env stays stepped at ~60 Hz.
    pitch_env  — Pitch bend in semitone offsets (software, 50 Hz step).
    tone_mix   — true = route shared noise into this channel (R7 mixer bit).
                 Default: tone OFF when tone_mix + noise_rate (noise-only percussion).
                 Set tone=true for kick / tone+noise blend.
    tone       — true/false: force tone generator on/off (kick uses tone=true).
    noise_rate — R6 value (0–31). GLOBAL — last writer per tick wins.
                 ⚠ CONFLICT: all simultaneously active noise instruments MUST use the same noise_rate.
    env_bass   — true = buzz-bass mode; uses hardware envelope as oscillator.
                 env_shape — optional R13 shape 0–15 (default 8; try 10 for alternate saw-down repeat).
                 ⚠ Incompatible with vol_env on any other instrument.

SHARED-RESOURCE CONSTRAINTS (CRITICAL — Copilot must enforce these):

  1. NOISE PERIOD (R6): ONE value per tick across all channels.
     ✅ OK:  All noise instruments use noise_rate=10.
     ❌ FAIL: kick noise_rate=2, snare noise_rate=8 — CONFLICT if they overlap.
     FIX: stagger hits (no overlap), or use the same noise_rate for all.

  2. ENVELOPE (R11–R13): ONE hardware envelope program active at a time.
     ✅ OK:  Only one channel uses vol_env OR env_bass in the entire song.
     ❌ FAIL: two channels both have vol_env — they fight over R11–R13.
     FIX: use BeatBax software volume slides for drums; reserve vol_env/env_bass for one lead.

  3. MIXER (R7): INDEPENDENT per channel — this is fine.
     Each channel has its own tone-enable and noise-enable bit.

PERCUSSION MODEL — DO NOT SUGGEST INDEPENDENT NOISE TIMBRES:
  ❌ ANTI-PATTERN (breaks hardware):
     inst kick  type=tone1 tone_mix=true noise_rate=2
     inst snare type=tone2 tone_mix=true noise_rate=8   ; conflict when overlapping!
     inst hihat type=tone3 tone_mix=true noise_rate=15

  ✅ CORRECT: multiplexed drums (same noise_rate, staggered hits):
     inst kick  type=tone3 vol=15 tone_mix=true noise_rate=10
     inst snare type=tone2 vol=14 tone_mix=true noise_rate=10
     pat kick   = C2 . . . . . . .
     pat snare  = . . . D3 . . . .

CHIPTUNE STYLE GUIDE:
  1. Channels A/B/C are equivalent — assign by musical role.
     Common: A=lead, B=harmony, C=bass/drums (borrowed).
  2. Arpeggios with arp_env: arp_env=[0,4,7|0] = major chord arpeggio.
  3. Hardware envelope (vol_env) for ONE lead/bass instrument per phrase.
  4. Noise percussion: same noise_rate for all drums; stagger or time-multiplex hits.
  5. Buzz bass (env_bass=true) for sub-bass oscillator on channel C.
     Cannot coexist with vol_env on any other channel.
  6. Use chip cpc (or chip amstrad-cpc) for Amstrad CPC 1 MHz clock with identical notation.
`.trim();

// —— Hover docs ———————————————————————————————————————————————

const hoverDocs: Record<string, string> = {
  inst: [
    '**Instrument definition** — declares a named instrument with channel type and parameters.',
    '```\ninst <name> type=<type> [field=value ...]\n```',
    '- `note` — default note when the instrument name is used as a hit token, e.g. `note=C3`',
    '',
    '**Spectrum 128 / AY-3-8912 instrument types:**',
    '- `type=tone1` / `type=tone2` / `type=tone3` — square wave channels A/B/C (fixed 50% duty)',
    '',
    '**Common fields:**',
    '- `vol` — fixed amplitude 0 (silent) to 15 (loudest)',
    '- `vol_env` — **hardware** envelope on R11–R13 (global; one at a time)',
    '- `arp_env` / `pitch_env` — **software** macros (per channel, 60 Hz)',
    '- `tone` / `tone_mix` — R7 mixer routing (tone on/off, noise blend)',
    '- `noise_rate` — R6 noise period (0–31, global)',
    '- `noise_frames` / `tone_frames` / `tone_vol` — percussion transients',
    '- `env_bass` / `env_shape` — buzz bass (hardware envelope as oscillator)',
    '- `chipRegion` — `spectrum-128` or `cpc` platform clock',
  ].join('\n'),

  vol: [
    '**vol** — Fixed channel amplitude (0–15).',
    '',
    'Use when you do not need envelope shaping. For drum decay without touching',
    'the shared hardware envelope, combine fixed `vol` with `volSlide` on pattern notes.',
  ].join('\n'),

  type: [
    '**Channel type** — selects which AY-3-8912 tone/noise voice this instrument drives.',
    '```\ntype=<tone1|tone2|tone3>\n```',
    '- `tone1` — square wave, AY channel A (BeatBax channel 1)',
    '- `tone2` — square wave, AY channel B (BeatBax channel 2)',
    '- `tone3` — square wave, AY channel C (BeatBax channel 3)',
    '',
    'All tone channels output a fixed 50% duty square wave. Percussion uses `tone_mix=true`',
    'to blend the shared noise generator into a tone channel.',
    '',
    'Hover a type value (e.g. `tone1`) for channel-specific documentation.',
    '',
    'Example: `inst lead type=tone1 vol=12 arp_env=[0,4,7|0]`',
  ].join('\n'),

  tone1: [
    '**Tone 1** — AY-3-8912 square-wave channel A (BeatBax channel 1).',
    'Fixed 50% duty. No hardware duty or sweep.',
    '```\ninst lead type=tone1 vol=12 arp_env=[0,4,7|0] pitch_env=[0,-2,0]\n```',
    'Supported fields: `vol`, `vol_env`, `arp_env`, `pitch_env`, `tone`, `tone_mix`, `noise_rate`, …',
  ].join('\n'),

  tone2: [
    '**Tone 2** — AY-3-8912 square-wave channel B (BeatBax channel 2).',
    'Same capabilities as tone1.',
    '```\ninst harm type=tone2 vol=10 pitch_env=[0,2,0,-2,0]\n```',
  ].join('\n'),

  tone3: [
    '**Tone 3** — AY-3-8912 square-wave channel C (BeatBax channel 3).',
    'Same capabilities as tone1/tone2. Commonly used for bass and multiplexed percussion.',
    '```\ninst bass type=tone3 vol=14\ninst kick type=tone3 tone_mix=true noise_rate=4 note=C3\n```',
  ].join('\n'),

  tone: [
    '**tone** — Force the tone generator on or off (R7 mixer bit).',
    '',
    'Use `tone=true` with `tone_mix=true` for kick/snare (tone click + noise body).',
    'Use `tone=false` with `tone_mix=true` for noise-only percussion.',
  ].join('\n'),

  arp_env: [
    '**arp_env** — Software arpeggio macro (semitone offsets, ~60 Hz).',
    '',
    'Independent per channel — does not use R11–R13.',
    'Example: `arp_env=[0,4,7|0]`',
  ].join('\n'),

  pitch_env: [
    '**pitch_env** — Software pitch bend macro (semitone offsets, ~60 Hz).',
    '',
    'Knots are linearly interpolated over the held note. Independent per channel.',
    'Example: `pitch_env=[0,-2,0,2,0]`',
  ].join('\n'),

  tone_mix: [
    '**tone_mix** — Enable noise mixing for this channel (R7 mixer bit).',
    '',
    'When `true`, the channel\'s output includes the shared noise generator.',
    '⚠ The noise period (R6) is **global** — all channels share one noise timbre.',
    'Use the same `noise_rate` for all simultaneously active noise instruments.',
    '',
    '```bax\ninst perc type=tone3 vol=15 tone_mix=true noise_rate=10\n```',
  ].join('\n'),

  noise_rate: [
    '**noise_rate** — AY R6 noise period (0–31).',
    '',
    '⚠ **GLOBAL**: only one noise period is active per chip tick.',
    'If two active notes request different `noise_rate` values on the same tick,',
    'the last writer wins and a diagnostic warning is emitted.',
    '',
    'To avoid conflicts: use the same `noise_rate` for all percussion instruments,',
    'or stagger hits so only one noise instrument is active per tick.',
    '',
    'Range: 0 (fastest/brightest) – 31 (slowest/darkest).',
    'Kick attack: low values (2–4); body/sustain: higher values (8–24).',
  ].join('\n'),

  noise_frames: [
    '**noise_frames** — Limit noise mixing to the first N 60 Hz frames of each hit.',
    '',
    'Simulates turning off the R7 noise bit after the attack transient.',
    'Omit for noise on the whole note; use 1–3 for kick/snare click.',
    '',
    '```bax\ninst kick type=tone3 tone=true tone_mix=true noise_rate=4 noise_frames=3 note=C2\n```',
  ].join('\n'),

  tone_frames: [
    '**tone_frames** — Limit tone mixing to the first N 60 Hz frames of each hit.',
    '',
    'Use with `tone=true` for a short stick/beater click on snares or rims,',
    'while noise carries the body for the rest of the hit.',
    '',
    '```bax\ninst snare type=tone2 tone=true tone_mix=true noise_rate=6 tone_frames=1 tone_vol=4 note=E5\n```',
  ].join('\n'),

  tone_vol: [
    '**tone_vol** — Maximum volume for the tone path only (0–15).',
    '',
    'Use with `tone_frames` so a stick click sits under the noise body instead of dominating it.',
    'Noise still follows `vol` / `vol_env`.',
  ].join('\n'),

  vol_env: [
    '**vol_env** — Hardware envelope program on AY R11–R13.',
    '',
    '⚠ **GLOBAL**: The AY-3-8912 has **one** hardware envelope generator.',
    'Only one `vol_env` program may be active at a time across all channels.',
    '',
    'For independent per-channel volume shaping (e.g. drum decay),',
    'use the BeatBax `volSlide` effect instead.',
    '',
    '`env_bass` and `vol_env` are mutually exclusive — both program R11–R13.',
    '',
    'Example: `vol_env=[15,12,9,6,3,0]` (hardware decay envelope)',
  ].join('\n'),

  env_bass: [
    '**env_bass** — Buzz-bass mode: square tone × fast hardware sawtooth envelope (shape 8).',
    '',
    'When `true`, envelope period is short (~`N_tone / 2048`, shape 8 saw down repeat):',
    'many hardware envelope cycles per tone wave — gritty buzz, not slow tremolo.',
    '',
    'This produces a gritty buzzing bass — not a slow volume filter.',
    '⚠ Incompatible with `vol_env` on any other instrument (same R11–R13).',
    '',
    'Best suited for channel C (traditionally the bass voice in Spectrum music).',
    '',
    'Example: `inst bass type=tone3 env_bass=true`',
  ].join('\n'),

  env_shape: [
    '**env_shape** — R13 hardware envelope shape (0–15) for `env_bass=true` only.',
    '',
    'Default **8** — R13 bit pattern `1000`: saw down from 15→0, repeat (classic buzz bass).',
    '**10** — R13 bit pattern `1010`: two saw-down legs per cycle; sharper, more alternating buzz.',
    '',
    'Only one shape may be active at a time — overlapping `env_bass` voices must use the same value.',
    'Ignored unless `env_bass=true` (does not apply to `vol_env`).',
    '',
    'Example: `inst bass type=tone3 env_bass=true env_shape=10`',
  ].join('\n'),

  chipRegion: [
    '**chip cpc** — Amstrad CPC platform (1 MHz AY clock).',
    '',
    '| Chip directive | Machine | AY Clock |',
    '|-------|---------|----------|',
    '| `chip spectrum-128` (default) | ZX Spectrum 128 | 1,773,400 Hz |',
    '| `chip cpc` / `chip amstrad-cpc` | Amstrad CPC 464/6128 | 1,000,000 Hz |',
    '',
    'The platform only affects pitch resolution (tone period formula).',
    'Note content and macros are identical across profiles.',
    '',
    'Usage: `chip cpc`',
  ].join('\n'),
};

// —— Help sections ———————————————————————————————————————————————

const helpSections: ChipUIContributions['helpSections'] = [
  {
    id: 'instruments',
    title: 'Instruments (Spectrum 128 / AY-3-8912)',
    content: [
      {
        kind: 'text',
        text: 'The AY-3-8912 has 3 tone channels (A/B/C). Each BeatBax channel maps to a fixed instrument type. All three output a 50% square wave — there is no hardware duty control.',
      },
      {
        kind: 'snippet',
        label: 'Channel → instrument type',
        code: [
          '# Channel 1  →  type=tone1  (AY voice A)',
          '# Channel 2  →  type=tone2  (AY voice B)',
          '# Channel 3  →  type=tone3  (AY voice C)',
          '',
          'inst <name> type=<type> [field=value ...]',
        ].join('\n'),
      },
      {
        kind: 'snippet',
        label: 'Melodic tone channels (type=tone1 / tone2 / tone3)',
        code: [
          'inst lead type=tone1 vol=12 arp_env=[0,4,7|0]',
          'inst harm type=tone2 vol=10 pitch_env=[0,2,0,-2,0]',
          'inst bass type=tone3 vol=14',
          '# vol: 0 (silent) – 15 (loudest)',
          '# arp_env / pitch_env: software macros (~60 Hz), independent per channel',
        ].join('\n'),
      },
      {
        kind: 'snippet',
        label: 'Hardware envelope (vol_env) — one program for the whole chip',
        code: [
          'inst lead type=tone1 vol_env=[15,12,9,6,3,0]',
          '# ⚠ GLOBAL: only ONE vol_env may be active at a time (R11–R13)',
          '# For drum decay on other channels, use fixed vol + volSlide on notes instead',
        ].join('\n'),
      },
      {
        kind: 'snippet',
        label: 'Buzz bass (env_bass) — channel C sub oscillator',
        code: [
          'inst buzz type=tone3 env_bass=true',
          'inst alt  type=tone3 env_bass=true env_shape=10',
          '# env_bass uses the hardware envelope as a fast sub-oscillator',
          '# Cannot coexist with vol_env on any other instrument',
        ].join('\n'),
      },
      {
        kind: 'snippet',
        label: 'Noise percussion (tone_mix + noise_rate)',
        code: [
          'inst kick  type=tone3 vol=15 tone=true tone_mix=true noise_rate=4 noise_frames=3 note=C3',
          'inst snare type=tone2 vol=15 tone=true tone_mix=true noise_rate=6 tone_frames=1 tone_vol=4 note=E5',
          'inst hihat type=tone1 vol=15 tone_mix=true noise_rate=2',
          '# tone=true — mix square tone with noise (kick click + body)',
          '# tone_mix=true — route shared noise into this channel (R7)',
          '# noise_rate: 0–31 (GLOBAL — same value for overlapping hits)',
          '# noise_frames / tone_frames — limit mix to first N 60 Hz frames',
          '# tone_vol — cap tone path separately from noise (stick under snare body)',
        ].join('\n'),
      },
      {
        kind: 'snippet',
        label: 'Named hit tokens (note= default pitch)',
        code: [
          'inst kick type=tone3 vol=15 tone=true tone_mix=true noise_rate=4 note=C3',
          'pat drums = kick . kick .',
          '# Using the instrument name as a token triggers a hit at note= pitch',
        ].join('\n'),
      },
      {
        kind: 'snippet',
        label: 'Inline instrument switch in a pattern',
        code: [
          'pat riff = inst lead C5 E5 inst bass G3 .',
          '# Switches instrument for remaining notes in the pattern',
          '',
          'pat fill = C6 C6 inst(hat,2) C6 C6',
          '# inst(name,N) — temporary override for N steps, then reverts',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'chip-overview',
    title: 'ZX Spectrum 128 / AY-3-8912 Overview',
    content: [
      {
        kind: 'text' as const,
        text: [
          'The AY-3-8912 is a 3-voice PSG used in the ZX Spectrum 128 and Amstrad CPC.',
          '',
          '**3 tone channels (A/B/C)** → BeatBax `tone1`, `tone2`, `tone3`',
          '**1 shared noise generator** → R6 (5-bit period, global)',
          '**1 shared envelope generator** → R11–R13 (16 shapes, global)',
          '**Mixer (R7)** → per-channel tone/noise enable bits (independent)',
          '',
          '**Critical constraints:**',
          '- Noise period (R6): one value per tick for all channels',
          '- Envelope (R11–R13): one hardware envelope program at a time',
          '- Mixer (R7): independent per channel — mix tone+noise freely per voice',
        ].join('\n'),
      },
      {
        kind: 'snippet' as const,
        label: 'Basic Spectrum 128 song',
        code: [
          'chip spectrum-128',
          'bpm 120',
          '',
          'inst lead type=tone1 vol=12 arp_env=[0,4,7|0]',
          'inst bass type=tone2 vol=14',
          'inst pad  type=tone3 vol=10',
          '',
          'pat melody = C4 E4 G4 C5',
          'pat bass   = C2 . . .',
          '',
          'channel 1 => inst lead pat melody',
          'channel 2 => inst bass pat bass',
          'channel 3 => inst pad  pat melody',
          '',
          'play',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'ay-percussion',
    title: 'AY Percussion — Multiplexed Drums',
    content: [
      {
        kind: 'text' as const,
        text: [
          'The AY-3-8912 has **one noise generator**, not three.',
          'All channels with noise enabled share the same noise timbre (R6).',
          '',
          '**Working percussion patterns:**',
          '1. Stagger hits so only one drum is active per tick',
          '2. Use different `noise_rate` per drum when staggered (hat=2 bright, snare=8, kick=4 attack)',
          '3. Shape hits with `vol_env` decay — raw noise without it sounds flat',
          '4. **AY kick recipe:** C2–C3 body + `pitch_env` drop from above + bright `noise_rate` (2–4) for 1–3 frames via `noise_frames`, then tone-only sustain (C3 = punchier, C2 = subbier)',
          '5. Snare: noise body + `tone_frames=1` + low `tone_vol` (4–6) + mid `note` (E5) for stick under the noise',
          '6. **Closed hat:** `noise_rate=2–4`, fast `vol_env=[15,10,6,3,0]`; optional `tone_frames=1` + `tone_vol=2` + high `note` for tick',
          '7. **Open hat:** same `noise_rate`, slow tail `vol_env=[15,13,11,9,7,5,3,1,0]` (~9 frames)',
          '8. **Crash:** `noise_rate=1` (brightest), long 1-step `vol_env` fade (15+ frames), optional `tone_frames=2` ping; sustain with `_` after the token so the tail is not cut off by the next tick',
          '',
          '⚠ **Do not use different `noise_rate` values for simultaneous hits.**',
          'The last writer wins — other channels get the wrong timbre.',
        ].join('\n'),
      },
      {
        kind: 'song' as const,
        label: 'Single-channel named kit',
        code: [
          'chip spectrum-128',
          'bpm 128',
          '',
          'inst kick  type=tone3 vol=15 tone=true tone_mix=true noise_rate=4 noise_frames=3 note=C3 pitch_env=[+5,+2,0,-2,-4,-6] vol_env=[15,12,9,6,3,0]',
          'inst snare type=tone2 vol=15 tone=true tone_mix=true noise_rate=6 tone_frames=1 tone_vol=4 note=E5 vol_env=[15,12,9,6,4,2,0]',
          'inst hatc  type=tone1 vol=15 tone=true tone_mix=true noise_rate=2 tone_frames=1 tone_vol=2 note=E7 vol_env=[15,10,6,3,0]',
          'inst hato  type=tone1 vol=15 tone_mix=true noise_rate=2 vol_env=[15,13,11,9,7,5,3,1,0]',
          'inst crash type=tone3 vol=15 tone=true tone_mix=true noise_rate=1 tone_frames=2 tone_vol=4 note=E7 vol_env=[15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0]',
          '',
          '; Named tokens select the instrument — one channel, full kit',
          'pat kit = kick . hatc . snare . hato kick . hatc snare .',
          '',
          'channel 3 => inst kick pat kit',
          '',
          'play',
        ].join('\n'),
      },
    ],
  },
  {
    id: 'ay-envelope',
    title: 'AY Hardware Envelope & Buzz Bass',
    content: [
      {
        kind: 'text' as const,
        text: [
          'The AY chip has **one hardware envelope generator** (R11–R13) shared across all channels.',
          '',
          '**vol_env** routes a channel through the hardware envelope level each tick.',
          'Only ONE `vol_env` program may be active at a time.',
          '',
          '**env_bass** (buzz bass) uses the envelope generator as a sub-oscillator:',
          '- Envelope period is calculated from the note frequency',
          '- Produces a distinctive buzzing bass tone',
          '- Cannot coexist with `vol_env` on any other channel',
          '',
          'For independent volume shaping on multiple channels, use the',
          'BeatBax `volSlide` effect — it is software-driven and does not conflict.',
        ].join('\n'),
      },
      {
        kind: 'snippet' as const,
        label: 'Buzz bass on channel C',
        code: [
          'inst lead type=tone1 vol=12',
          'inst harm type=tone2 vol=10',
          'inst bass type=tone3 env_bass=true  ; buzz bass — no vol_env elsewhere',
        ].join('\n'),
      },
    ],
  },
];

function helpPlatformLabel(ctx: ChipHelpContext): string {
  return resolvePlatformRegionFromSong(ctx) === 'cpc'
    ? 'Amstrad CPC / AY-3-8912'
    : 'ZX Spectrum 128 / AY-3-8912';
}

export function buildSpectrumHelpSections(ctx: ChipHelpContext): ChipUIContributions['helpSections'] {
  const platform = helpPlatformLabel(ctx);
  return helpSections.map((section) =>
    section.id === 'instruments'
      ? { ...section, title: `Instruments (${platform})` }
      : section,
  );
}

// —— Export ───────────────────────────────────────────────────────

export const spectrumUIContributions: ChipUIContributions = {
  copilotSystemPrompt,
  hoverDocs,
  helpSections,
  buildHelpSections: buildSpectrumHelpSections,
};
