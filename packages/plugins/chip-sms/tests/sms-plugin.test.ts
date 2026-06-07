/**
 * Unit tests for @beatbax/plugin-chip-sms.
 * Tests plugin registration, instrument validation, and channel creation.
 */
import { ChipRegistry } from '@beatbax/engine';
import smsPlugin, { ggPanToGains, applyStereoRouting, SMS_MIX_GAIN, SMS_TARGET_PEAK } from '../src/index.js';

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

  it('keeps full-arrangement peak near SMS_TARGET_PEAK', () => {
    const fullArrangementPeak =
      3 * SMS_MIX_GAIN.tone + SMS_MIX_GAIN.noise;
    expect(fullArrangementPeak).toBeCloseTo(SMS_TARGET_PEAK, 6);
  });

  it('exposes chip-aware meter display gain per channel type', () => {
    expect(smsPlugin.getMeterDisplayGain?.(0)).toBeCloseTo(1 / SMS_MIX_GAIN.tone, 6);
    expect(smsPlugin.getMeterDisplayGain?.(1)).toBeCloseTo(1 / SMS_MIX_GAIN.tone, 6);
    expect(smsPlugin.getMeterDisplayGain?.(2)).toBeCloseTo(1 / SMS_MIX_GAIN.tone, 6);
    expect(smsPlugin.getMeterDisplayGain?.(3)).toBeCloseTo(1 / SMS_MIX_GAIN.noise, 6);
    expect(smsPlugin.getMeterDisplayGain?.(4)).toBe(1);
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

  it('accepts gg:pan with colon format', () => {
    const inst = { name: 'lead', type: 'tone1', vol: 10, 'gg:pan': 'R' };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors).toEqual([]);
  });

  it('accepts gg_pan without colon format', () => {
    const inst = { name: 'lead', type: 'tone1', vol: 10, gg_pan: 'L' };
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

  it('accepts noise_rate=3 as tone3', () => {
    const inst = { name: 'sync_noise', type: 'noise', noise_mode: 'white', noise_rate: 3, vol: 10 };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors).toEqual([]);
  });

  it('rejects invalid noise_rate_env values', () => {
    const inst = { name: 'test', type: 'noise', noise_rate_env: [0, 1, 4, 2] };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.some(e => e.field === 'noise_rate_env')).toBe(true);
  });

  it('rejects arp_env on noise channel', () => {
    const inst = { name: 'test', type: 'noise', arp_env: [0, 4, 7] };
    const errors = smsPlugin.validateInstrument(inst);
    expect(errors.some(e => e.field === 'arp_env')).toBe(true);
  });

  it('allows pitch_env on noise channel', () => {
    const inst = { name: 'test', type: 'noise', pitch_env: [0, -1, -2], vol: 10 };
    const errors = smsPlugin.validateInstrument(inst);
    // Should not have pitch_env errors (it's allowed for effects)
    expect(errors.every(e => e.field !== 'pitch_env')).toBe(true);
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

describe('stereo routing', () => {
  it('converts gg:pan L to stereo gains', () => {
    const [left, right] = ggPanToGains('L');
    expect(left).toBe(1.0);
    expect(right).toBe(0.0);
  });

  it('converts gg:pan R to stereo gains', () => {
    const [left, right] = ggPanToGains('R');
    expect(left).toBe(0.0);
    expect(right).toBe(1.0);
  });

  it('converts gg:pan C to stereo gains', () => {
    const [left, right] = ggPanToGains('C');
    expect(left).toBe(1.0);
    expect(right).toBe(1.0);
  });

  it('handles undefined pan as center', () => {
    const [left, right] = ggPanToGains(undefined);
    expect(left).toBe(1.0);
    expect(right).toBe(1.0);
  });

  it('supports case-insensitive pan values', () => {
    expect(ggPanToGains('left')).toEqual([1.0, 0.0]);
    expect(ggPanToGains('RIGHT')).toEqual([0.0, 1.0]);
    expect(ggPanToGains('Center')).toEqual([1.0, 1.0]);
  });

  it('applies stereo routing to mono buffer', () => {
    const monoBuffer = new Float32Array([0.5, -0.3, 0.2]);
    const stereoBuffer = new Float32Array(6); // 2x size
    applyStereoRouting(monoBuffer, stereoBuffer, 'L');

    // Should interleave left/right samples
    expect(stereoBuffer.length).toBe(6);
    expect(stereoBuffer[0]).toBeCloseTo(0.5);
    expect(stereoBuffer[1]).toBeCloseTo(0);
  });

  it('copies mono buffer when output size matches input', () => {
    const monoBuffer = new Float32Array([0.5, -0.3, 0.2]);
    const monoOutput = new Float32Array(3);
    applyStereoRouting(monoBuffer, monoOutput);

    expect(monoOutput).toEqual(monoBuffer);
  });
});

describe('Tone3-Noise synchronization', () => {
  it('creates coordinator instance', () => {
    const { smsCoordinator } = require('../src/scheduler.js');
    expect(smsCoordinator).toBeDefined();
  });

  it('registers tone3 channel with coordinator', () => {
    const { smsCoordinator } = require('../src/scheduler.js');
    const { createToneChannel } = require('../src/tone.js');

    // Create tone3 channel
    const mockContext = {} as BaseAudioContext;
    const tone3Channel = createToneChannel(mockContext, 'tone3', 2);

    // Give async registration time to complete
    return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
      // Check if channel was registered (we can't directly access private fields)
      expect(tone3Channel).toBeDefined();
      expect(tone3Channel.getCurrentPeriod).toBeDefined();
    });
  });

  it('registers noise channel with coordinator', () => {
    const { smsCoordinator } = require('../src/scheduler.js');
    const { createNoiseChannel } = require('../src/noise.js');

    // Create noise channel
    const mockContext = {} as BaseAudioContext;
    const noiseChannel = createNoiseChannel(mockContext);

    // Give async registration time to complete
    return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
      expect(noiseChannel).toBeDefined();
      expect(noiseChannel.updateTone3Period).toBeDefined();
      expect(noiseChannel.setNoiseRate).toBeDefined();
    });
  });

  it('tone3 channel exposes current period', () => {
    const { createToneChannel } = require('../src/tone.js');

    const mockContext = {} as BaseAudioContext;
    const tone3Channel = createToneChannel(mockContext, 'tone3', 2);

    // Trigger a note to set a period
    const mockInst = { name: 'test', type: 'tone3', vol: 10 };
    tone3Channel.noteOn(440, mockInst);

    const period = tone3Channel.getCurrentPeriod();
    expect(period).toBeGreaterThan(0);
    expect(typeof period).toBe('number');
  });

  it('noise channel accepts tone3 period updates', () => {
    const { createNoiseChannel } = require('../src/noise.js');

    const mockContext = {} as BaseAudioContext;
    const noiseChannel = createNoiseChannel(mockContext);

    // Trigger a note with noise_rate=tone3
    const mockInst = {
      name: 'test',
      type: 'noise',
      vol: 10,
      noise_rate: 'tone3',
      noise_mode: 'white'
    };
    noiseChannel.noteOn(0, mockInst); // Frequency ignored for noise

    // Update with a tone3 period
    const testPeriod = 512;
    expect(() => noiseChannel.updateTone3Period(testPeriod)).not.toThrow();
  });

  it('noise channel setNoiseRate method works', () => {
    const { createNoiseChannel } = require('../src/noise.js');

    const mockContext = {} as BaseAudioContext;
    const noiseChannel = createNoiseChannel(mockContext);

    // Trigger a note
    const mockInst = {
      name: 'test',
      type: 'noise',
      vol: 10,
      noise_rate: 2,
      noise_mode: 'white'
    };
    noiseChannel.noteOn(0, mockInst);

    // Change noise rate
    expect(() => noiseChannel.setNoiseRate(1)).not.toThrow();
    expect(() => noiseChannel.setNoiseRate('tone3')).not.toThrow();
  });

  it('updates tone3 period during WebAudio node creation without noteOn', async () => {
    const { createToneChannel } = require('../src/tone.js');
    const { createNoiseChannel } = require('../src/noise.js');

    const makeAudioParam = () => ({
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      setValueCurveAtTime: jest.fn(),
    });

    const mockCtx = {
      sampleRate: 44100,
      destination: {},
      createOscillator: () => ({
        type: 'square',
        frequency: makeAudioParam(),
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      }),
      createGain: () => ({
        gain: makeAudioParam(),
        connect: jest.fn(),
      }),
    } as any;

    const tone3Channel = createToneChannel(mockCtx, 'tone3', 2);
    const noiseChannel = createNoiseChannel(mockCtx);

    const originalUpdateTone3Period = noiseChannel.updateTone3Period.bind(noiseChannel);
    const updateTone3PeriodSpy = jest.fn((period: number) => originalUpdateTone3Period(period));
    (noiseChannel as any).updateTone3Period = updateTone3PeriodSpy;

    // registration is async in createToneChannel/createNoiseChannel
    await new Promise(resolve => setTimeout(resolve, 120));

    const tone3Inst = { name: 't3', type: 'tone3', vol: 10 };
    const result = tone3Channel.createPlaybackNodes(
      mockCtx,
      440,
      0,
      0.2,
      tone3Inst,
      null,
      mockCtx.destination
    );

    expect(result).not.toBeNull();

    // coordinator update is async (dynamic import)
    await Promise.resolve();
    await Promise.resolve();

    expect(updateTone3PeriodSpy).toHaveBeenCalled();
    expect(updateTone3PeriodSpy.mock.calls[0][0]).toBeGreaterThan(0);
    expect(tone3Channel.getCurrentPeriod()).toBeGreaterThan(0);
  });

  it('noise WebAudio tone3 sync falls back safely when tone3 period is unavailable', () => {
    const { createNoiseChannel } = require('../src/noise.js');
    const { smsCoordinator } = require('../src/scheduler.js');

    const createBuffer = jest.fn((_channels: number, length: number, _sampleRate: number) => {
      const data = new Float32Array(length);
      return {
        getChannelData: () => data,
        __data: data,
      };
    });

    const sourceStart = jest.fn();
    const sourceStop = jest.fn();

    const mockCtx = {
      sampleRate: 44100,
      destination: {},
      createBuffer,
      createBufferSource: () => ({
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        connect: jest.fn(),
        start: sourceStart,
        stop: sourceStop,
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: jest.fn(),
          linearRampToValueAtTime: jest.fn(),
          setValueCurveAtTime: jest.fn(),
        },
        connect: jest.fn(),
      }),
    } as any;

    const tone3Spy = jest.spyOn(smsCoordinator, 'getTone3Period').mockReturnValue(0);

    const noiseChannel = createNoiseChannel(mockCtx);
    const noiseInst = {
      name: 'sync-noise',
      type: 'noise',
      vol: 10,
      noise_mode: 'white',
      noise_rate: 'tone3',
    };

    const nodes = noiseChannel.createPlaybackNodes(
      mockCtx,
      0,
      0,
      0.1,
      noiseInst,
      null,
      mockCtx.destination
    );

    expect(nodes).not.toBeNull();
    expect(sourceStart).toHaveBeenCalled();
    expect(sourceStop).toHaveBeenCalled();
    expect(tone3Spy).toHaveBeenCalled();

    const created = createBuffer.mock.results[0]?.value;
    expect(created).toBeDefined();
    const data: Float32Array = created.__data;
    for (let i = 0; i < data.length; i++) {
      expect(Number.isFinite(data[i])).toBe(true);
    }

    tone3Spy.mockRestore();
  });

  it('noise WebAudio tone3 sync consults coordinator period', () => {
    const { createNoiseChannel } = require('../src/noise.js');
    const { smsCoordinator } = require('../src/scheduler.js');

    const mockCtx = {
      sampleRate: 44100,
      destination: {},
      createBuffer: (_channels: number, length: number, _sampleRate: number) => ({
        getChannelData: () => new Float32Array(length),
      }),
      createBufferSource: () => ({
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: jest.fn(),
          linearRampToValueAtTime: jest.fn(),
          setValueCurveAtTime: jest.fn(),
        },
        connect: jest.fn(),
      }),
    } as any;

    const tone3Spy = jest.spyOn(smsCoordinator, 'getTone3Period').mockReturnValue(256);

    const noiseChannel = createNoiseChannel(mockCtx);
    const noiseInst = {
      name: 'sync-noise',
      type: 'noise',
      vol: 10,
      noise_mode: 'white',
      noise_rate: 'tone3',
    };

    const nodes = noiseChannel.createPlaybackNodes(
      mockCtx,
      0,
      0,
      0.1,
      noiseInst,
      null,
      mockCtx.destination
    );

    expect(nodes).not.toBeNull();
    expect(tone3Spy).toHaveBeenCalled();

    tone3Spy.mockRestore();
  });

  it('normalizes numeric string noise_rate on PCM path', () => {
    const { createNoiseChannel } = require('../src/noise.js');

    const mockContext = {} as BaseAudioContext;

    const noiseRateOne = createNoiseChannel(mockContext);
    noiseRateOne.noteOn(0, {
      name: 'n1',
      type: 'noise',
      vol: 0,
      noise_mode: 'white',
      noise_rate: '1',
    });

    const noiseRateTwo = createNoiseChannel(mockContext);
    noiseRateTwo.noteOn(0, {
      name: 'n2',
      type: 'noise',
      vol: 0,
      noise_mode: 'white',
      noise_rate: 2,
    });

    const bufOne = new Float32Array(1024);
    const bufTwo = new Float32Array(1024);

    noiseRateOne.render(bufOne, 44100);
    noiseRateTwo.render(bufTwo, 44100);

    let identical = true;
    for (let i = 0; i < bufOne.length; i++) {
      if (bufOne[i] !== bufTwo[i]) {
        identical = false;
        break;
      }
    }

    expect(identical).toBe(false);
  });
});

