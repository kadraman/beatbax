/**
 * NES chip plugin integration tests.
 * Tests registration, channel creation, instrument validation, and audio rendering.
 */
import nesPlugin, { PULSE_PERIOD, TRIANGLE_PERIOD, NES_MIX_GAIN } from '../src/index.js';
import { validateNesInstrument } from '../src/validate.js';
import { NESPulseBackend } from '../src/pulse.js';
import { NESTriangleBackend } from '../src/triangle.js';
import { NESNoiseBackend } from '../src/noise.js';
import { NESDMCBackend, decodeDMC } from '../src/dmc.js';
import { ChipRegistry } from '@beatbax/engine';
import { noteNameToMidi, pulsePeriodToFreq, trianglePeriodToFreq } from '../src/periodTables.js';

const MOCK_AUDIO_CONTEXT = {} as BaseAudioContext;

// ─── Plugin metadata ──────────────────────────────────────────────────────────

describe('NES plugin metadata', () => {
  test('name is nes', () => {
    expect(nesPlugin.name).toBe('nes');
  });

  test('has 5 channels', () => {
    expect(nesPlugin.channels).toBe(5);
  });

  test('version is defined', () => {
    expect(nesPlugin.version).toBeDefined();
  });

  test('bundledSamples includes kick, snare, hihat, crash, bass_c2', () => {
    expect(nesPlugin.bundledSamples).toBeDefined();
    expect(nesPlugin.bundledSamples!['kick']).toBeDefined();
    expect(nesPlugin.bundledSamples!['snare']).toBeDefined();
    expect(nesPlugin.bundledSamples!['hihat']).toBeDefined();
    expect(nesPlugin.bundledSamples!['crash']).toBeDefined();
    expect(nesPlugin.bundledSamples!['bass_c2']).toBeDefined();
  });
});

// ─── Registry integration ─────────────────────────────────────────────────────

describe('NES plugin registration', () => {
  test('can be registered with a fresh ChipRegistry', () => {
    const reg = new ChipRegistry();
    reg.register(nesPlugin);
    expect(reg.has('nes')).toBe(true);
  });

  test('get() returns the NES plugin', () => {
    const reg = new ChipRegistry();
    reg.register(nesPlugin);
    expect(reg.get('nes')).toBe(nesPlugin);
  });

  test('registering twice throws', () => {
    const reg = new ChipRegistry();
    reg.register(nesPlugin);
    expect(() => reg.register(nesPlugin)).toThrow('already registered');
  });

  test('creating all 5 channels succeeds', () => {
    for (let i = 0; i < 5; i++) {
      const backend = nesPlugin.createChannel(i, MOCK_AUDIO_CONTEXT);
      expect(typeof backend.reset).toBe('function');
      expect(typeof backend.noteOn).toBe('function');
      expect(typeof backend.noteOff).toBe('function');
      expect(typeof backend.applyEnvelope).toBe('function');
      expect(typeof backend.render).toBe('function');
    }
  });

  test('invalid channel index throws', () => {
    expect(() => nesPlugin.createChannel(5, MOCK_AUDIO_CONTEXT)).toThrow('invalid channel index');
    expect(() => nesPlugin.createChannel(-1, MOCK_AUDIO_CONTEXT)).toThrow('invalid channel index');
  });
});

// ─── Period tables ────────────────────────────────────────────────────────────

