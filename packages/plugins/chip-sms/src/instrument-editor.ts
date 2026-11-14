import type { ChipInstrumentEditor } from '@beatbax/engine';

export const smsInstrumentEditor: ChipInstrumentEditor = {
  types: [
    {
      id: 'tone1',
      label: 'Tone 1',
      description: 'Square tone · ch 1',
      blankContent: 'type=tone1 vol=2',
      previewChannel: 1,
      previewMode: 'melodic',
      previewOctave: 4,
    },
    {
      id: 'tone2',
      label: 'Tone 2',
      description: 'Square tone · ch 2',
      blankContent: 'type=tone2 vol=4 vol_env=[0,2,6,10,15]',
      previewChannel: 2,
      previewMode: 'melodic',
      previewOctave: 4,
    },
    // SN76489 10-bit period clamps below ~A2 to the same pitch; octave 3 keeps C–B distinct.
    {
      id: 'tone3',
      label: 'Tone 3',
      description: 'Square tone · ch 3',
      blankContent: 'type=tone3 vol=0',
      previewChannel: 3,
      previewMode: 'melodic',
      previewOctave: 3,
    },
    {
      id: 'noise',
      label: 'Noise',
      description: 'Noise · ch 4',
      blankContent: 'type=noise noise_mode=white noise_rate=2 vol_env=[0,4,8,12,15]',
      previewChannel: 4,
      previewMode: 'oneshot',
    },
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
    {
      id: 'sms-lead',
      label: 'Tone lead',
      description: 'Tone with a soft attenuation decay',
      type: 'tone1',
      content: 'type=tone1 vol=4 vol_env=[0,2,4,8,12,15]',
    },
    {
      id: 'sms-noise',
      label: 'Noise drum',
      description: 'White-noise hit with attenuation falloff',
      type: 'noise',
      content: 'type=noise noise_mode=white noise_rate=2 vol_env=[0,4,8,12,15]',
    },
  ],
  constraints: [
    { id: 'attenuation', message: 'SMS volume is attenuation: 0 is loudest, 15 is silent.' },
  ],
};
