/**
 * Tests for the ChipRegistry and ChipPlugin system.
 */
import { ChipRegistry, chipRegistry, gameboyPlugin } from '../src/chips/index.js';
import type { ChipPlugin, ChipChannelBackend, ValidationError } from '../src/chips/types.js';
import { BeatBaxEngine } from '../src/engine.js';

// ─── Minimal mock plugin for testing ─────────────────────────────────────────

const mockBackend: ChipChannelBackend = {
  reset: jest.fn(),
  noteOn: jest.fn(),
  noteOff: jest.fn(),
  applyEnvelope: jest.fn(),
  render: jest.fn(),
};

function makeMockPlugin(name: string, channels = 2): ChipPlugin {
  return {
    name,
    version: '1.0.0',
    channels,
    validateInstrument: () => [],
    createChannel: () => mockBackend,
  };
}

// ─── ChipRegistry ─────────────────────────────────────────────────────────────

describe('ChipRegistry', () => {
  let reg: ChipRegistry;

  beforeEach(() => {
    reg = new ChipRegistry();
  });

  test('Game Boy is registered by default', () => {
    expect(reg.has('gameboy')).toBe(true);
  });

  test('list() returns registered chip names', () => {
    expect(reg.list()).toContain('gameboy');
  });

  test('get() returns the plugin object', () => {
    const p = reg.get('gameboy');
    expect(p).toBeDefined();
    expect(p!.name).toBe('gameboy');
  });

  test('register() adds a new plugin', () => {
    const mock = makeMockPlugin('nes');
    reg.register(mock);
    expect(reg.has('nes')).toBe(true);
    expect(reg.get('nes')).toBe(mock);
  });

  test('register() throws on duplicate name', () => {
    const mock = makeMockPlugin('nes');
    reg.register(mock);
    expect(() => reg.register(mock)).toThrow("already registered");
  });

  test('has() returns false for unknown chips', () => {
    expect(reg.has('sid')).toBe(false);
  });

  test('get() returns undefined for unknown chips', () => {
    expect(reg.get('sid')).toBeUndefined();
  });

  test('list() returns all registered names', () => {
    reg.register(makeMockPlugin('nes'));
    reg.register(makeMockPlugin('sid'));
    const names = reg.list();
    expect(names).toContain('gameboy');
    expect(names).toContain('nes');
    expect(names).toContain('sid');
  });
});

// ─── Global chipRegistry singleton ───────────────────────────────────────────

describe('chipRegistry singleton', () => {
  test('has gameboy built-in', () => {
    expect(chipRegistry.has('gameboy')).toBe(true);
  });

  test('returns gameboyPlugin from get()', () => {
    expect(chipRegistry.get('gameboy')).toBe(gameboyPlugin);
  });
});

// ─── Game Boy plugin ──────────────────────────────────────────────────────────

