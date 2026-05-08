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
