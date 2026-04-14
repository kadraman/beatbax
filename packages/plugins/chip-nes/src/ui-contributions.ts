/**
 * BeatBax web-UI contributions for the NES (Ricoh 2A03) chip plugin.
 *
 * Provides:
 *  - copilotSystemPrompt  — hardware reference injected into the AI system prompt
 *  - hoverDocs            — keyword hover docs for NES-specific syntax
 *  - helpSections         — help-panel sections tailored to NES authoring
 */
import type { ChipUIContributions } from '@beatbax/engine';

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
        kind: 'snippet',
        label: 'Minimal NES song',
        code:
`chip nes
bpm 150
time 4

inst lead type=pulse1 duty=25 env=13,down env_period=2

pat a = C5 E5 G5 C6

seq main = a a a a

channel 1 => inst lead seq main

play`,
      },
      {
        kind: 'snippet',
        label: '5-channel NES chiptune',
        code:
`chip nes
bpm 150
time 4

inst lead  type=pulse1   duty=25   env=13,down  env_period=2
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
        kind: 'snippet',
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
        kind: 'snippet',
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