describe('NES period tables', () => {
  test('A4 pulse period is 253', () => {
    expect(PULSE_PERIOD[69]).toBe(253);
  });

  test('A4 triangle period is 126', () => {
    expect(TRIANGLE_PERIOD[69]).toBe(126);
  });

  test('A4 pulse frequency is approximately 440 Hz', () => {
    const freq = pulsePeriodToFreq(PULSE_PERIOD[69]);
    expect(Math.abs(freq - 440)).toBeLessThan(1); // within 1 Hz
  });

  test('A4 triangle frequency is approximately 440 Hz', () => {
    const freq = trianglePeriodToFreq(TRIANGLE_PERIOD[69]);
    expect(Math.abs(freq - 440)).toBeLessThan(1);
  });

  test('all MIDI notes 36–96 are defined in PULSE_PERIOD', () => {
    for (let midi = 36; midi <= 96; midi++) {
      expect(PULSE_PERIOD[midi]).toBeDefined();
    }
  });

  test('all MIDI notes 36–96 are defined in TRIANGLE_PERIOD', () => {
    for (let midi = 36; midi <= 96; midi++) {
      expect(TRIANGLE_PERIOD[midi]).toBeDefined();
    }
  });

  test('pulse period values are within 11-bit range (0–2047)', () => {
    for (const period of Object.values(PULSE_PERIOD)) {
      expect(period).toBeGreaterThanOrEqual(0);
      expect(period).toBeLessThanOrEqual(2047);
    }
  });

  test('triangle period ≈ pulse period / 2 for same MIDI note', () => {
    for (let midi = 36; midi <= 96; midi++) {
      const ratio = PULSE_PERIOD[midi] / TRIANGLE_PERIOD[midi];
      // Should be approximately 2 (±20% tolerance for rounding)
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(2.5);
    }
  });

  test('pulse frequency accuracy within ±5 cents of equal temperament', () => {
    for (let midi = 45; midi <= 84; midi++) { // C3–C6 reliable range
      const period = PULSE_PERIOD[midi];
      const actualFreq = pulsePeriodToFreq(period);
      const targetFreq = 440 * Math.pow(2, (midi - 69) / 12);
      const cents = Math.abs(1200 * Math.log2(actualFreq / targetFreq));
      expect(cents).toBeLessThan(5);
    }
  });

  test('noteNameToMidi works for standard notes', () => {
    expect(noteNameToMidi('A', 4)).toBe(69);
    expect(noteNameToMidi('C', 4)).toBe(60);
    expect(noteNameToMidi('C', 2)).toBe(36);
    expect(noteNameToMidi('C', 7)).toBe(96);
    // Sharps and flats
    expect(noteNameToMidi('C#', 4)).toBe(61);
    expect(noteNameToMidi('DB', 4)).toBe(61); // Db = C#
  });
});

// ─── Pulse channel ────────────────────────────────────────────────────────────

