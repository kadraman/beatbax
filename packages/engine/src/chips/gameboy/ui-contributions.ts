/**
 * BeatBax web-UI contributions for the built-in Game Boy (DMG-01) chip.
 *
 * Provides:
 *  - copilotSystemPrompt  — hardware reference injected into the AI system prompt
 *  - hoverDocs            — keyword hover docs for GB-specific syntax
 *  - helpSections         — help-panel Instruments and Examples sections
 */
import type { ChipUIContributions } from '../types.js';

// ─── CoPilot system prompt ────────────────────────────────────────────────────

export const HARDWARE_GAMEBOY = `
══ GAME BOY HARDWARE — READ FIRST ══
Exactly 4 channels. Each channel number (1–4) must appear AT MOST ONCE per song.
Channel-to-type mapping is FIXED — you cannot swap these:
  channel 1 → type=pulse1   (melodic) — typically: lead melody
  channel 2 → type=pulse2   (melodic) — typically: harmony, counter-melody, or bass
  channel 3 → type=wave     (wavetable, no envelope volume) — typically: bass or accompaniment
  channel 4 → type=noise    (drums/percussion) — typically: kick, snare, hi-hat
NEVER write two "channel <number> =>" lines. NEVER define instruments inside pat bodies.

INSTRUMENTS  (inst <name> <fields>)
  type=pulse1|pulse2    duty=<12|25|50|75>   env=<0-15>,<up|down|flat>
  type=wave             wave=[<16 values 0-15>]  (no env)
  type=noise            env=<0-15>,<up|down|flat>
  Extended GB envelope: env=gb:<vol>,<dir>,<period>  e.g. env=gb:12,down,1
  sweep effect is only valid on channel 1 (pulse1).
  For percussion, define NAMED noise instruments (e.g. kick, snare, hihat) with
  different envelopes to distinguish timbres. You can have multiple noise instruments.`.trim();

const copilotSystemPrompt = `
${HARDWARE_GAMEBOY}

GAME BOY CHIPTUNE STYLE GUIDE (recommendations, not rules)
  The following techniques are characteristic of authentic GB chiptune and should
  be used liberally to create convincing, expressive 8-bit music:

  1. ARPEGGIO — the most important GB effect. Because the GB only has 4 channels,
     arpeggios simulate chords on a single channel by cycling through note offsets
     very quickly. Use on harmony (ch2) and bass (ch3) for chord texture.
     Define named presets and reuse them:
       effect majorArp = arp:4,7       # major triad  — root → +4 → +7 semitones
       effect minorArp = arp:3,7       # minor triad
       effect dom7Arp  = arp:4,7,10    # dominant 7th
     Apply on held notes:  F3<majorArp>:8  G3<minorArp>:8

  2. VIBRATO on sustained melody notes — adds expressiveness to peaks and long holds.
     Vary depth/speed to differentiate song sections:
       effect wobble  = vib:3,5,sine,3  # gentle wobble on melody peaks
       effect deepVib = vib:5,2,sine,6  # slow atmospheric vibrato for bridges
       effect fastVib = vib:2,8,sine,2  # rapid shimmer on climax notes

  3. TREMOLO for shimmer/sparkle effects on climactic notes:
       effect shimmer = trem:5,8,sine   # fast amplitude flicker — triumphant peaks
       effect horror  = trem:3,8,square # choppy square-wave tremolo — tense sections

  4. PORTAMENTO / slides for melodic runs and legato bass lines:
       effect slide     = port:10  # snappy slide — ascending scalar runs
       effect slowSlide = port:4   # smooth legato — walking bass lines
     Use on ascending runs:  C4:2 E4<slide>:2 G4<slide>:2 C5<slide>:2

  5. DUTY-CYCLE MODULATION (DCM) — define multiple pulse instruments with different
     duty values and switch between them inline within a pattern for timbral variety:
       inst lead_thin  type=pulse1 duty=12 env=gb:13,down,2  # hollow, nasal
       inst lead_bright type=pulse1 duty=50 env=gb:12,down,3  # balanced, bold
       inst lead_warm  type=pulse1 duty=75 env=gb:11,down,4  # warm, full
       pat riff = inst lead_thin C5:2 E5:2 inst lead_bright G5:4 inst lead_warm C6:4

  6. FAST 16th-NOTE MELODIES — GB music is characterised by energetic, rapid note
     sequences. Use short durations (:2 to :4) for melodic runs and fills.
     Avoid overly long notes unless intentionally atmospheric.

  7. SHORT, PUNCHY ENVELOPES — fast-decay envelopes give the characteristic bright
     GB attack. Prefer env=gb:<vol>,down,1 or env=gb:<vol>,down,2 for lead/bass.
     Slower periods (3–6) for pads and atmospheric sustained notes.

  8. NAMED PRESETS for all recurring effects — define effect presets at the top of
     the song, before any patterns, and reference them by name throughout.
     This is idiomatic BeatBax style:
       effect wobble   = vib:3,5,sine,3
       effect majorArp = arp:4,7
       effect slide    = port:10`.trim();

