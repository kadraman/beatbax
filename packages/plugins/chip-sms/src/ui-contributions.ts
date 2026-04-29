/**
 * BeatBax web-UI contributions for the SMS (SN76489) chip plugin.
 *
 * Provides:
 *  - copilotSystemPrompt  — hardware reference injected into the AI system prompt
 *  - hoverDocs            — keyword hover docs for SMS-specific syntax
 *  - helpSections         — help-panel sections tailored to SMS authoring
 */
import type { ChipUIContributions } from '@beatbax/engine';

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
    Price vol: 0-15 (0 = loudest/m sum, 15 = silent)
    ALL effects are implemented in software via per-tick register writes.
    Example: inst lead type=tone1 vol=10 vol_env=[15,12,9,6,3,0] pitch_env=[0,-1,-2]

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
    vol / vol_env — volume as for tone channels
    Example: inst kick  type=noise noise_mode=white noise_rate=2 vol_env=[15,12,9,6,3,0]
             inst hat   type=noise noise_mode=white noise_rate=0 vol_env=[8,5,3,0]
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
  5. 4-bit attenuation volume — 16 discrete levels (0-15).
  6. Noise and Tone 3 can be synced: noise_rate=tone3 makes noise follow Tone 3's pitch.
  7. On Game Gear: add gg:pan=L/C/R for stereo instrument placement.

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
     vol_env=[15,12,9,6,3,0] = fast decay
     vol_env=[15,15,15,15|0] = sustain with loop
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
    '- `type=tone1` / `type=tone2` / `type=tone3` — square wave channels (0-15 volume, vol_env macro, arp_env, pitch_env)',
    '- `type=noise` — LFSR noise generator (noise_mode, noise_rate, noise_rate_env, vol, vol_env)',
    '',
    'Example: `inst lead type=tone1 vol=10 vol_env=[15,12,9,6,3,0]`',
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
    '```\ninst lead type=tone1 vol=10 vol_env=[15,12,9,6,3,0] pitch_env=[0,-1,-2,0]\n```',
    'Supported fields:',
    '- `vol` — constant volume 0-15 (0 = loudest)',
    '- `vol_env` — volume envelope macro: `[level1,level2,...|loop]`',
    '- `arp_env` — arpeggio macro: semitone offsets per frame',
    '- `pitch_env` — pitch bend macro: semitone offsets per frame',
    '- `gg:pan` — Game Gear stereo: L / C / R',
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
    '```\ninst kick  type=noise noise_mode=white noise_rate=2 vol_env=[15,8,3,0]\ninst snare type=noise noise_mode=white noise_rate=1 vol=10 noise_rate_env=[0,1,2|0]\n```',
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
    '- `gg:pan` — Game Gear stereo routing',
    '',
    '_Tip: Use noise_rate=2 for kicks, noise_rate=1 for snares, noise_rate=0 for hi-hats._',
  ].join('\n\n'),

  'gg:pan': [
    '**Game Gear stereo routing** — discrete L/C/R panning per channel.',
    '```\ninst lead type=tone1 vol=10 gg:pan=R\ninst bass type=tone3 vol=12 gg:pan=C\n```',
    'Values:',
    '- `L` or `left` — Left channel only',
    '- `C` or `center` — Both channels (mono on SMS)',
    '- `R` or `right` — Right channel only',
    '',
    '_On SMS (mono hardware), pan settings are ignored. On Game Gear, they route to the appropriate output._',
  ].join('\n\n'),

  vol_env: [
    '**Volume envelope macro** — per-frame volume automation.',
    '```\nvol_env=[15,12,9,6,3,0]        # decay, no loop\nvol_env=[15,14,13,12|12]     # sustain with loop from index 12\nvol_env=[8,12,15|0]         # attack (loop from start)\n```',
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
        code: `inst lead  type=tone1 vol=10 vol_env=[15,12,9,6,3,0]\ninst harm  type=tone2 vol=8 vol_env=[12,10,8,6|7]\n# All tone channels are functionally identical: square wave, 10-bit period`,
      },
      {
        kind: 'snippet',
        label: 'Noise channel (type=noise)',
        code: `inst kick  type=noise noise_mode=white noise_rate=2 vol_env=[15,12,9,6,3,0]\ninst snare type=noise noise_mode=white noise_rate=1 vol=10\ninst hihat type=noise noise_mode=white noise_rate=0 vol=8\n# noise_rate: 0=high/hihat, 1=mid/snare, 2=low/kick`,
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
        kind: 'snippet',
        label: 'Minimal SMS song',
        code: `chip sms\n\n` +
          `bpm 150\n` +
          `time 4\n\n` +
          `inst lead type=tone1 vol=12 vol_env=[15,12,9,6,3,0]\n\n` +
          `pat melody = C5 E5 G5 C6\n\n` +
          `seq main = melody melody melody melody\n\n` +
          `channel 1 => inst lead seq main\n\n` +
          `play`,
      },
      {
        kind: 'snippet',
        label: '4-channel SMS chiptune',
        code: `chip sms\n\n` +
          `bpm 154\n` +
          `time 4\n\n` +
          `inst lead  type=tone1   vol=8  vol_env=[15,12,10,8|7]\n` +
          `inst harm  type=tone2   vol=6  vol_env=[12,10,8,6|6]\n` +
          `inst bass  type=tone3   vol=10 vol_env=[15,13,11,9|8]\n` +
          `inst kick  type=noise   noise_mode=white noise_rate=2 vol_env=[15,12,8,4,0]\n` +
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
        kind: 'snippet',
        label: 'SMS arpeggio chords',
        code: `chip sms\n\n` +
          `bpm 180\n\n` +
          `inst lead type=tone1 vol=10 vol_env=[15,flat]\n` +
          `inst harm type=tone2 vol=8 vol_env=[12,flat]\n\n` +
          `pat arps = C5<arp:4,7>:4 F5<arp:4,7>:4 G5<arp:4,7>:4 A5<arp:3,7>:4\n\n` +
          `seq run = arps arps\n\n` +
          `channel 1 => inst lead seq run\n` +
          `channel 2 => inst harm seq run:oct(-1)\n\n` +
          `play`,
      },
      {
        kind: 'snippet',
        label: 'Synced Tone3 + Noise (kick that follows bass)',
        code: `chip sms\n\n` +
          `bpm 120\n\n` +
          `inst bass type=tone3 vol=12 vol_env=[15,12,9,6,3,0]\n` +
          `inst kick type=noise noise_mode=white noise_rate=tone3 vol_env=[15,10,5,0]\n\n` +
          `pat bass_pat = C3:8 G2:8 A2:8 F2:8\n` +
          `pat kick_pat = kick . kick . kick . kick .\n\n` +
          `seq bass = bass_pat\n` +
          `seq drums = kick_pat\n\n` +
          `channel 3 => inst bass seq bass\n` +
          `channel 4 => inst kick seq drums\n\n` +
          `play`,
      },
      {
        kind: 'snippet',
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