describe('NES pulse channel', () => {
  let backend: NESPulseBackend;

  beforeEach(() => {
    backend = new NESPulseBackend('pulse1');
  });

  test('is silent before noteOn', () => {
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('renders non-zero audio after noteOn', () => {
    backend.noteOn(440, { type: 'pulse1', duty: '50' });
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.some(s => s !== 0)).toBe(true);
  });

  test('is silent after noteOff', () => {
    backend.noteOn(440, { type: 'pulse1', duty: '50' });
    backend.noteOff();
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('is silent after reset', () => {
    backend.noteOn(440, { type: 'pulse1', duty: '50' });
    backend.reset();
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('12.5% duty produces approximately 1/8 duty ratio', () => {
    backend.noteOn(440, { type: 'pulse1', duty: '12.5' });
    const buf = new Float32Array(44100); // 1 second
    backend.render(buf, 44100);
    const positiveCount = buf.filter(s => s > 0).length;
    const ratio = positiveCount / buf.length;
    // At 12.5% duty (1 high step out of 8), ratio ≈ 0.125
    expect(ratio).toBeGreaterThan(0.1);
    expect(ratio).toBeLessThan(0.2);
  });

  test('50% duty produces approximately 50% duty ratio', () => {
    backend.noteOn(440, { type: 'pulse1', duty: '50' });
    const buf = new Float32Array(44100);
    backend.render(buf, 44100);
    const positiveCount = buf.filter(s => s > 0).length;
    const ratio = positiveCount / buf.length;
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
  });

  test('period < 8 causes channel to be muted', () => {
    // Very high frequency → very low period register value → period < 8
    // period = 1789773 / (16 * freq) - 1 < 8  =>  freq > 1789773 / 144 ≈ 12428 Hz
    backend.noteOn(20000, { type: 'pulse1', duty: '50' });
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('applyEnvelope decrements volume over time', () => {
    // Use env_period=1 so the divider = 2 (env decrements every 2 frames)
    backend.noteOn(440, { type: 'pulse1', duty: '50', env: '15,down', env_period: 1 });
    // Apply many frames to drive volume down to near 0
    for (let i = 0; i < 100; i++) backend.applyEnvelope(i);
    const buf1 = new Float32Array(64);
    backend.render(buf1, 44100);
    const max1 = Math.max(...buf1.map(Math.abs));

    // Restart with fresh backend and envelope that keeps volume at max
    const b2 = new NESPulseBackend('pulse1');
    b2.noteOn(440, { type: 'pulse1', duty: '50', vol: 15 });
    const buf2 = new Float32Array(64);
    b2.render(buf2, 44100);
    const max2 = Math.max(...buf2.map(Math.abs));

    // After many envelope frames, volume should be lower
    expect(max1).toBeLessThan(max2);
  });

  test('vol field sets constant volume', () => {
    const b1 = new NESPulseBackend('pulse1');
    b1.noteOn(440, { type: 'pulse1', duty: '50', vol: 15 });
    const buf1 = new Float32Array(256);
    b1.render(buf1, 44100);

    const b2 = new NESPulseBackend('pulse1');
    b2.noteOn(440, { type: 'pulse1', duty: '50', vol: 7 });
    const buf2 = new Float32Array(256);
    b2.render(buf2, 44100);

    const max1 = Math.max(...buf1.map(Math.abs));
    const max2 = Math.max(...buf2.map(Math.abs));
    // vol=15 should be louder than vol=7
    expect(max1).toBeGreaterThan(max2);
  });
});

// ─── Triangle channel ─────────────────────────────────────────────────────────

describe('NES triangle channel', () => {
  let backend: NESTriangleBackend;

  beforeEach(() => {
    backend = new NESTriangleBackend();
  });

  test('is silent before noteOn', () => {
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('renders non-zero audio after noteOn', () => {
    backend.noteOn(440, { type: 'triangle' });
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.some(s => s !== 0)).toBe(true);
  });

  test('vol=0 silences the channel', () => {
    backend.noteOn(440, { type: 'triangle', vol: 0 });
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('is silent after noteOff', () => {
    backend.noteOn(440, { type: 'triangle' });
    backend.noteOff();
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('linear counter limits note duration', () => {
    // linear=1 → 1/240 second ≈ 184 samples at 44100 Hz
    backend.noteOn(440, { type: 'triangle', linear: 1 });
    const buf = new Float32Array(44100); // 1 second
    backend.render(buf, 44100);

    // Most of the buffer after the linear counter expires should be 0
    const expectedZeroStart = Math.floor(44100 / 240) + 50;
    let nonZeroAfterExpiry = 0;
    for (let i = expectedZeroStart; i < buf.length; i++) {
      if (buf[i] !== 0) nonZeroAfterExpiry++;
    }
    expect(nonZeroAfterExpiry).toBe(0);
  });
});

// ─── Noise channel ────────────────────────────────────────────────────────────

describe('NES noise channel', () => {
  let backend: NESNoiseBackend;

  beforeEach(() => {
    backend = new NESNoiseBackend();
  });

  test('is silent before noteOn', () => {
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('renders non-zero audio after noteOn', () => {
    backend.noteOn(0, { type: 'noise', noise_mode: 'normal', noise_period: 8 });
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.some(s => s !== 0)).toBe(true);
  });

  test('normal mode and loop mode produce different output', () => {
    const b1 = new NESNoiseBackend();
    b1.noteOn(0, { type: 'noise', noise_mode: 'normal', noise_period: 8 });
    const buf1 = new Float32Array(2048);
    b1.render(buf1, 44100);

    const b2 = new NESNoiseBackend();
    b2.noteOn(0, { type: 'noise', noise_mode: 'loop', noise_period: 8 });
    const buf2 = new Float32Array(2048);
    b2.render(buf2, 44100);

    // Should not be identical
    const allSame = buf1.every((v, i) => v === buf2[i]);
    expect(allSame).toBe(false);
  });

  test('is silent after noteOff', () => {
    backend.noteOn(0, { type: 'noise', noise_mode: 'normal', noise_period: 8 });
    backend.noteOff();
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('different noise_period values produce different output', () => {
    const b1 = new NESNoiseBackend();
    b1.noteOn(0, { type: 'noise', noise_mode: 'normal', noise_period: 1 });
    const buf1 = new Float32Array(2048);
    b1.render(buf1, 44100);

    const b2 = new NESNoiseBackend();
    b2.noteOn(0, { type: 'noise', noise_mode: 'normal', noise_period: 15 });
    const buf2 = new Float32Array(2048);
    b2.render(buf2, 44100);

    const allSame = buf1.every((v, i) => v === buf2[i]);
    expect(allSame).toBe(false);
  });
});

// ─── DMC channel ─────────────────────────────────────────────────────────────

describe('NES DMC channel', () => {
  test('is silent before noteOn', () => {
    const backend = new NESDMCBackend();
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('renders sample data after manual injection', () => {
    const backend = new NESDMCBackend();
    // Manually inject sample data (bypasses async loading)
    const sampleData = new Float32Array(256).fill(0.5);
    backend.loadSampleForTest(sampleData);
    backend.noteOn(0, { type: 'dmc', dmc_rate: 7 });

    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.some(s => s !== 0)).toBe(true);
  });

  test('decodeDMC produces float samples', () => {
    const testData = new Uint8Array([0xFF, 0xAA, 0x55, 0x00]);
    const decoded = decodeDMC(testData);
    expect(decoded.length).toBe(32); // 4 bytes × 8 bits
    expect(decoded.every(s => s >= -1 && s <= 1)).toBe(true);
  });

  test('loop=true repeats the sample', () => {
    const backend = new NESDMCBackend();
    const sampleData = new Float32Array(100).fill(0.3);
    backend.loadSampleForTest(sampleData);
    backend.noteOn(0, { type: 'dmc', dmc_rate: 15, dmc_loop: true });

    // Render more than one sample length
    const buf = new Float32Array(44100);
    backend.render(buf, 44100);
    // With loop, the entire buffer should be non-zero
    const nonZeroCount = buf.filter(s => s !== 0).length;
    expect(nonZeroCount).toBeGreaterThan(buf.length * 0.5);
  });

  test('is silent after noteOff', () => {
    const backend = new NESDMCBackend();
    const sampleData = new Float32Array(256).fill(0.5);
    backend.loadSampleForTest(sampleData);
    backend.noteOn(0, { type: 'dmc', dmc_rate: 7 });
    backend.noteOff();
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });
});

// ─── DMC sample resolution ────────────────────────────────────────────────────

describe('NES DMC sample resolution', () => {
  test('@nes/kick resolves from bundled library', async () => {
    const { resolveDMCSample } = await import('../src/dmc.js');
    const samples = await resolveDMCSample('@nes/kick');
    expect(samples).toBeInstanceOf(Float32Array);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every(s => s >= -1 && s <= 1)).toBe(true);
  });

  test('unknown @nes/ sample throws', async () => {
    const { resolveDMCSample } = await import('../src/dmc.js');
    await expect(resolveDMCSample('@nes/nonexistent')).rejects.toThrow('not found');
  });

  test('local: path with .. throws path traversal error', async () => {
    const { resolveDMCSample } = await import('../src/dmc.js');
    // This would be blocked in both browser and Node.js
    await expect(resolveDMCSample('local:../../../etc/passwd')).rejects.toThrow();
  });

  test('unsupported scheme throws', async () => {
    const { resolveDMCSample } = await import('../src/dmc.js');
    await expect(resolveDMCSample('ftp://example.com/sample.dmc')).rejects.toThrow('unsupported');
  });
});

// ─── Instrument validation ────────────────────────────────────────────────────

describe('NES instrument validation', () => {
  test('accepts valid pulse1 instrument', () => {
    const errors = validateNesInstrument({ type: 'pulse1', duty: '50', env: '13,down', env_period: 2 });
    expect(errors).toHaveLength(0);
  });

  test('accepts valid pulse2 instrument', () => {
    const errors = validateNesInstrument({ type: 'pulse2', duty: '25', vol: 10 });
    expect(errors).toHaveLength(0);
  });

  test('accepts valid triangle instrument', () => {
    const errors = validateNesInstrument({ type: 'triangle' });
    expect(errors).toHaveLength(0);
  });

  test('accepts valid triangle with linear counter', () => {
    const errors = validateNesInstrument({ type: 'triangle', linear: 4 });
    expect(errors).toHaveLength(0);
  });

  test('accepts valid noise instrument', () => {
    const errors = validateNesInstrument({
      type: 'noise',
      noise_mode: 'normal',
      noise_period: 8,
      env: '15,down',
      env_period: 3
    });
    expect(errors).toHaveLength(0);
  });

  test('accepts valid DMC instrument', () => {
    const errors = validateNesInstrument({
      type: 'dmc',
      dmc_rate: 7,
      dmc_loop: false,
      dmc_sample: '@nes/kick'
    });
    expect(errors).toHaveLength(0);
  });

  test('rejects unknown type', () => {
    const errors = validateNesInstrument({ type: 'unknown_chip' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('type');
  });

  test('rejects invalid duty for pulse', () => {
    const errors = validateNesInstrument({ type: 'pulse1', duty: '33' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('duty');
  });

  test('rejects noise_period > 15', () => {
    const errors = validateNesInstrument({ type: 'noise', noise_period: 16 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('noise_period');
  });

  test('rejects noise_mode other than normal/loop', () => {
    const errors = validateNesInstrument({ type: 'noise', noise_mode: 'periodic' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('noise_mode');
  });

  test('rejects invalid DMC sample scheme', () => {
    const errors = validateNesInstrument({ type: 'dmc', dmc_sample: 'file:///etc/passwd' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('dmc_sample');
  });

  test('rejects DMC sample with path traversal', () => {
    const errors = validateNesInstrument({ type: 'dmc', dmc_sample: 'local:../../etc/passwd' });
    const traversalError = errors.find(e => e.message.includes('path traversal'));
    expect(traversalError).toBeDefined();
  });

  test('rejects dmc_rate > 15', () => {
    const errors = validateNesInstrument({ type: 'dmc', dmc_rate: 16 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('dmc_rate');
  });

  test('rejects linear > 127 for triangle', () => {
    const errors = validateNesInstrument({ type: 'triangle', linear: 128 });
    expect(errors.length).toBeGreaterThan(0);
  });

  test('accepts linear=0 for triangle (infinite duration)', () => {
    const errors = validateNesInstrument({ type: 'triangle', linear: 0 });
    expect(errors).toHaveLength(0);
  });

  test('rejects sweep_period > 7', () => {
    const errors = validateNesInstrument({ type: 'pulse1', sweep_en: true, sweep_period: 8 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('sweep_period');
  });

  test('rejects invalid sweep_dir', () => {
    const errors = validateNesInstrument({ type: 'pulse1', sweep_en: true, sweep_dir: 'sideways' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('sweep_dir');
  });
});

// ─── Mixer ────────────────────────────────────────────────────────────────────

describe('NES mixer gain weights', () => {
  test('pulse gain is defined', () => {
    expect(NES_MIX_GAIN.pulse).toBeGreaterThan(0);
  });

  test('pulse channels are weighted higher than noise', () => {
    // Pulse at full (15) vs noise at full (15)
    const pulseOutput = NES_MIX_GAIN.pulse * 15;
    const noiseOutput = NES_MIX_GAIN.noise * 15;
    expect(pulseOutput).toBeGreaterThan(noiseOutput);
  });

  test('total max output does not clip (< 1.0)', async () => {
    const { nesMix } = await import('../src/mixer.js');
    const maxOut = nesMix(15, 15, 15, 15, 127);
    expect(maxOut).toBeLessThan(1.0);
  });
});
