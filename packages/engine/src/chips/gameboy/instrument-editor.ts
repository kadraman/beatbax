import type { ChipInstrumentEditor } from '../types.js';

export const gameboyInstrumentEditor: ChipInstrumentEditor = {
  types: [
    { id: 'pulse1', label: 'Pulse 1', previewChannel: 1 },
    { id: 'pulse2', label: 'Pulse 2', previewChannel: 2 },
    { id: 'wave', label: 'Wave', previewChannel: 3 },
    { id: 'noise', label: 'Noise', previewChannel: 4 },
  ],
  fields: [
    // Type-defining controls first (appear immediately after Type in the panel).
    { name: 'duty', label: 'Duty', widget: 'enum', values: ['12.5', '12', '25', '50', '75'], whenType: ['pulse1', 'pulse2'] },
    { name: 'volume', label: 'Wave volume', widget: 'enum', values: ['0', '25', '50', '100'], whenType: 'wave', hint: 'Hardware output-level steps (0 / 25 / 50 / 100), not a 0–15 envelope' },
    { name: 'width', label: 'Noise width', widget: 'enum', values: ['7', '15'], whenType: 'noise' },
    { name: 'env', label: 'Envelope', widget: 'envelope', max: 7, whenType: ['pulse1', 'pulse2', 'noise'], hint: 'Hardware volume envelope' },
    { name: 'sweep', label: 'Sweep', widget: 'sweep', whenType: 'pulse1', hint: 'Hardware frequency sweep (pulse1)' },
    { name: 'uge_note', label: 'UGE note', widget: 'uge_note', whenType: 'noise', hint: 'hUGETracker noise note (C-3…C-9); controls NR43 clock' },
    { name: 'gm', label: 'GM program', widget: 'int', min: 0, max: 127 },
    { name: 'note', label: 'Default note', widget: 'note', hint: 'Pitch used when the instrument name is a hit token' },
    { name: 'subpat', label: 'Subpattern', widget: 'text', hint: 'Native subpattern — macros are read-only when set' },
  ],
  macros: [
    { name: 'vol_env', label: 'Volume', min: 0, max: 15, loop: true, kind: 'software' },
    { name: 'duty_env', label: 'Duty', min: 0, max: 3, loop: true, whenType: ['pulse1', 'pulse2'], kind: 'software' },
    { name: 'arp_env', label: 'Arpeggio', min: -24, max: 24, signed: true, loop: true, kind: 'software' },
    { name: 'pitch_env', label: 'Pitch', min: -24, max: 24, signed: true, loop: true, kind: 'software' },
  ],
  waveform: {
    field: 'wave',
    length: 32,
    min: 0,
    max: 15,
    hexImport: true,
    draw: true,
    whenType: 'wave',
    presets: [
      { id: 'sine', label: 'Sine', samples: 'sine' },
      { id: 'square', label: 'Square', samples: 'square' },
      { id: 'saw', label: 'Saw', samples: 'saw' },
      { id: 'triangle', label: 'Triangle', samples: 'triangle' },
    ],
  },
  presets: [
    { id: 'pluck-lead', label: 'Pluck lead', type: 'pulse1', content: 'type=pulse1 duty=50 env=12,down gm=81' },
    { id: 'wave-bass', label: 'Wave bass', type: 'wave', content: 'type=wave wave=[0,5,11,15,15,15,15,15,11,5,0,0,0,0,0,0,0,0,6,8,8,8,8,8,8,8,8,6,0,0,0,0] volume=100 gm=39' },
    { id: 'noise-kick', label: 'Noise kick', type: 'noise', content: 'type=noise gb:width=7 uge_note=C-6 vol_env=[15,12,8,4] pitch_env=[0,-2,-4,-6]' },
  ],
};