// ─── Hover docs ───────────────────────────────────────────────────────────────

const hoverDocs: Record<string, string> = {
  inst: [
    '**Instrument definition** — declares a named instrument with channel type and parameters.',
    '```\ninst <name> type=<type> [field=value …]\n```',
    '**Common fields (all chips):**',
    '- `note` — default note when instrument name is used as a hit token, e.g. `note=C2`',
    '- `gm` — General MIDI program number for MIDI export (0–127)',
    '',
    '**Game Boy instrument types:**',
    '- `type=pulse1` — `duty` (`12`·`25`·`50`·`75`), `env`, `sweep` (pulse1 only); see `env` and `sweep` hovers',
    '- `type=pulse2` — `duty`, `env`; no hardware sweep',
    '- `type=wave` — `wave` (16 × 0–15 array or 32-nibble hex string), `volume` (`0`·`25`·`50`·`100`); no envelope',
    '- `type=noise` — `env`, `width` (`7` = metallic/tonal · `15` = full/broad)',
    '',
    'Example: `inst lead type=pulse1 duty=50 env=gb:12,down,1`',
  ].join('\n\n'),

  pulse1: 'Game Boy Pulse 1 channel — square wave with duty control, envelope, and hardware frequency sweep (NR10–NR14)',
  pulse2: 'Game Boy Pulse 2 channel — square wave with duty control and envelope; no hardware sweep (NR21–NR23)',

  wave: [
    '**Wave channel** — Game Boy wavetable synthesizer (NR30–NR34 + Wave RAM).',
    'The `wave=` parameter accepts three formats:',
    '```\n# 16-entry array (0–15 per sample; duplicated to fill 32-nibble Wave RAM on export)\nwave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]\n\n# 32-entry array (full Wave RAM — each value 0–15)\nwave=[9,9,10,12,12,13,14,14,13,12,11,9,8,5,3,4,4,5,6,6,7,7,7,6,6,5,3,4,4,4,5,6]\n\n# 32-nibble hex string (hUGETracker format — one hex digit per nibble)\nwave="0478ABBB986202467776420146777631"\n```',
    '- Values are **4-bit** (0–15). Values outside this range are clamped on export.',
    '- Maximise peak (near 15) for good perceived loudness; avoid strong DC offset.',
    '- Use `volume=` (`0` · `25` · `50` · `100`) to set the hardware output-level selector.',
  ].join('\n\n'),

  noise: 'Game Boy Noise channel — LFSR-based noise generator with envelope (NR41–NR44). Use `width=7` (metallic) or `width=15` (full/broad).',

  env: [
    '**Envelope** — controls how amplitude changes over the note\'s life.',
    '**Three accepted formats:**',
    '```\n# Short form — level (0–15), direction, optional period (0–7)\nenv=12,down\nenv=14,up,2\nenv=10,flat\n\n# GB-prefixed form — explicit Game Boy mapping\nenv=gb:12,down,1\n\n# JSON form — verbose, most explicit\nenv={"level":12,"direction":"down","period":1,"format":"gb"}\n```',
    '- `level` — initial volume 0–15',
    '- `direction` — `down` (fade out) · `up` (fade in) · `flat` (constant)',
    '- `period` — envelope step speed 0–7; `0` = constant (no change), `1` = fastest, `7` = slowest',
    '',
    '*Tip: short, high initial level + `down` gives plucky staccato; `flat` holds volume steady.*',
  ].join('\n\n'),

  duty: [
    '**Duty cycle** — sets the pulse-width of a square wave. Valid for `pulse1` and `pulse2` only.',
    '```\nduty=<value>\n```',
    '- `12.5` — thin, cutting (arpeggios, trebly leads)',
    '- `25` — classic, hollow timbre',
    '- `50` — balanced, full-sounding',
    '- `75` — darker, thicker tone (same timbre as 25%, phase-inverted)',
    '',
    '*Tip: experiment with duty together with envelope to shape the attack character.*',
  ].join('\n\n'),

  width: [
    '**LFSR width** — selects the noise generator mode for the `noise` channel.',
    '```\nwidth=<bits>\n```',
    '- `7` — **7-bit** LFSR: short repeating pattern → metallic, tonal noise (hi-hats, shakers)',
    '- `15` — **15-bit** LFSR: long random sequence → broad, full noise (snares, kicks, ambience)',
    '',
    'Combine with `env=` level + period and an appropriate `note=` value to sculpt drum sounds.',
  ].join('\n\n'),

  sweep: [
    '**Pitch Sweep** — hardware frequency sweep (Pulse 1 only, via NR10 register).',
    '**Instrument-level** — declared on an `inst` (applies at note-on via NR10):',
    '```\n# Short form\ninst laser type=pulse1 sweep=<time>,<direction>,<shift>\n\n# JSON form\ninst laser type=pulse1 sweep={"time":4,"direction":"down","shift":7}\n```',
    '**Inline per-note effect** — applied inside a pattern:',
    '```\nC4<sweep:4,down,7>\n```',
    '- `time` — sweep period 0–7 in 1/128 Hz units (0 = disabled)',
    '- `direction` — `up` / `+` for rising pitch · `down` / `−` for falling pitch',
    '- `shift` — frequency shift per step 0–7 (higher = more dramatic, default 1)',
    '',
    'Example instrument: `inst laser type=pulse1 sweep=4,down,7` — fast falling pitch  \nExample note: `C4<sweep:4,down,7>` — same params, per-note only',
    '',
    '**Export:** JSON ✓  MIDI ✓ (pitch-bend approx)  UGE ✓ instrument-level / ⚠ inline  Audio ✓',
  ].join('\n\n'),
};

