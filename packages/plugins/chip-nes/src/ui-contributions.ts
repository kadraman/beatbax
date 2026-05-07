/**
 * BeatBax web-UI contributions for the NES (Ricoh 2A03) chip plugin.
 *
 * Provides:
 *  - copilotSystemPrompt  — hardware reference injected into the AI system prompt
 *  - hoverDocs            — keyword hover docs for NES-specific syntax
 *  - helpSections         — help-panel sections tailored to NES authoring
 */
import type { ChipUIContributions } from '@beatbax/engine';

export const CHIP_IMAGE_BASE64 =
  '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';

// ─── CoPilot system prompt ────────────────────────────────────────────────────

const copilotSystemPrompt = `
══ NES (RICOH 2A03) HARDWARE — READ FIRST ══
Exactly 5 channels. Each channel number (1–5) must appear AT MOST ONCE per song.
Channel-to-type mapping is FIXED — you cannot swap these:
  channel 1 → type=pulse1   (melodic) — lead melody; supports duty, envelope, hardware sweep
  channel 2 → type=pulse2   (melodic) — harmony or counter-melody; duty and envelope, no sweep
  channel 3 → type=triangle (bass/melodic) — fixed waveform, no volume control; perfect for bass
  channel 4 → type=noise    (drums/percussion) — LFSR noise with envelope; kick, snare, hi-hat
  channel 5 → type=dmc      (samples) — delta-modulation sample playback; bass hits, effects
NEVER write two "channel <number> =>" lines. Use channels 1–5 only (NES has no 6th channel).
NEVER define instruments inside pat bodies.

INSTRUMENTS  (inst <name> <fields>)

  type=pulse1 | type=pulse2  (channels 1 and 2)
    duty=<12|25|50|75>         — pulse width (12 = thin/nasal, 25 = classic hollow, 50 = full, 75 = dark)
    env=<0-15>,<up|down|flat>  — volume envelope level and direction
    env_period=<0-15>          — envelope decay rate (0 = constant, 1 = fastest, higher = slower)
    vol=<0-15>                 — constant volume (use instead of env when you want a fixed level)
    sweep_en=true/false        — hardware frequency sweep (both pulse channels on NES)
    sweep_period=<1-7>         — sweep step period
    sweep_shift=<0-7>          — sweep frequency shift amount per step
    sweep_dir=up|down          — sweep direction

  type=triangle  (channel 3)
    No volume or envelope control — hardware-fixed amplitude.
    linear=<1-127>             — linear counter (note gate length in frames; omit for sustained notes)
    Use the triangle for bass lines, walking bass, or low melodic lines.
    Since triangle has no volume, use note durations and rests to shape rhythm.

  type=noise  (channel 4)
    noise_mode=normal|loop     — normal = short LFSR (metallic); loop = long random (full noise)
    noise_period=<0-15>        — pitch/speed selector (0 = highest frequency, 15 = lowest)
    env=<0-15>,<up|down|flat>  — volume envelope
    env_period=<0-15>          — decay rate
    vol=<0-15>                 — constant volume (alternative to envelope)
    For drums, define NAMED noise instruments with specific noise_period values:
      inst kick  type=noise noise_mode=normal noise_period=12 env=15,down env_period=3
      inst snare type=noise noise_mode=normal noise_period=6  env=14,down env_period=1
      inst hihat type=noise noise_mode=normal noise_period=3  env=8,down  env_period=0

  type=dmc  (channel 5)
    dmc_rate=<0-15>            — playback speed (0 = slowest ~4.18 kHz, 15 = fastest ~33.14 kHz)
    dmc_loop=true|false        — loop sample continuously
    dmc_sample="@nes/<name>"   — bundled sample reference (e.g. "@nes/bass_c2")
    Available bundled samples: bass_c1, bass_c2, kick, snare, hihat, crash, shaker, clap

NES CHIPTUNE STYLE GUIDE
  1. The NES has no wave channel — use triangle for bass and sub-melody lines.
  2. Arpeggios are essential on NES too: cycle through semitone offsets to simulate chords.
     Use on pulse channels for harmonic texture:
       effect majorArp = arp:4,7    # major triad
       effect minorArp = arp:3,7    # minor triad
  3. Triangle bass lines: use root note + octave patterns; keep durations short for rhythmic bass.
  4. Duty cycle variety: mix duty values (12/25/50/75) for timbral contrast across sections.
  5. Hardware sweep creates iconic NES pitch effects — descending sweep for explosions/hits:
       inst sfx type=pulse1 sweep_en=true sweep_period=1 sweep_shift=4 sweep_dir=down
  6. Noise percussion: tune noise_period carefully — low values ≈ hi-hat, mid ≈ snare, high ≈ kick.
  7. DMC channel: reserve for punchy bass hits or special effects; not suitable for melody.
  8. Keep melodies on pulse1 (lead) + pulse2 (harmony); triangles provide the bass foundation.
`.trim();

