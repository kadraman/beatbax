import type { ChipInstrumentEditor } from '@beatbax/engine';

export const spectrumInstrumentEditor: ChipInstrumentEditor = {
  types: [
    {
      id: 'tone1',
      label: 'Tone A',
      description: 'AY tone · channel A',
      blankContent: 'type=tone1 vol=12 arp_env=[0,4,7|0]',
      previewChannel: 1,
      previewMode: 'melodic',
      previewOctave: 4,
    },
    {
      id: 'tone2',
      label: 'Tone B',
      description: 'AY tone · channel B',
      blankContent: 'type=tone2 vol=14',
      previewChannel: 2,
      previewMode: 'melodic',
      previewOctave: 4,
    },
    {
      id: 'tone3',
      label: 'Tone C',
      description: 'AY tone · channel C',
      blankContent: 'type=tone3 vol=10',
      previewChannel: 3,
      previewMode: 'melodic',
      previewOctave: 2,
    },
  ],
  fields: [
    { name: 'vol', label: 'Volume', widget: 'int', min: 0, max: 15 },
    { name: 'tone', label: 'Tone mix', widget: 'bool', hint: 'Force tone generator on/off (R7)' },
    { name: 'tone_mix', label: 'Noise mix', widget: 'bool', hint: 'Route shared noise into this channel' },
    { name: 'noise_rate', label: 'Noise rate', widget: 'int', min: 0, max: 31, hint: 'R6 noise period (global)' },
    { name: 'env_bass', label: 'Buzz bass', widget: 'bool' },
    { name: 'env_shape', label: 'Env shape', widget: 'int', min: 0, max: 15, hint: 'R13; env_bass only' },
    { name: 'note', label: 'Default note', widget: 'note' },
    { name: 'gm', label: 'GM program', widget: 'int', min: 0, max: 127 },
  ],
  macros: [
    { name: 'vol_env', label: 'Hardware envelope', min: 0, max: 15, loop: true, kind: 'hardware', hint: 'AY hardware envelope is global (R11–R13); one at a time' },
    { name: 'arp_env', label: 'Arpeggio', min: -24, max: 24, signed: true, loop: true, kind: 'software' },
    { name: 'pitch_env', label: 'Pitch', min: -24, max: 24, signed: true, loop: true, kind: 'software' },
  ],
  presets: [
    {
      id: 'ay-lead',
      label: 'Tone lead',
      description: 'Channel A lead with a looping triad arpeggio',
      type: 'tone1',
      content: 'type=tone1 vol=12 arp_env=[0,4,7|0]',
    },
    {
      id: 'ay-bass',
      label: 'Tone bass',
      description: 'Sustained channel B tone for bass lines',
      type: 'tone2',
      content: 'type=tone2 vol=14',
    },
  ],
  constraints: [
    { id: 'one-envelope', message: 'Only one instrument should use vol_env or env_bass at a time (shared AY envelope).' },
  ],
};
