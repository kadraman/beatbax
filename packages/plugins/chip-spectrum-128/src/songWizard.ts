/**
 * New Song Wizard metadata and starter templates for the Spectrum 128 plugin.
 *
 * Two console variants are exposed:
 *  1. ZX Spectrum 128 (default clock 1,773,400 Hz)
 *  2. Amstrad CPC     (clock 1,000,000 Hz, chipRegion=cpc)
 */
import type { ChipNewSongWizard } from '@beatbax/engine';

// ── Spectrum 128 chip image (16×16 placeholder — replaced by /chips/spectrum-128/chip-image.png) ──
const SPECTRUM_128_IMAGE = '/chips/spectrum-128/chip-image.png';
const CPC_IMAGE = '/chips/spectrum-128/chip-image-cpc.png';

// ── Shared starter templates ─────────────────────────────────────────────────

const SPECTRUM_INSTRUMENTS = {
  instruments: [
    {
      id: 'lead-harmony-bass',
      label: 'Lead + Harmony + Bass',
      content: [
        'inst lead type=tone1 vol=12 arp_env=[0,4,7|0]',
        'inst harm type=tone2 vol=10',
        'inst bass type=tone3 vol=14',
      ].join('\n'),
    },
    {
      id: 'melody-drums',
      label: 'Melody + Multiplexed Drums',
      content: [
        'inst lead  type=tone1 vol=13',
        '; Same noise_rate for all percussion — stagger hits to avoid R6 conflict',
        'inst kick  type=tone3 vol=15 tone_mix=true noise_rate=10',
        'inst snare type=tone2 vol=12 tone_mix=true noise_rate=10',
      ].join('\n'),
    },
    {
      id: 'buzz-bass',
      label: 'Lead + Harmony + Buzz Bass',
      content: [
        'inst lead type=tone1 vol=12 arp_env=[0,4,7|0]',
        'inst harm type=tone2 vol=10',
        '; env_bass uses hardware envelope as oscillator — do NOT add vol_env elsewhere',
        'inst bass type=tone3 env_bass=true',
      ].join('\n'),
    },
    {
      id: 'envelope-lead',
      label: 'Lead with Hardware Envelope',
      content: [
        '; ONE vol_env active at a time (global R11–R13)',
        'inst lead type=tone1 vol_env=[15,12,9,6,3,0]',
        'inst harm type=tone2 vol=10',
        'inst bass type=tone3 vol=12',
      ].join('\n'),
    },
  ],
  effects: [
    {
      id: 'none',
      label: 'No effects',
      content: '',
    },
    {
      id: 'arpeggio',
      label: 'Arpeggio',
      content: [
        '; Add to your tone instrument:',
        '; arp_env=[0,4,7|0]   — major chord arpeggio (loops)',
        '; arp_env=[0,3,7|0]   — minor chord arpeggio',
        '; arp_env=[0,4,7,12]  — major + octave (no loop)',
      ].join('\n'),
    },
    {
      id: 'pitch-bend',
      label: 'Pitch Bend',
      content: [
        '; Add to your tone instrument:',
        '; pitch_env=[0,-1,-2,-3,-2,-1,0]  — vibrato-style bend',
        '; pitch_env=[0,2,4,2,0,-2,-4,-2|0] — wider vibrato loop',
      ].join('\n'),
    },
    {
      id: 'vol-slide',
      label: 'Volume Fade (software)',
      content: [
        '; Software volume fade — works independently per channel:',
        '; vol_env=[15,12,9,6,3,0]  — fast decay (hardware, GLOBAL)',
        '',
        '; For independent per-channel decay, use BeatBax volSlide effect',
        '; instead of vol_env to avoid R11–R13 conflicts.',
      ].join('\n'),
    },
  ],
  structure: [
    {
      id: 'single-pattern',
      label: 'Single Pattern',
      content: [
        'pat melody = C4 E4 G4 C5 B4 G4 E4 .',
        'pat bass   = C2 . . . G1 . . .',
        '',
        'channel 1 => inst lead pat melody',
        'channel 2 => inst harm pat bass',
        'channel 3 => inst bass pat bass',
        '',
        'play',
      ].join('\n'),
    },
    {
      id: 'verse-chorus',
      label: 'Verse + Chorus',
      content: [
        'pat verse_a = C4 D4 E4 F4 G4 . . .',
        'pat verse_b = C3 . . . G2 . . .',
        'pat chorus_a = C5 E5 G5 C6 . . . .',
        'pat chorus_b = C2 . . . C2 . . .',
        '',
        'seq verse  = verse_a verse_a',
        'seq chorus = chorus_a chorus_a',
        '',
        'channel 1 => inst lead  seq verse seq chorus seq verse seq chorus',
        'channel 2 => inst harm  seq verse seq chorus seq verse seq chorus',
        'channel 3 => inst bass  seq verse seq chorus seq verse seq chorus',
        '',
        'play',
      ].join('\n'),
    },
    {
      id: 'drums-melody',
      label: 'Drums + Melody',
      content: [
        'pat kick  = C2 . . . . . . .',
        'pat snare = . . . D3 . . . .',
        'pat hat   = . F4 . . F4 . . F4',
        'pat melody = C4 E4 G4 C5 B4 G4 E4 .',
        '',
        'channel 1 => inst hat   pat hat',
        'channel 2 => inst snare pat snare',
        'channel 3 => inst kick  pat kick',
        '',
        'play',
      ].join('\n'),
    },
  ],
  defaults: {
    instruments: 'lead-harmony-bass',
    effects: 'none',
    structure: 'single-pattern',
  },
};

// ── Song Wizard export ────────────────────────────────────────────────────────

export const spectrumSongWizard: ChipNewSongWizard = {
  metadata: {
    chipDisplayName: 'ZX Spectrum 128',
    platform: 'ZX Spectrum 128',
    year: '1985',
    channelSummary: '3 × Square Wave + Shared Noise + Shared Envelope',
    image: SPECTRUM_128_IMAGE,
  },
  templates: SPECTRUM_INSTRUMENTS,
  consoleVariants: [
    {
      chipId: 'spectrum-128',
      metadata: {
        chipDisplayName: 'ZX Spectrum 128',
        platform: 'ZX Spectrum 128',
        year: '1985',
        channelSummary: '3 × Square Wave (AY-3-8912, 1.7734 MHz)',
        image: SPECTRUM_128_IMAGE,
      },
      templates: SPECTRUM_INSTRUMENTS,
    },
    {
      chipId: 'spectrum-128',
      metadata: {
        chipDisplayName: 'Amstrad CPC',
        platform: 'Amstrad CPC 464/6128',
        year: '1984',
        channelSummary: '3 × Square Wave (AY-3-8912, 1.0 MHz)',
        image: CPC_IMAGE,
      },
      templates: {
        instruments: SPECTRUM_INSTRUMENTS.instruments,
        effects: SPECTRUM_INSTRUMENTS.effects,
        structure: SPECTRUM_INSTRUMENTS.structure,
        defaults: {
          instruments: 'lead-harmony-bass',
          effects: 'none',
          structure: 'single-pattern',
        },
      },
    },
  ],
};
