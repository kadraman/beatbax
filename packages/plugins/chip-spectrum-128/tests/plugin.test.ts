import spectrumPlugin, { SPECTRUM_TYPES } from '../src/index.js';

// Minimal mock AudioContext for tests
class MockAudioContext {
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: jest.fn() },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      _baseFreq: 0,
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
        setValueCurveAtTime: jest.fn(),
      },
      connect: jest.fn(),
    };
  }
  get destination() {
    return { connect: jest.fn() };
  }
}

describe('spectrumPlugin metadata', () => {
  test('name is spectrum-128', () => {
    expect(spectrumPlugin.name).toBe('spectrum-128');
  });

  test('has 3 channels', () => {
    expect(spectrumPlugin.channels).toBe(3);
  });

  test('version is defined', () => {
    expect(spectrumPlugin.version).toBeDefined();
    expect(typeof spectrumPlugin.version).toBe('string');
  });

  test('has uiContributions', () => {
    expect(spectrumPlugin.uiContributions).toBeDefined();
    expect(spectrumPlugin.uiContributions?.copilotSystemPrompt).toBeTruthy();
    const instrumentsSection = spectrumPlugin.uiContributions?.helpSections?.find(
      (s) => s.id === 'instruments',
    );
    expect(instrumentsSection).toBeDefined();
    expect(instrumentsSection?.title).toMatch(/Instruments/i);
    expect(instrumentsSection?.content.length).toBeGreaterThan(1);
  });

  test('buildHelpSections uses platform-specific instruments title', () => {
    const build = spectrumPlugin.uiContributions?.buildHelpSections;
    expect(build).toBeDefined();

    const spectrumTitle = build!({ chip: 'spectrum-128' }).find((s) => s.id === 'instruments')?.title;
    expect(spectrumTitle).toBe('Instruments (ZX Spectrum 128 / AY-3-8912)');

    const cpcTitle = build!({ chip: 'cpc' }).find((s) => s.id === 'instruments')?.title;
    expect(cpcTitle).toBe('Instruments (Amstrad CPC / AY-3-8912)');

    const aliasTitle = build!({ chip: 'amstrad-cpc' }).find((s) => s.id === 'instruments')?.title;
    expect(aliasTitle).toBe('Instruments (Amstrad CPC / AY-3-8912)');

    const legacyTitle = build!({ chip: 'spectrum-128', chipRegion: 'cpc' }).find((s) => s.id === 'instruments')?.title;
    expect(legacyTitle).toBe('Instruments (Amstrad CPC / AY-3-8912)');
  });

  test('has newSongWizard with Spectrum and CPC variants', () => {
    expect(spectrumPlugin.newSongWizard).toBeDefined();
    expect(spectrumPlugin.newSongWizard?.consoleVariants).toHaveLength(2);
    const cpcVariant = spectrumPlugin.newSongWizard?.consoleVariants?.find((v) => v.chipId === 'cpc');
    expect(cpcVariant).toBeDefined();
    expect(cpcVariant?.metadata.platform).toContain('Amstrad CPC');
  });

  test('aliases include ay, spectrum, and cpc targets', () => {
    expect(spectrumPlugin.aliases).toContain('ay');
    expect(spectrumPlugin.aliases).toContain('spectrum');
    expect(spectrumPlugin.aliases).toContain('cpc');
    expect(spectrumPlugin.aliases).toContain('amstrad-cpc');
  });
});