// ─── Help sections ────────────────────────────────────────────────────────────

const helpSections: ChipUIContributions['helpSections'] = [
  {
    id: 'instruments',
    title: 'Instruments (Game Boy)',
    content: [
      { kind: 'text', text: 'All four Game Boy channels have their own instrument type.' },
      {
        kind: 'snippet',
        label: 'Pulse channel (type=pulse1 or pulse2)',
        code:
`inst lead type=pulse1 duty=50 env=12,down
# duty: 12 | 25 | 50 | 75
# env: <volume>,<direction>  direction = up | down | flat`,
      },
      {
        kind: 'snippet',
        label: 'Wave channel (type=wave)',
        code:
`inst wv type=wave wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
# wave: 16 nibble values (0-15) defining the 4-bit wavetable`,
      },
      {
        kind: 'snippet',
        label: 'Noise channel (type=noise)',
        code:
`inst sn type=noise env=12,down
# LFSR noise with envelope
# width=7 for metallic/tonal; width=15 for full noise`,
      },
      {
        kind: 'snippet',
        label: 'Extended GB envelope format',
        code:
`inst lead type=pulse1 duty=50 env=gb:12,down,1
# env=gb:<level>,<direction>,<period>
# period 0 = constant  1 = fastest decay  7 = slowest`,
      },
      {
        kind: 'snippet',
        label: 'Hardware sweep on pulse1',
        code:
`inst laser type=pulse1 duty=50 sweep=4,down,7
# sweep=<time>,<direction>,<shift>  — pulse1 only`,
      },
      {
        kind: 'snippet',
        label: 'Inline instrument switch in a pattern',
        code:
`pat groove = inst lead C5 E5 inst bass G3 .
# Switches instrument for remaining notes in pattern`,
      },
      {
        kind: 'snippet',
        label: 'Temporary instrument override (N steps)',
        code:
`pat fill = C6 C6 inst(hat,2) C6 C6 C6
# inst(name,N) switches for N steps, then reverts`,
      },
    ],
  },
  {
    id: 'examples',
    title: 'Examples — Click to Insert (Game Boy)',
    content: [
      {
        kind: 'snippet',
        label: 'Minimal song',
        code:
`chip gameboy
bpm 120
time 4

inst lead type=pulse1 duty=50 env=12,down

pat a = C5 E5 G5 C6

seq main = a a a a

channel 1 => inst lead seq main

play`,
      },
      {
        kind: 'snippet',
        label: '4-channel chiptune',
        code:
`chip gameboy
bpm 140
time 4

inst lead  type=pulse1 duty=50  env=12,down
inst bass  type=pulse2 duty=25  env=10,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst kick  type=noise  env=12,down

pat melody  = C5 E5 G5 C6
pat bassline = C3 . G2 .
pat beat    = C6 . . C6 . C6 C6 .

seq main   = melody melody melody melody
seq groove = bassline bassline
seq perc   = beat beat beat beat

channel 1 => inst lead  seq main
channel 2 => inst bass  seq groove:oct(-1)
channel 3 => inst wave1 seq main:oct(-1)
channel 4 => inst kick  seq perc

play`,
      },
      {
        kind: 'snippet',
        label: 'Arpeggio pattern',
        code:
`chip gameboy
bpm 160

inst arp type=pulse1 duty=50 env=15,flat

pat upArp = C5 E5 G5 B5 C6 B5 G5 E5

seq run = upArp upArp upArp upArp

channel 1 => inst arp seq run

play`,
      },
      {
        kind: 'snippet',
        label: 'Wave + noise percussion',
        code:
`chip gameboy
bpm 120

inst wv   type=wave  wave=[15,15,14,12,10,8,6,4,3,2,1,0,0,0,0,0]
inst kick type=noise env=15,down

pat wave_mel = C4 E4 G4 C5
pat kick_pat = C6 . C6 .

seq wseq = wave_mel wave_mel
seq kseq = kick_pat kick_pat kick_pat kick_pat

channel 3 => inst wv   seq wseq
channel 4 => inst kick seq kseq

play`,
      },
    ],
  },
];

// ─── Export ───────────────────────────────────────────────────────────────────

export const gameboyUIContributions: ChipUIContributions = {
  copilotSystemPrompt,
  hoverDocs,
  helpSections,
};
