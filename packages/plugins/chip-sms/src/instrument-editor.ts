import type { ChipInstrumentEditor } from '@beatbax/engine';

export const smsInstrumentEditor: ChipInstrumentEditor = {
  types: [
    { id: 'tone1', label: 'Tone 1', previewChannel: 1 },
    { id: 'tone2', label: 'Tone 2', previewChannel: 2 },
    { id: 'tone3', label: 'Tone 3', previewChannel: 3 },
    { id: 'noise', label: 'Noise', previewChannel: 4 },
  ],
  fields: [
    // Type-defining controls first (appear immediately after Type in the panel).
    { name: 'noise_mode', label: 'Noise mode', widget: 'enum', values: ['white', 'periodic'], whenType: 'noise' },
    { name: 'noise_rate', label: 'Noise rate', widget: 'enum', values: ['0', '1', '2', 'tone3'], whenType: 'noise' },
    { name: 'vol', label: 'Attenuation', widget: 'int', min: 0, max: 15, hint: '0 = loudest, 15 = mute' },
    { name: 'gg_pan', label: 'GG pan', widget: 'enum', values: ['L', 'C', 'R'] },
    { name: 'note', label: 'Default note', widget: 'note' },
    { name: 'gm', label: 'GM program', widget: 'int', min: 0, max: 127 },
  ],
  macros: [
    { name: 'vol_env', label: 'Volume', min: 0, max: 15, loop: true, kind: 'software', hint: 'Attenuation sequence; 0 = loudest' },
    { name: 'arp_env', label: 'Arpeggio', min: -24, max: 24, signed: true, loop: true, kind: 'software', whenType: ['tone1', 'tone2', 'tone3'] },
    { name: 'pitch_env', label: 'Pitch', min: -24, max: 24, signed: true, loop: true, kind: 'software' },
    { name: 'noise_rate_env', label: 'Noise rate', min: 0, max: 3, loop: true, whenType: 'noise', kind: 'software' },
  ],
  presets: [
    { id: 'sms-lead', label: 'Tone lead', type: 'tone1', content: 'type=tone1 vol=4 vol_env=[0,2,4,8,12,15]' },
    { id: 'sms-noise', label: 'Noise drum', type: 'noise', content: 'type=noise noise_mode=white noise_rate=2 vol_env=[0,4,8,12,15]' },
  ],
  constraints: [
    { id: 'attenuation', message: 'SMS volume is attenuation: 0 is loudest, 15 is silent.' },
  ],
};
