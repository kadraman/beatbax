/**
 * BeatBax web-UI contributions for the SMS (SN76489) chip plugin.
 *
 * Provides:
 *  - copilotSystemPrompt  — hardware reference injected into the AI system prompt
 *  - hoverDocs            — keyword hover docs for SMS-specific syntax
 *  - helpSections         — help-panel sections tailored to SMS authoring
 */
import type { ChipUIContributions } from '@beatbax/engine';

export const CHIP_IMAGE_BASE64 =
'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';
// —— CoPilot system prompt ———————————————————————————————————————

const copilotSystemPrompt = `
══ SEGA MASTER SYSTEM / GAME GEAR (SN76489) HARDWARE — READ FIRST ══
Exactly 4 channels. Each channel number (1-4) must appear AT MOST ONCE per song.
Channel-to-type mapping is FIXED — you cannot swap these:
  channel 1 → type=tone1   (melodic) — square wave, 10-bit period
  channel 2 → type=tone2   (melodic) — square wave, 10-bit period
  channel 3 → type=tone3   (melodic) — square wave, 10-bit period
  channel 4 → type=noise    (drums/percussion) — 15-bit LFSR noise
NEVER write two "channel <number> =>" lines for the same channel.
Use channels 1-4 only (SMS has exactly 4 channels).
SMS spacing (NTSC): 3,579,545 Hz clock. PAL: 3,546,895 Hz.

INSTRUMENTS  (inst <name> type=<type> [field=value ...])

  type=tone1 | type=tone2 | type=tone3  (channels 1, 2, 3)
    Fixed 50% duty square wave — NO hardware duty control.
    Supports: vol, vol_env, arp_env, pitch_env
    vol / vol_env use ATTENUATION semantics: 0 = loudest, 15 = silent
    ALL effects are implemented in software via per-tick register writes.
    Example: inst lead type=tone1 vol=10 vol_env=[0,3,6,9,12,15] pitch_env=[0,-1,-2]

  type=noise  (channel 4)
    LFSR noise generator with two modes:
      noise_mode=white    — full white noise (long period)
      noise_mode=periodic — metallic/tonal noise (short 93-sample period)
    noise_rate=0|1|2|tone3 — clock rate selector:
      0 = highest frequency (divide by 128)
      1 = medium frequency (divide by 256)
      2 = lowest frequency (divide by 512)
      tone3 = use Tone 3's period value (syncs noise pitch to Tone 3)
    noise_rate_env=[0,1,2|0] — animate noise rate for sweep effects
    vol / vol_env — same attenuation semantics as tone channels (0 loudest, 15 silent)
    Example: inst kick  type=noise noise_mode=white noise_rate=2 vol_env=[0,4,8,12,15]
             inst hat   type=noise noise_mode=white noise_rate=0 vol_env=[2,8,12,15]
             inst snare type=noise noise_mode=periodic noise_rate=1 vol=10

  Game Gear Stereo Routing (Optional):
    gg:pan=L|C|R — discrete Game Gear stereo routing
      L = Left channel only
      C = Center (both channels)
      R = Right channel only
    On SMS (mono), pan is ignored. On Game Gear, it routes to the specified side.
    Example: inst lead type=tone1 vol=10 gg:pan=R

SMS CHIPS PECULIARITIES
  1. NO hardware envelopes — volume changes are software-driven via vol_env macros.
  2. NO hardware sweep — use pitch_env or bend for pitch sweep effects.
  3. NO duty control — 50% square wave only.
  4. NO echo/delay — only 4 channels, no room for effects.
  5. 4-bit attenuation volume — 16 discrete levels (0-15), where 0=loudest and 15=silent.
  6. Noise and Tone 3 can be synced: noise_rate=tone3 makes noise follow Tone 3's pitch.
  7. On Game Gear: add gg:pan=L/C/R for stereo instrument placement.
  8. For volSlide, positive delta means louder (fade-in), negative means quieter (fade-out).

SMS CHIPTUNE STYLE GUIDE
  1. Use Tone channels for melody, harmony, and bass.
     Arpeggios work great: arp_env=[0,4,7|0] for major chord.
  2. All tone channels are equivalent — assign based on your mental model.
     Common: Tone1=lead, Tone2=harmony, Tone3=bass.
  3. Noise channel for percussion: tune noise_rate carefully.
     noise_rate=2 (default) ≈ mid tom range
     noise_rate=0 ≈ hi-hat / very high
     noise_rate=1 ≈ snare range
     Use white noise_mode for drums, periodic for special FX.
    4. Use vol_env for all dynamics — it's the only way to shape volume on SMS.
      vol_env=[0,3,6,9,12,15] = fast decay
      vol_env=[6,6,6,6|0] = sustain with loop
  5. pitch_env and arp_env are your friends for expressiveness.
     The SN76489 has no hardware LFO — everything is software-driven.
  6. Game Gear stereo: pan your instruments left/right for a wider soundstage.
     Good defaults: lead=R, bass=C, harmony=L, noise=C.
  7. Tone3 + Noise sync: use noise_rate=tone3 to make kick drums follow bass notes.
`.trim();

