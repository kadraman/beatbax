/**
 * Tests for optional master listening enhancement graph wiring.
 */
import { Player } from '../src/audio/playback';

function makeFilterNode() {
  return {
    type: 'peaking',
    frequency: { setValueAtTime: jest.fn() },
    Q: { setValueAtTime: jest.fn() },
    gain: { setValueAtTime: jest.fn() },
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeCompressorNode() {
  return {
    threshold: { setValueAtTime: jest.fn() },
    knee: { setValueAtTime: jest.fn() },
    ratio: { setValueAtTime: jest.fn() },
    attack: { setValueAtTime: jest.fn() },
    release: { setValueAtTime: jest.fn() },
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeGainNode(initial = 1) {
  return {
    gain: { setValueAtTime: jest.fn(), value: initial },
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeAudioContext(overrides: Record<string, any> = {}): any {
  return {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: { connect: jest.fn() },
    createGain: () => makeGainNode(),
    createDynamicsCompressor: () => makeCompressorNode(),
    createBiquadFilter: () => makeFilterNode(),
    ...overrides,
  };
}

describe('Player listening enhance', () => {
  test('default mode is mild and inserts enhance before limiter', () => {
    const masterGain = makeGainNode();
    const makeup = makeGainNode();
    const presence = makeFilterNode();
    const lowShelf = makeFilterNode();
    const glue = makeCompressorNode();
    const limiter = makeCompressorNode();
    const destination = { connect: jest.fn() };
    let gainCalls = 0;
    let compCalls = 0;
    let filterCalls = 0;
    const ctx = makeAudioContext({
      destination,
      createGain: () => {
        gainCalls += 1;
        return gainCalls === 1 ? masterGain : makeup;
      },
      createDynamicsCompressor: () => {
        compCalls += 1;
        // Player creates the soft limiter first, then the glue compressor.
        return compCalls === 1 ? limiter : glue;
      },
      createBiquadFilter: () => {
        filterCalls += 1;
        return filterCalls === 1 ? presence : lowShelf;
      },
    });
    const player: any = new Player(ctx);

    expect(player.getListeningEnhance()).toBe('mild');
    player.setMasterVolume(1);

    // Default mild: masterGain → presence → glue → makeup → limiter → destination
    // (no low-shelf on mild)
    expect(masterGain.connect).toHaveBeenCalledWith(presence);
    expect(presence.connect).toHaveBeenCalledWith(glue);
    expect(glue.connect).toHaveBeenCalledWith(makeup);
    expect(makeup.connect).toHaveBeenCalledWith(limiter);
    expect(limiter.connect).toHaveBeenCalledWith(destination);
    expect(masterGain.connect).not.toHaveBeenCalledWith(limiter);
  });

  test('off mode wires masterGain directly to limiter', () => {
    const masterGain = makeGainNode();
    const limiter = makeCompressorNode();
    const destination = { connect: jest.fn() };
    const ctx = makeAudioContext({
      destination,
      createGain: () => masterGain,
      createDynamicsCompressor: () => limiter,
    });
    const player: any = new Player(ctx);

    player.setListeningEnhance('off');
    player.setMasterVolume(0.5);

    expect(player.getListeningEnhance()).toBe('off');
    expect(masterGain.connect).toHaveBeenCalledWith(limiter);
    expect(limiter.connect).toHaveBeenCalledWith(destination);
  });

  test('strong mode inserts low-shelf between presence and glue', () => {
    const masterGain = makeGainNode();
    const makeup = makeGainNode();
    const presence = makeFilterNode();
    const lowShelf = makeFilterNode();
    const glue = makeCompressorNode();
    const limiter = makeCompressorNode();
    const destination = { connect: jest.fn() };
    let gainCalls = 0;
    let compCalls = 0;
    let filterCalls = 0;
    const ctx = makeAudioContext({
      destination,
      createGain: () => {
        gainCalls += 1;
        return gainCalls === 1 ? masterGain : makeup;
      },
      createDynamicsCompressor: () => {
        compCalls += 1;
        // Player creates the soft limiter first, then the glue compressor.
        return compCalls === 1 ? limiter : glue;
      },
      createBiquadFilter: () => {
        filterCalls += 1;
        return filterCalls === 1 ? presence : lowShelf;
      },
    });
    const player: any = new Player(ctx);

    player.setListeningEnhance('strong');

    expect(masterGain.connect).toHaveBeenCalledWith(presence);
    expect(presence.connect).toHaveBeenCalledWith(lowShelf);
    expect(lowShelf.connect).toHaveBeenCalledWith(glue);
    expect(glue.connect).toHaveBeenCalledWith(makeup);
    expect(makeup.connect).toHaveBeenCalledWith(limiter);
    expect(limiter.connect).toHaveBeenCalledWith(destination);
  });

  test('OfflineAudioContext forces dry chain even when mild is requested', () => {
    const masterGain = makeGainNode();
    const limiter = makeCompressorNode();
    const destination = { connect: jest.fn() };
    const ctx = makeAudioContext({
      destination,
      createGain: () => masterGain,
      createDynamicsCompressor: () => limiter,
      startRendering: jest.fn(),
      constructor: { name: 'OfflineAudioContext' },
    });
    // Make instanceof OfflineAudioContext succeed via prototype tagging
    Object.setPrototypeOf(ctx, { constructor: { name: 'OfflineAudioContext' } });
    const player: any = new Player(ctx);

    player.setListeningEnhance('mild');

    expect(player.getListeningEnhance()).toBe('mild'); // requested
    expect(masterGain.connect).toHaveBeenCalledWith(limiter);
    expect(limiter.connect).toHaveBeenCalledWith(destination);
    expect(masterGain.connect).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.anything() }),
    );
  });

  test('rewiring enhance modes does not blanket-disconnect masterGain', () => {
    const masterGain = makeGainNode();
    const makeup = makeGainNode();
    const presence = makeFilterNode();
    const lowShelf = makeFilterNode();
    const glue = makeCompressorNode();
    const limiter = makeCompressorNode();
    const analyserTap = { connect: jest.fn(), disconnect: jest.fn() };
    const destination = { connect: jest.fn() };
    let gainCalls = 0;
    let compCalls = 0;
    let filterCalls = 0;
    const ctx = makeAudioContext({
      destination,
      createGain: () => {
        gainCalls += 1;
        return gainCalls === 1 ? masterGain : makeup;
      },
      createDynamicsCompressor: () => {
        compCalls += 1;
        // Player creates the soft limiter first, then the glue compressor.
        return compCalls === 1 ? limiter : glue;
      },
      createBiquadFilter: () => {
        filterCalls += 1;
        return filterCalls === 1 ? presence : lowShelf;
      },
    });
    const player: any = new Player(ctx);

    player.setListeningEnhance('off');
    masterGain.connect(analyserTap);
    masterGain.disconnect.mockClear();

    player.setListeningEnhance('mild');

    expect(masterGain.disconnect).not.toHaveBeenCalledWith();
    expect(masterGain.connect).toHaveBeenCalledWith(presence);
  });
});