// ─── Hover docs ───────────────────────────────────────────────────────────────

const hoverDocs: Record<string, string> = {
  inst: [
    '**Instrument definition** — declares a named instrument with channel type and parameters.',
    '```\ninst <name> type=<type> [field=value …]\n```',
    '**Common fields (all chips):**',
    '- `note` — default note when instrument name is used as a hit token, e.g. `note=C2`',
    '- `gm` — General MIDI program number for MIDI export (0–127)',
    '',
    '**NES instrument types:**',
    '- `type=pulse1` / `type=pulse2` — `duty` (`12`·`25`·`50`·`75`), `env`, `env_period`, `vol`, hardware `sweep_en`/`sweep_period`/`sweep_shift`/`sweep_dir`',
    '- `type=triangle` — no volume control; `linear` sets gate length (1–127 frames)',
    '- `type=noise` — `noise_mode` (`normal`·`loop`), `noise_period` (0–15), `env`, `env_period`, `vol`',
    '- `type=dmc` — `dmc_rate` (0–15), `dmc_loop`, `dmc_sample` (`"@nes/<name>"`)',
    '',
    'Example: `inst kick type=noise noise_mode=normal noise_period=12 env=15,down env_period=3`',
  ].join('\n\n'),

  pulse1: [
    '**Pulse 1** — NES APU square-wave oscillator (channel 1).',
    'Supports duty cycle, envelope, constant volume, and hardware frequency sweep.',
    '```\ninst lead type=pulse1 duty=25 env=13,down env_period=2\ninst sweep type=pulse1 duty=50 sweep_en=true sweep_period=1 sweep_shift=4 sweep_dir=down\n```',
    '- `duty` — `12` (thin) · `25` (classic) · `50` (balanced) · `75` (dark)',
    '- `env` — `<level>,<direction>` where direction = `up` · `down` · `flat`',
    '- `env_period` — envelope decay speed 0–15 (0 = constant level, 1 = fastest)',
    '- `vol` — constant volume 0–15 (use instead of env)',
    '- `sweep_en` / `sweep_period` / `sweep_shift` / `sweep_dir` — hardware pitch sweep',
  ].join('\n\n'),

  pulse2: [
    '**Pulse 2** — NES APU square-wave oscillator (channel 2).',
    'Same capabilities as Pulse 1 including hardware sweep, but occupies channel 2.',
    '```\ninst harm type=pulse2 duty=50 env=10,down env_period=4\n```',
    '- `duty` — `12` · `25` · `50` · `75`',
    '- `env` — `<level>,<up|down|flat>`',
    '- `env_period` — decay speed 0–15',
  ].join('\n\n'),

  triangle: [
    '**Triangle** — NES APU triangle-wave channel (channel 3).',
    'Fixed 32-step triangle waveform. **No hardware volume or envelope control.**',
    'Ideal for bass lines and sub-melody. Volume is always maximum; use rests and durations for dynamics.',
    '```\ninst bass type=triangle\ninst tri_kick type=triangle linear=3    # short gate — percussive\n```',
    '- `linear` — linear counter gate length in frames (1–127); omit for a fully sustained note.',
    '  A small value (1–8) gives a short, percussive attack useful for rhythmic bass hits.',
    '',
    '_Tip: combine short triangle hits with noise kick and DMC samples for punchy NES percussion._',
  ].join('\n\n'),

  noise: [
    '**Noise** — NES APU LFSR noise generator (channel 4).',
    '```\ninst kick  type=noise noise_mode=normal noise_period=12 env=15,down env_period=3\ninst snare type=noise noise_mode=normal noise_period=6  env=14,down env_period=1\ninst hihat type=noise noise_mode=normal noise_period=3  env=8,down  env_period=0\n```',
    '- `noise_mode` — `normal` (short-period, metallic/tonal) · `loop` (long-period, full noise)',
    '- `noise_period` — 0–15; lower = higher pitch; common values:',
    '  `0–3` → hi-hats | `4–8` → snare textures | `9–15` → kick / bass transients',
    '- `env` / `env_period` — volume envelope as for pulse channels',
    '- `vol` — constant volume 0–15 (alternative to env)',
  ].join('\n\n'),

  dmc: [
    '**DMC** — NES delta-modulation channel (channel 5).',
    'Plays back 1-bit delta-encoded audio samples from ROM/memory.',
    '```\ninst bass_hit type=dmc dmc_rate=7 dmc_loop=false dmc_sample="@nes/bass_c2"\n```',
    '- `dmc_rate` — playback rate index 0–15 (0 = ~4.18 kHz, 15 = ~33.14 kHz; recommended: 6–10)',
    '- `dmc_loop` — `true` to loop the sample continuously; `false` for one-shot',
    '- `dmc_sample` — sample reference:',
    '  - `"@nes/<name>"` — bundled sample (`bass_c1`, `bass_c2`, `kick`, `snare`, `hihat`, `crash`, `shaker`, `clap`)',
    '  - `"local:<path>"` — file-system path (CLI/Node.js only)',
    '  - `"https://…"` — remote URL (browser + Node.js 18+)',
    '',
    '_DMC interrupts other channels on real hardware; use sparingly in authentic arrangements._',
  ].join('\n\n'),

  env: [
    '**Envelope** — controls amplitude over the note\'s life. Same syntax as Game Boy.',
    '```\nenv=<level>,<direction>\nenv=13,down\nenv=10,flat\n```',
    '- `level` — initial volume 0–15',
    '- `direction` — `down` (decay) · `up` (attack) · `flat` (constant)',
    '- `env_period` — separate field for NES; controls decay speed 0–15 (0 = constant, 1 = fastest)',
    '',
    '_NES note: use `vol=<0-15>` for a truly constant level; `env=<n>,flat` also works._',
  ].join('\n\n'),

  sweep_en: [
    '**Hardware sweep** — automatic frequency sweep on NES Pulse channels.',
    '```\ninst sfx type=pulse1 sweep_en=true sweep_period=2 sweep_shift=4 sweep_dir=down\n```',
    '- `sweep_en` — `true` to enable the hardware sweep unit',
    '- `sweep_period` — step period 1–7 (1 = fastest update rate)',
    '- `sweep_shift` — frequency shift per step 0–7 (higher = more dramatic)',
    '- `sweep_dir` — `up` (pitch rise) or `down` (pitch fall)',
    '',
    '_Classic NES uses: descending sweep for explosions, ascending for power-up jingles._',
  ].join('\n\n'),

  linear: [
    '**Linear counter** — hardware gate for the NES triangle channel.',
    '```\ninst tri_hit type=triangle linear=4\n```',
    '- Value 1–127: note is automatically cut after this many APU frame cycles.',
    '  Low values (1–8) create short percussive hits; higher values give sustained notes.',
    '- Omit entirely for a fully sustained note (no automatic gate).',
  ].join('\n\n'),
};