// —— Hover docs ———————————————————————————————————————————————

const hoverDocs: Record<string, string> = {
  inst: [
    '**Instrument definition** — declares a named instrument with channel type and parameters.',
    '```\ninst <name> type=<type> [field=value ...]\n```',
    '**Common fields (all chips):**',
    '- `note` — default note when instrument name is used as a hit token, e.g. `note=C2`',
    '- `gm` — General MIDI program number for MIDI export (0-127)',
    '',
    '**SMS instrument types:**',
    '- `type=tone1` / `type=tone2` / `type=tone3` — square wave channels (0-15 attenuation, vol_env macro, arp_env, pitch_env)',
    '- `type=noise` — LFSR noise generator (noise_mode, noise_rate, noise_rate_env, vol, vol_env)',
    '',
    'Example: `inst lead type=tone1 vol=10 vol_env=[0,3,6,9,12,15]`',
  ].join('\n\n'),

  sms: [
    '**Sega Master System (SMS)** — SN76489 PSG sound chip.',
    '',
    '4 channels total:',
    '- **Tone 1, 2, 3**: Square wave oscillators (50% duty, 10-bit period registers)',
    '- **Noise**: 15-bit LFSR noise generator',
    '',
    'Hardware characteristics:',
    '- No hardware envelopes (all volume changes are software-controlled)',
    '- No hardware LFO or sweep',
    '- No duty control (fixed 50% square wave)',
    '- 4-bit volume attenuation (0 = loudest, 15 = silent)',
    '',
    'Use `chip sms` to target this backend. Game Gear is architecturally identical but adds stereo routing via `gg:pan`.',
  ].join('\n\n'),

  tone1: [
    '**Tone 1** — SMS SN76489 square-wave oscillator (channel 1).',
    'Fixed 50% duty square wave. All articulation is software-driven.',
    '```\ninst lead type=tone1 vol=10 vol_env=[0,3,6,9,12,15] pitch_env=[0,-1,-2,0]\n```',
    'Supported fields:',
    '- `vol` — constant volume 0-15 (0 = loudest)',
    '- `vol_env` — volume envelope macro: `[level1,level2,...|loop]`',
    '- `arp_env` — arpeggio macro: semitone offsets per frame',
    '- `pitch_env` — pitch bend macro: semitone offsets per frame',
    '- `gg:pan` — Game Gear stereo: L / C / R (or `gg_pan` without colon)',
    '',
    '_Tip: arp_env is essential for chord simulation on SMS._',
  ].join('\n\n'),

  tone2: [
    '**Tone 2** — SMS SN76489 square-wave oscillator (channel 2).',
    'Same capabilities as Tone 1. Occupies channel 2.',
    '```\ninst harm type=tone2 vol=8 arp_env=[0,4,7|0]\n```',
    'Supported fields: same as tone1',
  ].join('\n\n'),

  tone3: [
    '**Tone 3** — SMS SN76489 square-wave oscillator (channel 3).',
    'Same capabilities as Tone 1/2. Occupies channel 3.',
    '```\ninst bass type=tone3 vol=12 pitch_env=[0,-12]\n```',
    'Supported fields: same as tone1',
    '',
    '_Note: Noise channel can sync its clock to Tone 3 by using noise_rate=tone3._',
  ].join('\n\n'),

  noise: [
    '**Noise** — SMS SN76489 LFSR noise generator (channel 4).',
    '```\ninst kick  type=noise noise_mode=white noise_rate=2 vol_env=[0,6,11,15]\ninst snare type=noise noise_mode=white noise_rate=1 vol=10 noise_rate_env=[0,1,2|0]\n```',
    'Fields:',
    '- `noise_mode` — `white` (full noise) \u00b7 `periodic` (metallic/tonal)',
    '- `noise_rate` — 0-2 or `tone3`',
    '  - `0` = highest freq (divide clock by 128)',
    '  - `1` = medium freq (divide clock by 256)',
    '  - `2` = lowest freq (divide clock by 512)',
    '  - `tone3` = use Tone 3\'s current period value',
    '- `noise_rate_env` — animate noise_rate per frame for sweep effects',
    '- `vol` — constant volume 0-15',
    '- `vol_env` — volume envelope macro',
    '- `gg:pan` — Game Gear stereo routing (or `gg_pan` without colon)',
    '',
    '_Tip: Use noise_rate=2 for kicks, noise_rate=1 for snares, noise_rate=0 for hi-hats._',
  ].join('\n\n'),

  'gg:pan': [
    '**Game Gear stereo routing** — discrete L/C/R panning per channel.',
    '```\ninst lead type=tone1 vol=10 gg:pan=R  ; or gg_pan=R\ninst bass type=tone3 vol=12 gg:pan=C  ; or gg_pan=C\n```',
    'Values:',
    '- `L` or `left` — Left channel only',
    '- `C` or `center` — Both channels (mono on SMS)',
    '- `R` or `right` — Right channel only',
    '',
    '_On SMS (mono hardware), pan settings are ignored. On Game Gear, they route to the appropriate output._',
    '_Note: Both `gg:pan` (with colon) and `gg_pan` (without colon) formats are supported._',
  ].join('\n\n'),

  vol_env: [
    '**Volume envelope macro** — per-frame volume automation.',
    '```\nvol_env=[0,3,6,9,12,15]      # decay, no loop\nvol_env=[5,5,5,5|0]         # sustain with loop from index 0\nvol_env=[15,10,6,3,0]       # attack (quieter to louder)\n```',
    'Values are volume levels 0-15 where **0 = loudest** and **15 = silent** (SMS uses attenuation: 0=full, 15=mute).',
    '',
    'Loop syntax: add `|N` after the last value to loop from index N.',
    'If omitted, the macro plays once and holds the last value.',
  ].join('\n\n'),

  arp_env: [
    '**Arpeggio macro** — per-frame semitone offset from the root note.',
    '```\narp_env=[0,4,7|0]   # major triad: root, major 3rd, perfect 5th\narp_env=[0,3,7|0]   # minor triad\narp_env=[0,7]       # octave jump\n```',
    'Values are semitone offsets from the note root. Positive = up, negative = down.',
    '',
    '_Essential for chord simulation on SMS which has only 3 tone channels._',
  ].join('\n\n'),

  pitch_env: [
    '**Pitch envelope macro** — per-frame pitch bend in semitones.',
    '```\npitch_env=[0,-1,-2,0]    # quick down/up bend\npitch_env=[0,1,0|0]      # vibrato-style oscillation\n```',
    'Values are absolute semitone offsets from the note root.',
    'Use for pitch slides, vibrato emulation, or bend effects.',
  ].join('\n\n'),

  noise_mode: [
    '**Noise mode** — selects the LFSR feedback Tap.',
    '```\nnoise_mode=white    # full white noise (32767-sample period)\nnoise_mode=periodic # metallic/tonal noise (93-sample period)\n```',
    '- `white` — feedback from bits 0 and 1; full-bandwidth noise',
    '- `periodic` — feedback from bits 0 and 6; short period, more tonal/"metallic" character',
  ].join('\n\n'),

  noise_rate: [
    '**Noise rate** — LFSR clock divisor selector.',
    '```\nnoise_rate=0    # highest frequency (divide by 128)\nnoise_rate=1    # medium frequency (divide by 256)\nnoise_rate=2    # lowest frequency (divide by 512)\nnoise_rate=tone3 # sync to Tone 3\'s period\n```',
    'Higher divisor = slower LFSR clock = lower pitch.',
    '',
    '_Tip: noise_rate=0 is great for hi-hats, noise_rate=2 for punchy kicks._',
  ].join('\n\n'),

  noise_rate_env: [
    '**Noise rate envelope** — animate noise_rate per frame for sweep effects.\n    **SMS-specific.**',
    '```\nnoise_rate_env=[2,1,0]     # descending sweep\nnoise_rate_env=[0,1,2|0]   # cycling sweep\n```',
    'Values are noise_rate indices 0-3 (where 3 = tone3).',
    'Creates animated percussion timbres and tuned-noise sweep effects.',
  ].join('\n\n'),

  // Unsupported fields (for error messages)
  sweep: [
    '**\u274C NOT SUPPORTED ON SMS**',
    'Hardware pitch sweep is a Game Boy NR10 feature.',
    'On SMS, use `pitch_env` or `bend` for equivalent pitch-ramp effects.',
  ].join('\n\n'),

  duty: [
    '**\u274C NOT SUPPORTED ON SMS**',
    'Duty cycle control is not available on SN76489.',
    'The SMS produces a fixed 50% duty square wave with no hardware duty modulation.',
  ].join('\n\n'),

  echo: [
    '**\u274C NOT SUPPORTED ON SMS**',
    'Echo/delay requires spare channels.',
    'The SN76489 has only 4 channels total with no delay buffer or extra voices.',
  ].join('\n\n'),
};