describe('gameboyPlugin', () => {
  test('has correct metadata', () => {
    expect(gameboyPlugin.name).toBe('gameboy');
    expect(gameboyPlugin.version).toBeDefined();
    expect(gameboyPlugin.channels).toBe(4);
  });

  test('createChannel returns a ChipChannelBackend', () => {
    const ctx = {} as BaseAudioContext;
    const backend = gameboyPlugin.createChannel(0, ctx);
    expect(typeof backend.reset).toBe('function');
    expect(typeof backend.noteOn).toBe('function');
    expect(typeof backend.noteOff).toBe('function');
    expect(typeof backend.applyEnvelope).toBe('function');
    expect(typeof backend.render).toBe('function');
  });

  test('channel backend renders pulse audio', () => {
    const ctx = {} as BaseAudioContext;
    const backend = gameboyPlugin.createChannel(0, ctx);
    backend.noteOn(440, { type: 'pulse1', duty: '50' });
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    // Should have non-zero samples after noteOn
    const nonZero = buf.some(s => s !== 0);
    expect(nonZero).toBe(true);
  });

  test('channel backend is silent after noteOff', () => {
    const ctx = {} as BaseAudioContext;
    const backend = gameboyPlugin.createChannel(0, ctx);
    backend.noteOn(440, { type: 'pulse1', duty: '50' });
    backend.noteOff();
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('channel backend is silent after reset', () => {
    const ctx = {} as BaseAudioContext;
    const backend = gameboyPlugin.createChannel(0, ctx);
    backend.noteOn(440, { type: 'pulse1', duty: '50' });
    backend.reset();
    const buf = new Float32Array(256);
    backend.render(buf, 44100);
    expect(buf.every(s => s === 0)).toBe(true);
  });

  test('validateInstrument accepts valid pulse1 instrument', () => {
    const errors = gameboyPlugin.validateInstrument({ type: 'pulse1', duty: '50' });
    expect(errors).toHaveLength(0);
  });

  test('validateInstrument accepts valid wave instrument', () => {
    const wave = Array.from({ length: 16 }, (_, i) => i);
    const errors = gameboyPlugin.validateInstrument({ type: 'wave', wave });
    expect(errors).toHaveLength(0);
  });

  test('validateInstrument rejects unknown type', () => {
    const errors: ValidationError[] = gameboyPlugin.validateInstrument({ type: 'sid-voice' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('type');
  });

  test('validateInstrument rejects wave without wave array', () => {
    const errors = gameboyPlugin.validateInstrument({ type: 'wave' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('wave');
  });

  test('validateInstrument rejects wave with wrong array length', () => {
    const errors = gameboyPlugin.validateInstrument({ type: 'wave', wave: [1, 2, 3] });
    expect(errors.length).toBeGreaterThan(0);
  });

  test('wave channel renders non-zero audio', () => {
    const ctx = {} as BaseAudioContext;
    const backend = gameboyPlugin.createChannel(2, ctx);
    const wave = [0, 3, 6, 9, 12, 9, 6, 3, 0, 3, 6, 9, 12, 9, 6, 3];
    backend.noteOn(440, { type: 'wave', wave });
    const buf = new Float32Array(512);
    backend.render(buf, 44100);
    expect(buf.some(s => s !== 0)).toBe(true);
  });

  test('noise channel renders non-zero audio', () => {
    const ctx = {} as BaseAudioContext;
    const backend = gameboyPlugin.createChannel(3, ctx);
    backend.noteOn(0, { type: 'noise', divisor: '3', shift: '4' });
    const buf = new Float32Array(512);
    backend.render(buf, 44100);
    expect(buf.some(s => s !== 0)).toBe(true);
  });
});

// ─── BeatBaxEngine ────────────────────────────────────────────────────────────

describe('BeatBaxEngine', () => {
  test('validateChip returns true for gameboy', () => {
    const engine = new BeatBaxEngine();
    expect(engine.validateChip('gameboy')).toBe(true);
  });

  test('validateChip returns false for unknown chip', () => {
    const engine = new BeatBaxEngine();
    expect(engine.validateChip('nonexistent')).toBe(false);
  });

  test('listChips includes gameboy', () => {
    const engine = new BeatBaxEngine();
    expect(engine.listChips()).toContain('gameboy');
  });

  test('registerChipPlugin makes chip available', () => {
    // Use a fresh registry to avoid polluting the global singleton
    const localReg = new ChipRegistry();
    const engine = new BeatBaxEngine();
    // Override private registry for test isolation
    (engine as any).registry = localReg;

    const mock = makeMockPlugin('test-chip-unique-abc');
    engine.registerChipPlugin(mock);
    expect(engine.validateChip('test-chip-unique-abc')).toBe(true);
    expect(engine.listChips()).toContain('test-chip-unique-abc');
  });

  test('registerChipPlugin throws on duplicate', () => {
    const localReg = new ChipRegistry();
    const engine = new BeatBaxEngine();
    (engine as any).registry = localReg;

    const mock = makeMockPlugin('dup-chip');
    engine.registerChipPlugin(mock);
    expect(() => engine.registerChipPlugin(mock)).toThrow("already registered");
  });
});