describe('Tone volume semantics', () => {
  it('treats vol=0 as loudest and vol=15 as mute in PCM render path', () => {
    const { createToneChannel } = require('../src/tone.js');

    const mockContext = {} as BaseAudioContext;

    const loudChannel = createToneChannel(mockContext, 'tone1', 0);
    loudChannel.noteOn(440, { name: 'loud', type: 'tone1', vol: 0 });
    const loudBuf = new Float32Array(128);
    loudChannel.render(loudBuf, 44100);

    const muteChannel = createToneChannel(mockContext, 'tone1', 0);
    muteChannel.noteOn(440, { name: 'mute', type: 'tone1', vol: 15 });
    const muteBuf = new Float32Array(128);
    muteChannel.render(muteBuf, 44100);

    const loudEnergy = loudBuf.reduce((sum: number, v: number) => sum + Math.abs(v), 0);
    const muteEnergy = muteBuf.reduce((sum: number, v: number) => sum + Math.abs(v), 0);

    expect(loudEnergy).toBeGreaterThan(0);
    expect(muteEnergy).toBe(0);
  });

  it('maps WebAudio constant volume with attenuation semantics', () => {
    const { createToneChannel } = require('../src/tone.js');

    let lastGainNode: any = null;
    const mockCtx = {
      sampleRate: 44100,
      destination: {},
      createOscillator: () => ({
        type: 'square',
        frequency: {
          setValueAtTime: jest.fn(),
        },
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      }),
      createGain: () => {
        lastGainNode = {
          gain: {
            setValueAtTime: jest.fn(),
            linearRampToValueAtTime: jest.fn(),
            setValueCurveAtTime: jest.fn(),
          },
          connect: jest.fn(),
        };
        return lastGainNode;
      },
    } as any;

    const channel = createToneChannel(mockCtx, 'tone1', 0);

    channel.createPlaybackNodes(
      mockCtx,
      440,
      0,
      0.1,
      { name: 'loud', type: 'tone1', vol: 0 },
      null,
      mockCtx.destination
    );
    const loudGainCall = lastGainNode.gain.setValueAtTime.mock.calls[0][0];

    channel.createPlaybackNodes(
      mockCtx,
      440,
      0,
      0.1,
      { name: 'mute', type: 'tone1', vol: 15 },
      null,
      mockCtx.destination
    );
    const muteGainCall = lastGainNode.gain.setValueAtTime.mock.calls[0][0];

    expect(loudGainCall).toBeGreaterThan(muteGainCall);
    expect(muteGainCall).toBe(0);
  });
});

