/**
 * Unit tests for @beatbax/plugin-chip-sms.
 * Tests plugin registration, instrument validation, and channel creation.
 */
import { ChipRegistry } from '@beatbax/engine';
import smsPlugin from '../src/index.js';

describe('plugin metadata', () => {
  it('has a valid name', () => {
    expect(smsPlugin.name).toBe('sms');
  });

  it('has a valid version string', () => {
    expect(typeof smsPlugin.version).toBe('string');
    expect(smsPlugin.version.length).toBeGreaterThan(0);
  });

  it('has exactly 4 channels', () => {
    expect(smsPlugin.channels).toBe(4);
  });

  it('reports per-channel volume support', () => {
    expect(smsPlugin.supportsPerChannelVolume).toBe(true);
  });
});

describe('plugin registration', () => {
  it('registers without error', () => {
    const registry = new ChipRegistry();
    expect(() => registry.register(smsPlugin)).not.toThrow();
  });

  it('is retrievable after registration', () => {
    const registry = new ChipRegistry();
    registry.register(smsPlugin);
    expect(registry.has('sms')).toBe(true);
    expect(registry.get('sms')).toBe(smsPlugin);
  });

  it('should allow aliases to be registered', () => {
    const registry = new ChipRegistry();
    registry.register(smsPlugin);
    // Note: alias registration is done separately via registerAlias
    registry.registerAlias('sega', 'sms');
    expect(registry.has('sega')).toBe(true);
    expect(registry.resolve('sega')).toBe('sms');
  });
});

describe('channel creation', () => {
  const mockCtx = { destination: {}, currentTime: 0, sampleRate: 44100 } as any;

  it('creates a channel for each valid index', () => {
    for (let i = 0; i < 4; i++) {
      expect(() => smsPlugin.createChannel(i, mockCtx)).not.toThrow();
    }
  });

  it('throws for an out-of-range channel index', () => {
    expect(() => smsPlugin.createChannel(4, mockCtx)).toThrow();
    expect(() => smsPlugin.createChannel(-1, mockCtx)).toThrow();
  });

  it('creates tone channels for indices 0-2', () => {
    const channel0 = smsPlugin.createChannel(0, mockCtx);
    const channel1 = smsPlugin.createChannel(1, mockCtx);
    const channel2 = smsPlugin.createChannel(2, mockCtx);
    
    // Should be able to call methods on the channels
    expect(typeof channel0.reset).toBe('function');
    expect(typeof channel0.noteOn).toBe('function');
    expect(typeof channel0.noteOff).toBe('function');
    expect(typeof channel0.applyEnvelope).toBe('function');
    expect(typeof channel0.render).toBe('function');
  });

  it('creates noise channel for index 3', () => {
    const channel3 = smsPlugin.createChannel(3, mockCtx);
    
    expect(typeof channel3.reset).toBe('function');
    expect(typeof channel3.noteOn).toBe('function');
    expect(typeof channel3.noteOff).toBe('function');
    expect(typeof channel3.applyEnvelope).toBe('function');
    expect(typeof channel3.render).toBe('function');
  });
});

describe('instrument validation', () => {
  it('accepts valid tone1 instrument', () => {
    const inst = { name: 'lead', type: 'tone1', vol: 10 };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors).toEqual([]);
  });

  it('accepts valid tone2 instrument', () => {
    const inst = { name: 'harm', type: 'tone2', vol: 8, vol_env: [15, 12, 9] };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors).toEqual([]);
  });

  it('accepts valid tone3 instrument', () => {
    const inst = { name: 'bass', type: 'tone3', vol: 12, pitch_env: [0, -1, -2] };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors).toEqual([]);
  });

  it('accepts valid noise instrument', () => {
    const inst = { name: 'kick', type: 'noise', noise_mode: 'white', noise_rate: 2, vol: 15 };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors).toEqual([]);
  });

  it('accepts periodic noise mode', () => {
    const inst = { name: 'snare', type: 'noise', noise_mode: 'periodic', noise_rate: 1, vol: 12 };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors).toEqual([]);
  });

  it('accepts noise_rate=tone3', () => {
    const inst = { name: 'sync_noise', type: 'noise', noise_mode: 'white', noise_rate: 'tone3', vol: 10 };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors).toEqual([]);
  });

  it('accepts Game Gear pan', () => {
    const inst = { name: 'lead', type: 'tone1', vol: 10, gg_pan: 'R' };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors).toEqual([]);
  });

  it('rejects invalid type', () => {
    const inst = { name: 'test', type: 'invalid' };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('type');
  });

  it('rejects sweep effect', () => {
    const inst = { name: 'test', type: 'tone1', sweep: 'up' };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.some(e => e.field === 'sweep')).toBe(true);
  });

  it('rejects echo effect', () => {
    const inst = { name: 'test', type: 'tone1', echo: 0.5 };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.some(e => e.field === 'echo')).toBe(true);
  });

  it('rejects duty on tone channels', () => {
    const inst = { name: 'test', type: 'tone1', duty: '50%' };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.some(e => e.field === 'duty')).toBe(true);
  });

  it('rejects noise_mode on tone channels', () => {
    const inst = { name: 'test', type: 'tone1', noise_mode: 'white' };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.some(e => e.field === 'noise_mode')).toBe(true);
  });

  it('rejects noise_rate on tone channels', () => {
    const inst = { name: 'test', type: 'tone1', noise_rate: 2 };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.some(e => e.field === 'noise_rate')).toBe(true);
  });

  it('rejects invalid noise_rate value', () => {
    const inst = { name: 'test', type: 'noise', noise_rate: 5 };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.some(e => e.field === 'noise_rate')).toBe(true);
  });

  it('rejects invalid noise_mode value', () => {
    const inst = { name: 'test', type: 'noise', noise_mode: 'invalid' };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.some(e => e.field === 'noise_mode')).toBe(true);
  });

  it('rejects invalid vol range', () => {
    const inst = { name: 'test', type: 'tone1', vol: 20 };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.some(e => e.field === 'vol')).toBe(true);
  });
});
