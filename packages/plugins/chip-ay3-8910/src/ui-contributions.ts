import type { ChipUIContributions } from '@beatbax/engine';

const copilotSystemPrompt = `
══ AY-3-8910 / YM2149 PSG QUICK REFERENCE ══
Use 3 melodic/noise-mix channels.
Instrument fields:
- type=tone | noise
- env=none|attack_decay|attack_decay_repeat|decay_only|decay_repeat|attack_only|hold|attack_hold|decay_quick
- noise=on|off
- noise_rate=0..31
- vol=0..15 or vol=use_envelope
- use_envelope=true|false

Semantics:
- type=noise disables tone and keeps noise enabled.
- noise=on with type=tone mixes tone+noise.
- use_envelope or vol=use_envelope drives amplitude from env shape.
- noise_rate is chip-global on hardware; keep channel values consistent.
`.trim();

const hoverDocs: Record<string, string> = {
  ay: '**AY-3-8910 / YM2149** — 3-channel PSG with shared noise and hardware envelope generator.',
  ym2149: '**YM2149** — Yamaha-compatible AY variant. Use same instrument fields as AY-3-8910.',
  env: 'AY envelope shape selector. Example: `env=attack_decay` or `env=decay_repeat`.',
  noise_rate: 'AY noise period register value (0-31). Lower values produce brighter noise.',
  use_envelope: 'When true, channel amplitude follows AY envelope output instead of fixed `vol`.',
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
