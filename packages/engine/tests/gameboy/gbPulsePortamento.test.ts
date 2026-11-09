import { clearHeldPulseVoices, playPulse, PULSE_OUTPUT_GAIN } from '../../src/chips/gameboy/pulse';
import {
  contiguousPulsePortChainEnd,
  noteHasPort,
  planPulsePortamentoLink,
} from '../../src/chips/gameboy/pulsePortamento';
import { clearEffectState, get } from '../../src/effects/index';

const pulse = { type: 'pulse1', duty: '50', env: '15,down,1' };

function portNote(port = true, inst: any = pulse) {
  return {
    type: 'note',
    token: 'C5',
    effects: port ? [{ type: 'port', params: [10] }] : [],
    instProps: inst,
  };
}

function makeAudioParam() {
  return {
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
    value: 1,
  };
}

function makeCtx() {
  const gains: any[] = [];
  const oscillators: any[] = [];
  const ctx: any = {
    destination: {},
    createPeriodicWave: jest.fn(() => ({})),
    createOscillator: jest.fn(() => {
      const osc = {
        setPeriodicWave: jest.fn(),
        frequency: makeAudioParam(),
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: jest.fn(() => {
      const gain = { gain: makeAudioParam(), connect: jest.fn() };
      gains.push(gain);
      return gain;
    }),
  };
  return { ctx, gains, oscillators };
}

describe('pulse portamento chain planning', () => {
  const tick = 0.1;

  test('a port run extends through contiguous port notes and stops before a re-attack', () => {
    const tokens = [portNote(false), portNote(true), portNote(true), portNote(false)];
    const end = contiguousPulsePortChainEnd({
      tokens,
      index: 0,
      originTime: 0,
      tickSeconds: tick,
      noteTime: 0,
      noteDur: tick,
    });
    expect(end).toBeCloseTo(0.3, 6);
  });

  test('a sustain between port notes stays in the chain', () => {
    const tokens = [portNote(true), { type: 'sustain' }, portNote(true)];
    const end = contiguousPulsePortChainEnd({
      tokens,
      index: 0,
      originTime: 1,
      tickSeconds: tick,
      noteTime: 1,
      noteDur: tick * 2,
    });
    expect(end).toBeCloseTo(1.3, 6);
  });

  test('a rest, a wave note, and a baked duty program end the voice', () => {
    const rest = [portNote(true), { type: 'rest' }, portNote(true)];
    expect(contiguousPulsePortChainEnd({
      tokens: rest, index: 0, originTime: 0, tickSeconds: tick, noteTime: 0, noteDur: tick,
    })).toBeCloseTo(tick, 6);

    const wave = [portNote(true), portNote(true, { type: 'wave', wave: '0123' })];
    expect(contiguousPulsePortChainEnd({
      tokens: wave, index: 0, originTime: 0, tickSeconds: tick, noteTime: 0, noteDur: tick,
    })).toBeCloseTo(tick, 6);

    const baked = [portNote(true), portNote(true, { type: 'pulse1', duty_env: '[2,2,0,0|0]' })];
    expect(contiguousPulsePortChainEnd({
      tokens: baked, index: 0, originTime: 0, tickSeconds: tick, noteTime: 0, noteDur: tick,
    })).toBeCloseTo(tick, 6);
  });

  test('the note before a port run does not lend its voice', () => {
    const before = planPulsePortamentoLink({
      eligible: true,
      hasPort: false,
      holdUntil: null,
      time: 0,
      dur: 0.1,
      chainEnd: 0.3,
      channelId: 1,
    });
    expect(before.link).toMatchObject({ join: false, hold: false, voiceStopAt: 0.1 });
    expect(before.nextHoldUntil).toBeNull();

    const firstPort = planPulsePortamentoLink({
      eligible: true,
      hasPort: true,
      holdUntil: before.nextHoldUntil,
      time: 0.1,
      dur: 0.1,
      chainEnd: 0.3,
      channelId: 1,
    });
    expect(firstPort.link).toMatchObject({ join: false, hold: true, voiceStopAt: 0.3 });
    expect(firstPort.nextHoldUntil).toBeCloseTo(0.2, 6);

    const joined = planPulsePortamentoLink({
      eligible: true,
      hasPort: true,
      holdUntil: firstPort.nextHoldUntil,
      time: 0.2,
      dur: 0.1,
      chainEnd: 0.3,
      channelId: 1,
    });
    expect(joined.link).toMatchObject({ join: true, hold: false, voiceStopAt: 0.3 });
    expect(joined.nextHoldUntil).toBeNull();
  });

  test('noteHasPort reads effect objects and inline port tokens', () => {
    expect(noteHasPort(portNote(true))).toBe(true);
    expect(noteHasPort(portNote(false))).toBe(false);
    expect(noteHasPort('C5<port:10>')).toBe(true);
    expect(noteHasPort('C5<vib:4>')).toBe(false);
  });
});

describe('playPulse portamento voice', () => {
  beforeEach(() => clearHeldPulseVoices());

  test('a held run uses one oscillator and does not fade until the chain ends', () => {
    const { ctx, gains, oscillators } = makeCtx();
    playPulse(ctx, 523.25, 0.5, 0, 0.1, pulse, undefined, undefined, {
      join: false,
      hold: true,
      voiceStopAt: 0.3,
      channelId: 1,
    });
    playPulse(ctx, 587.33, 0.5, 0.1, 0.1, pulse, undefined, undefined, {
      join: true,
      hold: true,
      voiceStopAt: 0.3,
      channelId: 1,
    });
    playPulse(ctx, 659.25, 0.5, 0.2, 0.1, pulse, undefined, undefined, {
      join: true,
      hold: false,
      voiceStopAt: 0.3,
      channelId: 1,
    });

    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(oscillators[0].stop).toHaveBeenCalledWith(0.32);
    expect(gains[0].gain.setValueCurveAtTime).not.toHaveBeenCalled();
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(PULSE_OUTPUT_GAIN, 0);
    expect(gains).toHaveLength(1);
    const ramps = gains[0].gain.linearRampToValueAtTime.mock.calls.map((call: any[]) => call[1]);
    expect(ramps).toHaveLength(1);
    expect(ramps[0]).toBeCloseTo(0.305, 6);
    expect((gains[0] as any).__portamento_voice_joined__).toBe(true);
  });

  test('a note without port after the run starts a new oscillator and fades', () => {
    const { ctx, gains } = makeCtx();
    playPulse(ctx, 440, 0.5, 0, 0.1, pulse, undefined, undefined, {
      join: false,
      hold: true,
      voiceStopAt: 0.2,
      channelId: 1,
    });
    playPulse(ctx, 494, 0.5, 0.1, 0.1, pulse, undefined, undefined, {
      join: true,
      hold: false,
      voiceStopAt: 0.2,
      channelId: 1,
    });
    playPulse(ctx, 523, 0.5, 0.2, 0.1, pulse);

    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    const landingFade = gains[1].gain.linearRampToValueAtTime.mock.calls[0];
    expect(landingFade[0]).toBeCloseTo(0.0001, 6);
    expect(landingFade[1]).toBeCloseTo(0.305, 6);
  });
});

describe('port effect on a joined voice', () => {
  test('does not replace the envelope flags owned by the opening note', () => {
    clearEffectState();
    const handler = get('port');
    if (!handler) throw new Error('port handler not found');
    const freqCalls: string[] = [];
    const osc = {
      _baseFreq: 330,
      frequency: {
        value: 330,
        setValueAtTime: () => { freqCalls.push('set'); },
        cancelScheduledValues: () => {},
        exponentialRampToValueAtTime: () => { freqCalls.push('exp'); },
        linearRampToValueAtTime: () => { freqCalls.push('lin'); },
      },
    };
    const gainNode: any = { __portamento_voice_joined__: true, gain: { value: 0.2 } };
    handler({}, [osc, gainNode], [10], 0.2, 0.1, 1, 0.05, { env: '15,down,1' });
    expect(gainNode.__portamento_legato__).toBeUndefined();
    expect(freqCalls.length).toBeGreaterThan(0);
  });

  test('does not replace the envelope on the port note that opens the voice', () => {
    clearEffectState();
    const handler = get('port');
    if (!handler) throw new Error('port handler not found');
    const osc = {
      _baseFreq: 330,
      _prevFreq: 220,
      frequency: {
        value: 330,
        setValueAtTime: () => {},
        cancelScheduledValues: () => {},
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
      },
    };
    const gainNode: any = { __portamento_voice_attack__: true, gain: { value: 0.2 } };
    handler({}, [osc, gainNode], [10], 0.2, 0.1, 1, 0.05, { env: '15,down,1' });
    expect(gainNode.__portamento_legato__).toBeUndefined();
    expect(gainNode.__portamento_gain_start__).toBeUndefined();
  });
});
