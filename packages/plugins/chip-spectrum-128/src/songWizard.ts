/**
 * New Song Wizard metadata and starter templates for the Spectrum 128 plugin.
 *
 * Two console variants are exposed:
 *  1. ZX Spectrum 128 (default clock 1,773,400 Hz)
 *  2. Amstrad CPC     (clock 1,000,000 Hz, `chip cpc`)
 */
import type { ChipNewSongWizard } from '@beatbax/engine';

export const SPECTRUM_128K_IMAGE_BASE64 =
'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';
export const AMSTRAD_CPC_IMAGE_BASE64 =
'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';

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
        '# Same noise_rate for all percussion — stagger hits to avoid R6 conflict',
        'inst kick  type=tone3 vol=15 tone=true tone_mix=true noise_rate=4 noise_frames=3 note=C3 pitch_env=[+5,+2,0,-2,-4,-6] vol_env=[15,12,9,6,3,0]',
        'inst snare type=tone2 vol=15 tone=true tone_mix=true noise_rate=6 tone_frames=1 tone_vol=4 note=E5 vol_env=[15,12,9,6,4,2,0]',
      ].join('\n'),
    },
    {
      id: 'buzz-bass',
      label: 'Lead + Harmony + Buzz Bass',
      content: [
        'inst lead type=tone1 vol=12 arp_env=[0,4,7|0]',
        'inst harm type=tone2 vol=10',
        '# env_bass uses hardware envelope as oscillator — do NOT add vol_env elsewhere',
        'inst bass type=tone3 env_bass=true',
      ].join('\n'),
    },
    {
      id: 'envelope-lead',
      label: 'Lead with Hardware Envelope',
      content: [
        '# ONE vol_env active at a time (global R11-R13)',
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
        '# Add to your tone instrument:',
        '# arp_env=[0,4,7|0]   — major chord arpeggio (loops)',
        '# arp_env=[0,3,7|0]   — minor chord arpeggio',
        '# arp_env=[0,4,7,12]  — major + octave (no loop)',
      ].join('\n'),
    },
    {
      id: 'pitch-bend',
      label: 'Pitch Bend',
      content: [
        '# Add to your tone instrument:',
        '# pitch_env=[0,-1,-2,-3,-2,-1,0]  — vibrato-style bend',
        '# pitch_env=[0,2,4,2,0,-2,-4,-2|0] — wider vibrato loop',
      ].join('\n'),
    },
    {
      id: 'vol-slide',
      label: 'Volume Fade (software)',
      content: [
        '# Software volume fade — works independently per channel:',
        '# vol_env=[15,12,9,6,3,0]  — fast decay (hardware, GLOBAL)',
        '',
        '# For independent per-channel decay, use BeatBax volSlide effect',
        '# instead of vol_env to avoid R11-R13 conflicts.',
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
    channelSummary: '3 x Square Wave + Shared Noise + Shared Envelope',
    image: SPECTRUM_128K_IMAGE_BASE64,
  },
  templates: SPECTRUM_INSTRUMENTS,
  consoleVariants: [
    {
      chipId: 'spectrum-128',
      metadata: {
        chipDisplayName: 'ZX Spectrum 128',
        platform: 'ZX Spectrum 128',
        year: '1985',
        channelSummary: '3 x Square Wave (AY-3-8912, 1.7734 MHz)',
        image: SPECTRUM_128K_IMAGE_BASE64,
      },
      templates: SPECTRUM_INSTRUMENTS,
    },
    {
      chipId: 'cpc',
      metadata: {
        chipDisplayName: 'Amstrad CPC',
        platform: 'Amstrad CPC 464/6128',
        year: '1984',
        channelSummary: '3 x Square Wave (AY-3-8912, 1.0 MHz)',
        image: AMSTRAD_CPC_IMAGE_BASE64,
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
