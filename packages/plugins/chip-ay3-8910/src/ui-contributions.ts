import type { ChipUIContributions } from '@beatbax/engine';

const copilotSystemPrompt = `
══ AY-3-8910 / YM2149 PSG QUICK REFERENCE ══
Use 3 melodic/noise-mix channels.
Instrument fields:
- type=tone | noise | tone_noise
- env=none|attack_decay|attack_decay_repeat|decay_only|decay_repeat|attack_only|hold|attack_hold|decay_quick|decay_hold_max|attack_hold_max|triangle_down_up|triangle_up_down
- noise=on|off
- noise_rate=0..31
- vol=0..15 or vol=use_envelope
- use_envelope=true|false
- env_pitch=<note> (e.g. A2)
- env_period=0..65535

Semantics:
- type=noise disables tone and keeps noise enabled.
- noise=on with type=tone mixes tone+noise.
- use_envelope or vol=use_envelope drives amplitude from env shape.
- noise_rate is chip-global on hardware; keep channel values consistent.
- env_period/env_pitch are shared hardware resources; last writer wins.
`.trim();

const hoverDocs: Record<string, string> = {
  inst: [
    '**Instrument definition** — declares a named instrument with channel type and parameters.',
    '```\ninst <name> type=<type> [field=value …]\n```',
    '**Common fields (all chips):**',
    '- `note` — default note when instrument name is used as a hit token, e.g. `note=C2`',
    '- `gm` — General MIDI program number for MIDI export (0–127)',
    '',
    '**AY instrument types:**',
    '- `type=tone` — square-wave oscillator; supports `env`, `noise`, `vol`, `use_envelope`',
    '- `type=noise` — noise generator; supports `env`, `noise_rate`, `vol`, `use_envelope`',
    '- `type=tone_noise` — enables tone and noise together on one channel',
    '',
    'Examples:',
    '```\ninst lead type=tone env=attack_decay vol=use_envelope\ninst kick type=noise noise=on noise_rate=10 vol=14\n```',
  ].join('\n'),
  type: '**type** — channel mode: `tone` (square wave), `noise` (noise-only), or `tone_noise` (tone+noise mixed).',
  env: [
    '**env** — AY hardware envelope shape selector. Applies when `vol=use_envelope` is set.',
    '',
    'Available shapes:',
    '- `none` — no envelope (constant volume)',
    '- `attack_decay` — rise from silence to max, then decay back to silence (one cycle)',
    '- `attack_decay_repeat` — attack-decay repeats continuously (buzzy)',
    '- `decay_only` — immediate decay from max to silence (one cycle)',
    '- `decay_repeat` — decay repeats continuously (sawtooth oscillation)',
    '- `attack_only` — rise from silence to max, then hold',
    '- `hold` — constant max volume',
    '- `attack_hold` — rise from silence to max, then hold',
    '- `decay_quick` — fast 6-level decay for punchy percussion',
    '- `decay_hold_max` — single decay then hold at maximum',
    '- `attack_hold_max` — single attack then hold at maximum',
    '- `triangle_down_up` — triangle, down-up repeating',
    '- `triangle_up_down` — triangle, up-down repeating',
    '',
    'All shapes use 5-bit (0–31) levels.',
    'Example: `env=attack_decay_repeat`',
  ].join('\n'),
  noise: '**noise** — enable noise mixing on this channel: `on` or `off` (default: `off` for tone, `on` for noise)',
  noise_rate: '**noise_rate** — AY noise period register (0–31). Lower values produce brighter noise. E.g., `noise_rate=10` (hi-hat) or `noise_rate=2` (kick).',
  vol: [
    '**vol** — channel volume/envelope control.',
    '',
    'Options:',
    '- `vol=<number>` — fixed volume (0–31), where 31 is loudest',
    '- `vol=use_envelope` — amplitude controlled by AY hardware envelope shape (requires `env` to be set to a non-none shape)',
    '',
    'When `vol=use_envelope`, the envelope shape is applied as an amplitude curve over the note duration.',
    'Example: `vol=use_envelope` with `env=attack_decay` creates a percussive one-shot envelope.',
  ].join('\n'),
  use_envelope: [
    '**use_envelope** — boolean flag (alternative to `vol=use_envelope`).',
    '',
    '- `use_envelope=true` — same as `vol=use_envelope`',
    '- `use_envelope=false` — amplitude uses fixed `vol` value',
    '',
    'Note: if `use_envelope=true` but `env=none`, the channel produces silence. Always pair with a meaningful `env` shape.',
  ].join('\n'),
  env_pitch: [
    '**env_pitch** — set AY envelope period from note pitch (envelope-as-oscillator / buzz bass).',
    '',
    '- Example: `env_pitch=A2`',
    '- Uses formula: `env_period = floor(f_clock / (256 * f_note))`',
    '- Requires repeating `env` shape: `attack_decay_repeat`, `decay_repeat`, `triangle_down_up`, or `triangle_up_down`',
    '- Cannot be used together with `env_period`',
  ].join('\n'),
  env_period: [
    '**env_period** — raw hardware envelope period (R11+R12), range `0..65535`.',
    '',
    '- Expert override for AY envelope timing',
    '- Shared across all channels in hardware (last writer wins)',
    '- Requires repeating envelope shape and cannot be combined with `env_pitch`',
  ].join('\n'),
  ay: '**AY-3-8910 / YM2149** — 3-channel PSG with shared noise and hardware envelope generator.',
  ym2149: '**YM2149** — Yamaha-compatible AY variant. Use same instrument fields as AY-3-8910.',
};

const helpSections: ChipUIContributions['helpSections'] = [
  {
    id: 'instruments',
    title: 'Instruments (AY-3-8910 / YM2149)',
    content: [
      { kind: 'text', text: 'AY instruments can mix tone and noise per channel and optionally use hardware envelope shapes.' },
      {
        kind: 'snippet',
        label: 'Typical melodic + percussion instruments',
        code: `inst lead type=tone env=attack_decay vol=use_envelope\ninst bass type=tone env=decay_only vol=12\ninst kick type=noise noise=on noise_rate=10 env=decay_quick vol=14`,
      },
    ],
  },
];

export const ayUIContributions: ChipUIContributions = {
  copilotSystemPrompt,
  hoverDocs,
  helpSections,
};