describe('Noise volume semantics', () => {
  it('treats vol=0 as loudest and vol=15 as mute in PCM render path', () => {
    const { createNoiseChannel } = require('../src/noise.js');

    const mockContext = {} as BaseAudioContext;

    const loudChannel = createNoiseChannel(mockContext);
    loudChannel.noteOn(0, {
      name: 'loud-noise',
      type: 'noise',
      vol: 0,
      noise_mode: 'white',
      noise_rate: 2,
    });
    const loudBuf = new Float32Array(128);
    loudChannel.render(loudBuf, 44100);

    const muteChannel = createNoiseChannel(mockContext);
    muteChannel.noteOn(0, {
      name: 'mute-noise',
      type: 'noise',
      vol: 15,
      noise_mode: 'white',
      noise_rate: 2,
    });
    const muteBuf = new Float32Array(128);
    muteChannel.render(muteBuf, 44100);

    const loudEnergy = loudBuf.reduce((sum: number, v: number) => sum + Math.abs(v), 0);
    const muteEnergy = muteBuf.reduce((sum: number, v: number) => sum + Math.abs(v), 0);

    expect(loudEnergy).toBeGreaterThan(0);
    expect(muteEnergy).toBe(0);
  });

  it('maps WebAudio constant noise volume with attenuation semantics', () => {
    const { createNoiseChannel } = require('../src/noise.js');

    let lastGainNode: any = null;
    const mockCtx = {
      sampleRate: 44100,
      destination: {},
      createBuffer: (_channels: number, length: number, _sampleRate: number) => ({
        getChannelData: () => new Float32Array(length),
      }),
      createBufferSource: () => ({
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      }),
      createGain: () => {
        lastGainNode = {
          gain: {
            setValueAtTime: jest.fn(),
            linearRampToValueAtTime: jest.fn(),
            setValueCurveAtTime: jest.fn(),
          },
          connect: jest.fn(),
        };
        return lastGainNode;
      },
    } as any;

    const channel = createNoiseChannel(mockCtx);

    channel.createPlaybackNodes(
      mockCtx,
      0,
      0,
      0.1,
      { name: 'loud-noise', type: 'noise', vol: 0, noise_mode: 'white', noise_rate: 2 },
      null,
      mockCtx.destination
    );
    const loudGainCall = lastGainNode.gain.setValueAtTime.mock.calls[0][0];

    channel.createPlaybackNodes(
      mockCtx,
      0,
      0,
      0.1,
      { name: 'mute-noise', type: 'noise', vol: 15, noise_mode: 'white', noise_rate: 2 },
      null,
      mockCtx.destination
    );
    const muteGainCall = lastGainNode.gain.setValueAtTime.mock.calls[0][0];

    expect(loudGainCall).toBeGreaterThan(muteGainCall);
    expect(muteGainCall).toBe(0);
  });
});

