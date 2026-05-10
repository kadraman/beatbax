import type { ChipNewSongWizard } from '@beatbax/engine';

const image = '/chips/ay3-8910/chip-image.png';

const commonTemplates = {
  instruments: [
    {
      id: 'ay-basic-instruments',
      label: 'AY starter instruments',
      content: `
inst lead type=tone env=attack_decay vol=use_envelope gm=81
inst bass type=tone env=decay_only vol=12 gm=39
inst pad  type=tone env=attack_decay_repeat vol=use_envelope gm=89
inst kick type=noise noise=on noise_rate=10 env=decay_quick vol=14 note=C2
inst hat  type=noise noise=on noise_rate=2 vol=10 note=C5
`,
    },
  ],
  effects: [
    {
      id: 'ay-basic-effects',
      label: 'AY starter effects',
      content: `
effect exprVib = vib:2,5,sine,2
effect punch   = bend:-3,0.08,exp
`,
    },
  ],
  structure: [
    {
      id: 'ay-basic-structure',
      label: 'AY starter structure',
      content: `
pat lead_pat = C5<exprVib>:4 E5 G5 A5 G5 E5 C5 D5
pat bass_pat = C3 . G2 . A2 . F2 .
pat drum_pat = kick . hat . kick kick hat .

seq lead_seq = lead_pat lead_pat
seq bass_seq = bass_pat bass_pat
seq drum_seq = drum_pat drum_pat drum_pat drum_pat

channel 1 => inst lead seq lead_seq
channel 2 => inst pad  seq lead_seq:oct(-1)
channel 3 => inst bass seq bass_seq

play
`,
    },
  ],
  defaults: {
    instruments: 'ay-basic-instruments',
    effects: 'ay-basic-effects',
    structure: 'ay-basic-structure',
  },
};

export const aySongWizard: ChipNewSongWizard = {
  metadata: {
    chipDisplayName: 'AY-3-8910 / YM2149',
    platform: 'Atari ST / MSX',
    year: '1980s',
    channelSummary: '3 PSG channels with tone+noise mixer and envelope generator',
    image,
  },
  templates: commonTemplates,
  consoleVariants: [
    {
      chipId: 'atari-st',
      metadata: {
        chipDisplayName: 'AY-3-8910 (Atari ST)',
        platform: 'Atari ST',
        year: '1985',
        channelSummary: '3 PSG channels, YM2149 envelope + shared noise',
        image,
      },
      templates: commonTemplates,
    },
    {
      chipId: 'msx',
      metadata: {
        chipDisplayName: 'AY-3-8910 (MSX)',
        platform: 'MSX / MSX2',
        year: '1983',
        channelSummary: '3 PSG channels, AY/YM envelope + shared noise',
        image,
      },
      templates: commonTemplates,
    },
  ],
};
