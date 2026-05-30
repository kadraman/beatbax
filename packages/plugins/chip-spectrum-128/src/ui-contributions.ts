/**
 * BeatBax web-UI contributions for the ZX Spectrum 128 / AY-3-8912 chip plugin.
 *
 * Provides:
 *  - copilotSystemPrompt  — hardware reference injected into the AI system prompt
 *  - hoverDocs            — keyword hover docs for Spectrum 128-specific syntax
 *  - helpSections         — help-panel sections tailored to Spectrum/AY authoring
 */
import type { ChipUIContributions } from '@beatbax/engine';

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
  Amstrad CPC (chipRegion=cpc): AY clock = 1,000,000 Hz, 50 Hz PAL tick.
  Note: 3.5469 MHz is the Spectrum 128 CPU clock — DO NOT use it for period tables.
  Tone period: N = floor(f_clock / (16 × f_tone)),  clamped to 1–4095.

INSTRUMENTS  (inst <name> type=<type> [field=value ...])

  type=tone1 | type=tone2 | type=tone3  (channels 1, 2, 3)
    Fixed 50% duty square wave — NO hardware duty control.
    vol        — Fixed amplitude, 0 (silent) – 15 (loudest).
    vol_env    — HARDWARE envelope program on R11–R13.
                 ⚠ GLOBAL: only ONE vol_env may be active at a time across all channels.
                 For per-channel volume shaping use BeatBax volSlide effect instead.
    arp_env    — Arpeggio in semitone offsets (software, 50 Hz step).
    pitch_env  — Pitch bend in semitone offsets (software, 50 Hz step).
    tone_mix   — true = include noise in this channel's output (R7 mixer bit).
    noise_rate — R6 value (0–31). GLOBAL — last writer per tick wins.
                 ⚠ CONFLICT: all simultaneously active noise instruments MUST use the same noise_rate.
    env_bass   — true = buzz-bass mode; uses hardware envelope as oscillator.
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
  6. Use chipRegion=cpc to switch to Amstrad CPC 1 MHz clock with identical notation.
`.trim();

// —— Hover docs ———————————————————————————————————————————————

const hoverDocs: Record<string, string> = {
  inst: [
    '**Instrument definition** — declares a named instrument.',
    '```\ninst <name> type=<type> [field=value ...]\n```',
    '**Spectrum 128 / AY-3-8912 instrument types:**',
    '- `type=tone1` / `type=tone2` / `type=tone3` — square wave channels A/B/C',
    '',
    '**Common fields:**',
    '- `vol` — fixed amplitude 0 (silent) to 15 (loudest)',
    '- `vol_env` — hardware envelope (global; one at a time)',
    '- `arp_env` — arpeggio in semitone offsets',
    '- `pitch_env` — pitch bend in semitone offsets',
    '- `tone_mix` — enable noise mixing for this channel',
    '- `noise_rate` — R6 noise period (0–31, global)',
    '- `env_bass` — buzz bass (envelope as oscillator)',
    '- `chipRegion` — `spectrum-128` (default) or `cpc`',
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
    'Range: 0 (fastest) – 31 (slowest).',
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
    '**env_bass** — Buzz-bass mode: uses the hardware envelope as an oscillator.',
    '',
    'When `true`, the envelope period is derived from the note frequency:',
    '`N_env = floor(f_clock / (256 × f_note))`',
    '',
    'This produces a characteristic buzzing bass tone.',
    '⚠ Incompatible with `vol_env` on any other instrument (same R11–R13).',
    '',
    'Best suited for channel C (traditionally the bass voice in Spectrum music).',
    '',
    'Example: `inst bass type=tone3 env_bass=true`',
  ].join('\n'),

  chipRegion: [
    '**chipRegion** — Platform region / AY clock preset.',
    '',
    '| Value | Machine | AY Clock |',
    '|-------|---------|----------|',
    '| `spectrum-128` (default) | ZX Spectrum 128 | 1,773,400 Hz |',
    '| `cpc` | Amstrad CPC 464/6128 | 1,000,000 Hz |',
    '',
    'The region only affects pitch resolution (tone period formula).',
    'Note content and macros are identical across regions.',
    '',
    'Usage: `chipRegion cpc`',
  ].join('\n'),
};

// —— Help sections ———————————————————————————————————————————————

const helpSections = [
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
          '1. All drums use the same `noise_rate` — stagger hits to avoid overlap',
          '2. Tone kick on A + noise snare/hat on B or C',
          '3. Borrow channel C between bass and percussion',
          '',
          '⚠ **Do not use different `noise_rate` values for simultaneous hits.**',
          'The last writer wins — other channels get the wrong timbre.',
        ].join('\n'),
      },
      {
        kind: 'song' as const,
        label: 'Multiplexed drum kit (correct)',
        code: [
          'chip spectrum-128',
          'bpm 120',
          '',
          '; Same noise_rate for all percussion — stagger hits',
          'inst kick  type=tone3 vol=15 tone_mix=true noise_rate=10',
          'inst snare type=tone2 vol=14 tone_mix=true noise_rate=10',
          'inst hat   type=tone1 vol=10 tone_mix=true noise_rate=10',
          '',
          'pat kick  = C2 . . . . . . .',
          'pat snare = . . . D3 . . . .',
          'pat hat   = . F4 . . F4 . . F4',
          '',
          'channel 1 => inst hat  pat hat',
          'channel 2 => inst snare pat snare',
          'channel 3 => inst kick  pat kick',
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

// —— Export ───────────────────────────────────────────────────────

export const spectrumUIContributions: ChipUIContributions = {
  copilotSystemPrompt,
  hoverDocs,
  helpSections,
};