describe('Advanced effects', () => {
  it('buildVolEnvGainCurve treats vol_env as attenuation (0 loudest, 15 mute)', () => {
    const { buildVolEnvGainCurve } = require('../src/macros.js');

    const macroLoud = { values: [0], loopPoint: -1 };
    const macroMute = { values: [15], loopPoint: -1 };

    const curveLoud = buildVolEnvGainCurve(macroLoud, 1.0, 0.1);
    const curveMute = buildVolEnvGainCurve(macroMute, 1.0, 0.1);

    expect(curveLoud[0]).toBe(1.0);
    expect(curveMute[0]).toBe(0.0);
    expect(curveLoud[0]).toBeGreaterThan(curveMute[0]);
  });

  it('smsVolSlideEffect treats positive delta as fade-in (louder)', () => {
    const { smsVolSlideEffect } = require('../src/volSlide.js');

    const gainParam = {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      cancelScheduledValues: jest.fn(),
    };

    const gainNode = { gain: gainParam };
    const nodes = [{}, gainNode];
    const inst = { name: 'lead', type: 'tone1', vol: 8 };

    smsVolSlideEffect(
      {},
      nodes,
      [2], // positive delta should get louder
      0,
      0.25,
      0,
      undefined,
      inst
    );

    const baselineGain = gainParam.setValueAtTime.mock.calls[0][0];
    const targetGain = gainParam.linearRampToValueAtTime.mock.calls[0][0];

    expect(targetGain).toBeGreaterThan(baselineGain);
  });

  it('exports vibrato effect types', () => {
    // Note: TypeScript interfaces don't exist at runtime, so we can't test them directly
    // Instead, we'll test that the effects module exports the expected functions
    const effectsModule = require('../src/effects.js');
    expect(effectsModule).toBeDefined();
    // The interfaces are defined in the TypeScript source but not available at runtime
  });

  it('exports effect functions', () => {
    const {
      applyVibrato,
      applyPortamento,
      applyTremolo,
      applyNoiseVibrato
    } = require('../src/effects.js');

    expect(applyVibrato).toBeDefined();
    expect(applyPortamento).toBeDefined();
    expect(applyTremolo).toBeDefined();
    expect(applyNoiseVibrato).toBeDefined();
  });

  it('applyVibrato function has correct signature', () => {
    const { applyVibrato } = require('../src/effects.js');
    const { createToneChannel } = require('../src/tone.js');

    const mockContext = {} as BaseAudioContext;
    const toneChannel = createToneChannel(mockContext, 'tone1', 0);

    // Trigger a note
    const mockInst = { name: 'test', type: 'tone1', vol: 10 };
    toneChannel.noteOn(440, mockInst);

    // Create vibrato effect
    const effect = { depth: 2, rate: 5, phase: 0 };

    // Should not throw
    expect(() => applyVibrato(toneChannel, effect, 0.016)).not.toThrow();
  });

  it('applyPortamento function has correct signature', () => {
    const { applyPortamento } = require('../src/effects.js');
    const { createToneChannel } = require('../src/tone.js');

    const mockContext = {} as BaseAudioContext;
    const toneChannel = createToneChannel(mockContext, 'tone1', 0);

    // Trigger a note
    const mockInst = { name: 'test', type: 'tone1', vol: 10 };
    toneChannel.noteOn(440, mockInst);

    // Create portamento effect
    const effect = {
      targetFreq: 880,
      slideRate: 12,
      currentFreq: 440
    };

    // Should not throw
    expect(() => applyPortamento(toneChannel, effect, 0.016)).not.toThrow();
  });

  it('applyTremolo function has correct signature', () => {
    const { applyTremolo } = require('../src/effects.js');
    const { createToneChannel } = require('../src/tone.js');

    const mockContext = {} as BaseAudioContext;
    const toneChannel = createToneChannel(mockContext, 'tone1', 0);

    // Trigger a note
    const mockInst = { name: 'test', type: 'tone1', vol: 10 };
    toneChannel.noteOn(440, mockInst);

    // Create tremolo effect
    const effect = { depth: 3, rate: 8, phase: 0 };

    // Should not throw
    expect(() => applyTremolo(toneChannel, effect, 0.016)).not.toThrow();
  });

  it('applyNoiseVibrato function has correct signature', () => {
    const { applyNoiseVibrato } = require('../src/effects.js');
    const { createNoiseChannel } = require('../src/noise.js');

    const mockContext = {} as BaseAudioContext;
    const noiseChannel = createNoiseChannel(mockContext);

    // Trigger a note
    const mockInst = {
      name: 'test',
      type: 'noise',
      vol: 10,
      noise_rate: 2,
      noise_mode: 'white'
    };
    noiseChannel.noteOn(0, mockInst);

    // Create vibrato effect
    const effect = { depth: 1, rate: 3, phase: 0 };

    // Should not throw
    expect(() => applyNoiseVibrato(noiseChannel, effect, 0.016)).not.toThrow();
  });
});
