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
    { name: 'linear', label: 'Linear counter', widget: 'int', min: 0, max: 127, whenType: 'triangle', hint: 'Gate length in frames (1–127); 0 or omit = sustain' },
    { name: 'noise_mode', label: 'Noise mode', widget: 'enum', values: ['normal', 'loop'], whenType: 'noise', hint: 'normal = short LFSR (metallic); loop = long random' },
    { name: 'noise_period', label: 'Noise period', widget: 'int', min: 0, max: 15, whenType: 'noise' },
    { name: 'dmc_sample', label: 'DMC sample', widget: 'sample', whenType: 'dmc', hint: 'Bundled @nes/name, local:path, https:// URL, or github: ref' },
    { name: 'dmc_rate', label: 'DMC rate', widget: 'int', min: 0, max: 15, whenType: 'dmc' },
    { name: 'dmc_loop', label: 'DMC loop', widget: 'bool', whenType: 'dmc' },
    { name: 'dmc_level', label: 'DMC level', widget: 'int', min: 0, max: 127, whenType: 'dmc', hint: 'Initial DAC level 0–127' },
    { name: 'env', label: 'Envelope', widget: 'envelope', max: 15, storage: 'discrete', whenType: ['pulse1', 'pulse2', 'noise'] },
    { name: 'env_period', label: 'Env period', widget: 'int', min: 0, max: 15, whenType: ['pulse1', 'pulse2', 'noise'] },
    { name: 'vol', label: 'Volume', widget: 'int', min: 0, max: 15, whenType: ['pulse1', 'pulse2', 'noise'] },
    {
      name: 'sweep',
      label: 'Sweep',
      widget: 'sweep',
      storage: 'discrete',
      whenType: ['pulse1', 'pulse2'],
      hint: 'Hardware frequency sweep (writes sweep_en / sweep_period / sweep_shift / sweep_dir)',
    },
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