// ─── Help sections ────────────────────────────────────────────────────────────

const helpSections: ChipUIContributions['helpSections'] = [
  {
    id: 'instruments',
    title: 'Instruments (NES)',
    content: [
      { kind: 'text', text: 'The NES has 5 channels. Each requires a matching instrument type.' },
      {
        kind: 'snippet',
        label: 'Pulse channels (type=pulse1 / pulse2)',
        code:
`inst lead  type=pulse1 duty=25 env=13,down env_period=2
inst harm  type=pulse2 duty=50 env=10,down env_period=4
# duty: 12 | 25 | 50 | 75
# env_period: 0 = constant, 1 = fastest decay, 15 = slowest`,
      },
      {
        kind: 'snippet',
        label: 'Triangle channel (type=triangle) — no volume control',
        code:
`inst bass     type=triangle            # sustained
inst tri_hit  type=triangle linear=4   # short gate — percussive bass hit
# No env or vol — hardware amplitude is always at maximum`,
      },
      {
        kind: 'snippet',
        label: 'Noise channel (type=noise) — drums & percussion',
        code:
`inst kick  type=noise noise_mode=normal noise_period=12 env=15,down env_period=3
inst snare type=noise noise_mode=normal noise_period=6  env=14,down env_period=1
inst hihat type=noise noise_mode=normal noise_period=3  env=8,down  env_period=0
# noise_period: 0–3 hi-hat, 4–8 snare, 9–15 kick/boom`,
      },
      {
        kind: 'snippet',
        label: 'DMC sample channel (type=dmc)',
        code:
`inst bass_hit type=dmc dmc_rate=7 dmc_loop=false dmc_sample="@nes/bass_c2"
inst sfx      type=dmc dmc_rate=10 dmc_loop=false dmc_sample="@nes/crash"
# Bundled samples: bass_c1, bass_c2, kick, snare, hihat, crash, shaker, clap`,
      },
      {
        kind: 'snippet',
        label: 'Hardware sweep effect (pulse1/pulse2)',
        code:
`inst laser type=pulse1 duty=50 sweep_en=true sweep_period=1 sweep_shift=4 sweep_dir=down
# sweep_dir=down → falling pitch (explosion / coin collect style)`,
      },
      {
        kind: 'snippet',
        label: 'Inline instrument switch',
        code:
`pat riff = inst lead C5 E5 inst harm G4 .
# Switches instrument for remaining notes in pattern`,
      },
    ],
  },
  {
    id: 'examples',
    title: 'Examples — Click to Insert (NES)',
    content: [
      {
        kind: 'song',
        label: 'Minimal NES song',
        code:
`chip nes
bpm 150
time 4

inst lead type=pulse1 duty=50 env=13,down env_period=2

pat a = C5 E5 G5 C6

seq main = a a a a

channel 1 => inst lead seq main

play`,
      },
      {
        kind: 'song',
        label: '5-channel NES chiptune',
        code:
`chip nes
bpm 150
time 4

inst lead  type=pulse1   duty=50   env=13,down  env_period=2
inst harm  type=pulse2   duty=50   env=10,down  env_period=4
inst bass  type=triangle
inst kick  type=noise    noise_mode=normal noise_period=12 env=15,down env_period=3
inst snare type=noise    noise_mode=normal noise_period=6  env=14,down env_period=1
inst hihat type=noise    noise_mode=normal noise_period=3  env=8,down  env_period=0
inst samp  type=dmc      dmc_rate=7  dmc_sample="@nes/bass_c2"

pat melody  = C5 E5 G5 B5 C6 B5 G5 E5
pat harmony = C4 . G4 . A4 . F4 .
pat bassline = C3 . . . G2 . . .
pat beat    = kick . snare . kick kick snare hihat
pat bass_hit = samp . . . samp . . .

seq main   = melody melody melody melody
seq harm   = harmony harmony harmony harmony
seq groove = bassline bassline
seq perc   = beat beat beat beat
seq hits   = bass_hit bass_hit bass_hit bass_hit

channel 1 => inst lead  seq main
channel 2 => inst harm  seq harm
channel 3 => inst bass  seq groove
channel 4 => inst kick  seq perc
channel 5 => inst samp  seq hits

play`,
      },
      {
        kind: 'song',
        label: 'NES arpeggio chords',
        code:
`chip nes
bpm 180

effect majorArp = arp:4,7
effect minorArp = arp:3,7

inst lead type=pulse1 duty=25 env=15,flat
inst harm type=pulse2 duty=50 env=12,flat

pat arps = C5<majorArp>:4 F5<majorArp>:4 G5<majorArp>:4 A5<minorArp>:4

seq run = arps arps arps arps

channel 1 => inst lead seq run
channel 2 => inst harm seq run:oct(-1)

play`,
      },
      {
        kind: 'song',
        label: 'NES hardware sweep effect',
        code:
`chip nes
bpm 120

inst sweep_hit type=pulse1 duty=50 env=15,down env_period=2
  sweep_en=true sweep_period=1 sweep_shift=5 sweep_dir=down
inst bass  type=triangle

pat sweep_pat = C5:8 . . .
pat bass_pat  = C3:4 G2:4

seq sfx  = sweep_pat sweep_pat
seq bass = bass_pat bass_pat bass_pat bass_pat

channel 1 => inst sweep_hit seq sfx
channel 3 => inst bass      seq bass

play`,
      },
    ],
  },
];

// ─── Export ───────────────────────────────────────────────────────────────────

export const nesUIContributions: ChipUIContributions = {
  copilotSystemPrompt,
  hoverDocs,
  helpSections,
};
