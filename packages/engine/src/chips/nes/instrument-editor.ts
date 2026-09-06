import type { ChipInstrumentEditor } from '../types.js';

export const nesInstrumentEditor: ChipInstrumentEditor = {
  types: [
    { id: 'pulse1', label: 'Pulse 1', previewChannel: 1 },
    { id: 'pulse2', label: 'Pulse 2', previewChannel: 2 },
    { id: 'triangle', label: 'Triangle', previewChannel: 3 },
    { id: 'noise', label: 'Noise', previewChannel: 4 },
    { id: 'dmc', label: 'DMC', previewChannel: 5 },
  ],
  fields: [
    // Type-defining controls first (appear immediately after Type in the panel).
    { name: 'duty', label: 'Duty', widget: 'enum', values: ['12', '12.5', '25', '50', '75'], whenType: ['pulse1', 'pulse2'] },
    { name: 'sample', label: 'DMC sample', widget: 'sample', whenType: 'dmc', hint: '@nes/name, local:path, or https://…' },
    { name: 'env', label: 'Envelope', widget: 'envelope', max: 15, whenType: ['pulse1', 'pulse2', 'noise'] },
    { name: 'env_period', label: 'Env period', widget: 'int', min: 0, max: 15, whenType: ['pulse1', 'pulse2', 'noise'] },
    { name: 'vol', label: 'Volume', widget: 'int', min: 0, max: 15, whenType: ['pulse1', 'pulse2', 'noise'] },
    { name: 'sweep_en', label: 'Sweep enable', widget: 'bool', whenType: ['pulse1', 'pulse2'] },
    { name: 'sweep_period', label: 'Sweep period', widget: 'int', min: 1, max: 7, whenType: ['pulse1', 'pulse2'] },
    { name: 'sweep_shift', label: 'Sweep shift', widget: 'int', min: 0, max: 7, whenType: ['pulse1', 'pulse2'] },
    { name: 'sweep_dir', label: 'Sweep direction', widget: 'enum', values: ['up', 'down'], whenType: ['pulse1', 'pulse2'] },
    { name: 'note', label: 'Default note', widget: 'note' },
  ],
  macros: [
    { name: 'vol_env', label: 'Volume', min: 0, max: 15, loop: true, whenType: ['pulse1', 'pulse2', 'noise'], kind: 'software' },
    { name: 'duty_env', label: 'Duty', min: 0, max: 3, loop: true, whenType: ['pulse1', 'pulse2'], kind: 'software' },
    { name: 'arp_env', label: 'Arpeggio', min: -24, max: 24, signed: true, loop: true, kind: 'software' },
    { name: 'pitch_env', label: 'Pitch', min: -24, max: 24, signed: true, loop: true, kind: 'software' },
  ],
  presets: [
    { id: 'nes-lead', label: 'Pulse lead', type: 'pulse1', content: 'type=pulse1 duty=50 env=15,down' },
    { id: 'nes-tri', label: 'Triangle bass', type: 'triangle', content: 'type=triangle' },
    { id: 'nes-noise', label: 'Noise hit', type: 'noise', content: 'type=noise vol_env=[15,12,8,4,0]' },
  ],
  constraints: [
    { id: 'triangle-vol', when: 'type=triangle', message: 'Triangle has no volume register — volume macros do not apply.' },
  ],
};