describe('spectrumPlugin.validateInstrument', () => {
  test('valid tone1 instrument passes', () => {
    const errors = spectrumPlugin.validateInstrument({ type: 'tone1', vol: 12 } as any);
    expect(errors).toHaveLength(0);
  });

  test('unknown type returns error', () => {
    const errors = spectrumPlugin.validateInstrument({ type: 'noise' } as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('type');
  });

  test('vol out of range returns error', () => {
    const errors = spectrumPlugin.validateInstrument({ type: 'tone1', vol: 20 } as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('vol');
  });

  test('noise_rate out of range returns error', () => {
    const errors = spectrumPlugin.validateInstrument({
      type: 'tone2',
      noise_rate: 50,
    } as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('noise_rate');
  });

  test('invalid chipRegion returns error', () => {
    const errors = spectrumPlugin.validateInstrument({
      type: 'tone1',
      chipRegion: 'atari-st',
    } as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('chipRegion');
  });

  test('unsupported sweep field returns error', () => {
    const errors = spectrumPlugin.validateInstrument({
      type: 'tone1',
      sweep: true,
    } as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('sweep');
  });

  test('SMS noise_rate_env field returns error', () => {
    const errors = spectrumPlugin.validateInstrument({
      type: 'tone3',
      tone_mix: true,
      noise_rate: 2,
      noise_rate_env: [0, 1, 2],
    } as any);
    expect(errors.some(e => e.field === 'noise_rate_env')).toBe(true);
  });

  test('env_shape without env_bass returns error', () => {
    const errors = spectrumPlugin.validateInstrument({
      type: 'tone3',
      env_shape: 10,
    } as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('env_shape');
  });

  test('env_shape out of range returns error', () => {
    const errors = spectrumPlugin.validateInstrument({
      type: 'tone3',
      env_bass: true,
      env_shape: 20,
    } as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('env_shape');
  });

  test('env_bass with env_shape=10 passes', () => {
    const errors = spectrumPlugin.validateInstrument({
      type: 'tone3',
      env_bass: true,
      env_shape: 10,
    } as any);
    expect(errors).toHaveLength(0);
  });
});

describe('spectrumPlugin.createChannel', () => {
  const ctx = new MockAudioContext() as unknown as BaseAudioContext;

  beforeEach(() => {
    spectrumPlugin.beginSongSession();
  });

  test('creates channel 0 (A) successfully', () => {
    const ch = spectrumPlugin.createChannel(0, ctx);
    expect(ch).toBeDefined();
    expect(typeof ch.noteOn).toBe('function');
    expect(typeof ch.noteOff).toBe('function');
    expect(typeof ch.render).toBe('function');
  });

  test('creates all three channels', () => {
    for (let i = 0; i < 3; i++) {
      const ch = spectrumPlugin.createChannel(i, ctx);
      expect(ch).toBeDefined();
    }
  });

  test('throws for invalid channel index', () => {
    expect(() => spectrumPlugin.createChannel(3, ctx)).toThrow();
    expect(() => spectrumPlugin.createChannel(-1, ctx)).toThrow();
  });

  test('channel supports noteOn and noteOff', () => {
    const ch = spectrumPlugin.createChannel(0, ctx);
    expect(() => ch.noteOn(440, { type: 'tone1', vol: 12 } as any)).not.toThrow();
    expect(() => ch.noteOff()).not.toThrow();
  });

  test('channel renders without throwing', () => {
    const ch = spectrumPlugin.createChannel(0, ctx);
    ch.noteOn(440, { type: 'tone1', vol: 12 } as any);
    const buf = new Float32Array(512);
    expect(() => ch.render(buf, 44100)).not.toThrow();
  });
});

describe('spectrumPlugin.configureForSong', () => {
  test('sets spectrum-128 region by default', () => {
    spectrumPlugin.configureForSong({ chip: 'spectrum-128' });
    // Verify via getPlatformProfile
    const { getPlatformProfile } = require('../src/platform-profiles.js');
    expect(getPlatformProfile().ayClockHz).toBe(1_773_400);
  });

  test('sets cpc region when chip is cpc alias', () => {
    spectrumPlugin.configureForSong({ chip: 'cpc' });
    const { getPlatformProfile } = require('../src/platform-profiles.js');
    expect(getPlatformProfile().ayClockHz).toBe(1_000_000);
  });

  test('sets cpc region when chip is amstrad-cpc alias', () => {
    spectrumPlugin.configureForSong({ chip: 'amstrad-cpc' });
    const { getPlatformProfile } = require('../src/platform-profiles.js');
    expect(getPlatformProfile().ayClockHz).toBe(1_000_000);
  });

  test('sets cpc region when chipRegion is cpc (legacy)', () => {
    spectrumPlugin.configureForSong({ chip: 'spectrum-128', chipRegion: 'cpc' });
    const { getPlatformProfile } = require('../src/platform-profiles.js');
    expect(getPlatformProfile().ayClockHz).toBe(1_000_000);
  });
});

describe('SPECTRUM_TYPES', () => {
  test('contains tone1, tone2, tone3', () => {
    expect(SPECTRUM_TYPES.has('tone1')).toBe(true);
    expect(SPECTRUM_TYPES.has('tone2')).toBe(true);
    expect(SPECTRUM_TYPES.has('tone3')).toBe(true);
  });

  test('does not contain noise (SMS type)', () => {
    expect(SPECTRUM_TYPES.has('noise')).toBe(false);
  });
});