// —— Help sections ———————————————————————————————————————————

const helpSections: ChipUIContributions['helpSections'] = [
  {
    id: 'instruments',
    title: 'Instruments (SMS / Game Gear)',
    content: [
      { kind: 'text', text: 'The Sega Master System SN76489 PSG has 4 channels. Each requires a matching instrument type.' },
      {
        kind: 'snippet',
        label: 'Tone channels (type=tone1 / tone2 / tone3)',
        code: `inst lead  type=tone1 vol=10 vol_env=[0,3,6,9,12,15]\ninst harm  type=tone2 vol=8 vol_env=[4,6,8,10|0]\n# All tone channels are functionally identical: square wave, 10-bit period`,
      },
      {
        kind: 'snippet',
        label: 'Noise channel (type=noise)',
        code: `inst kick  type=noise noise_mode=white noise_rate=2 vol_env=[0,4,8,12,15]\ninst snare type=noise noise_mode=white noise_rate=1 vol=10\ninst hihat type=noise noise_mode=white noise_rate=0 vol=8\n# noise_rate: 0=high/hihat, 1=mid/snare, 2=low/kick`,
      },
      {
        kind: 'snippet',
        label: 'Pan definitions (type=tone or noise)',
        code: `inst lead type=tone1 vol=10 gg:pan=R\ninst bass type=tone3 vol=12 gg:pan=C\n# gg:pan=L|C|R; ignored on SMS mono hardware, used on Game Gear`,
      },
    ],
  },
  {
    id: 'examples',
    title: 'Examples — Click to Insert (SMS)',
    content: [
      {
        kind: 'song',
        label: 'Minimal SMS song',
        code: `chip sms\n\n` +
          `bpm 150\n` +
          `time 4\n\n` +
          `inst lead type=tone1 vol=12 vol_env=[0,3,6,9,12,15]\n\n` +
          `pat melody = C5 E5 G5 C6\n\n` +
          `seq main = melody melody melody melody\n\n` +
          `channel 1 => inst lead seq main\n\n` +
          `play`,
      },
      {
        kind: 'song',
        label: '4-channel SMS chiptune',
        code: `chip sms\n\n` +
          `bpm 154\n` +
          `time 4\n\n` +
          `inst lead  type=tone1   vol=8  vol_env=[3,5,7,9|0]\n` +
          `inst harm  type=tone2   vol=6  vol_env=[4,6,8,10|0]\n` +
          `inst bass  type=tone3   vol=10 vol_env=[2,4,6,8|0]\n` +
          `inst kick  type=noise   noise_mode=white noise_rate=2 vol_env=[0,4,8,12,15]\n` +
          `inst hat   type=noise   noise_mode=white noise_rate=0 vol=6\n\n` +
          `pat melody  = C5:2 E5:2 G5:2 C6:2 C5:2 E5:2 G5:2 A5:2\n` +
          `pat counter  = C4 . G4 . A4 . F4 .\n` +
          `pat bassline = C3:4 G2:4 A2:4 F2:4\n` +
          `pat drums    = kick . hat . kick kick hat kick .\n\n` +
          `seq main   = melody melody melody melody\n` +
          `seq harm   = counter counter counter counter\n` +
          `seq bass   = bassline bassline\n` +
          `seq perc   = drums drums drums drums\n\n` +
          `channel 1 => inst lead  seq main\n` +
          `channel 2 => inst harm  seq harm\n` +
          `channel 3 => inst bass  seq bass\n` +
          `channel 4 => inst kick  seq perc\n\n` +
          `play`,
      },
      {
        kind: 'song',
        label: 'SMS arpeggio chords',
        code: `chip sms\n\n` +
          `bpm 180\n\n` +
          `inst lead type=tone1 vol=10 vol_env=[4,4,4,4|0]\n` +
          `inst harm type=tone2 vol=8 vol_env=[6,6,6,6|0]\n\n` +
          `pat arps = C5<arp:4,7>:4 F5<arp:4,7>:4 G5<arp:4,7>:4 A5<arp:3,7>:4\n\n` +
          `seq run = arps arps\n\n` +
          `channel 1 => inst lead seq run\n` +
          `channel 2 => inst harm seq run:oct(-1)\n\n` +
          `play`,
      },
      {
        kind: 'song',
        label: 'Synced Tone3 + Noise (kick that follows bass)',
        code: `chip sms\n\n` +
          `bpm 120\n\n` +
          `inst bass type=tone3 vol=12 vol_env=[2,5,8,11,15]\n` +
          `inst kick type=noise noise_mode=white noise_rate=tone3 vol_env=[0,6,10,15]\n\n` +
          `pat bass_pat = C3:8 G2:8 A2:8 F2:8\n` +
          `pat kick_pat = kick . kick . kick . kick .\n\n` +
          `seq bass = bass_pat\n` +
          `seq drums = kick_pat\n\n` +
          `channel 3 => inst bass seq bass\n` +
          `channel 4 => inst kick seq drums\n\n` +
          `play`,
      },
      {
        kind: 'song',
        label: 'Game Gear stereo panning',
        code: `chip sms\n\n` +
          `bpm 140\n\n` +
          `inst lead  type=tone1 vol=10 gg:pan=R\n` +
          `inst harm  type=tone2 vol=8  gg:pan=L\n` +
          `inst bass  type=tone3 vol=12 gg:pan=C\n` +
          `inst kick  type=noise vol=10 gg:pan=C\n\n` +
          `pat melody = C5:4 E5:4 G5:4 A5:4\n` +
          `pat bassline = C3:4 G2:4\n` +
          `pat drums = kick . . .\n\n` +
          `seq main = melody melody\n` +
          `seq bass_seq = bassline bassline\n` +
          `seq drum_seq = drums drums drums drums\n\n` +
          `channel 1 => inst lead  seq main\n` +
          `channel 2 => inst harm  seq main\n` +
          `channel 3 => inst bass  seq bass_seq\n` +
          `channel 4 => inst kick  seq drum_seq\n\n` +
          `play`,
      },
    ],
  },
];

// —— Export ———————————————————————————————————————————————————

export const smsUIContributions: ChipUIContributions = {
  copilotSystemPrompt,
  hoverDocs,
  helpSections,
};
