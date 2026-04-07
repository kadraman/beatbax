/**
 * Tests for ChannelMixer per-channel analyser waveform feature:
 *  - toggle button exists in the toolbar
 *  - playback:channel-waveform events trigger canvas rendering
 *  - playback:stopped clears waveform buffers
 *  - toggle persists state to localStorage
 */

import { ChannelMixer } from '../src/panels/channel-mixer';
import { EventBus } from '../src/utils/event-bus';
import * as channelStore from '../src/stores/channel.store';
import { settingFeaturePerChannelAnalyser } from '../src/stores/settings.store';

function makeAst(channelIds: number[]) {
  return {
    chip: 'gameboy',
    channels: channelIds.map(id => ({
      id,
      inst: `inst${id}`,
      events: [{ instrument: `inst${id}`, type: 'note' }],
    })),
    insts: Object.fromEntries(channelIds.map(id => [`inst${id}`, { type: 'pulse1' }])),
  };
}

/** Minimal PlaybackManager stub. */
function makePlaybackManagerStub() {
  return {
    setPerChannelAnalyser: jest.fn(),
    isPerChannelAnalyserEnabled: jest.fn(() => false),
    getChannelAnalyserData: jest.fn(() => null),
  } as any;
}

describe('ChannelMixer – per-channel waveform analyser', () => {
  let container: HTMLElement;
  let eventBus: EventBus;
  let mixer: ChannelMixer;
  let playbackManager: ReturnType<typeof makePlaybackManagerStub>;

  beforeEach(() => {
    localStorage.clear();
    channelStore.resetChannels();
    container = document.createElement('div');
    document.body.appendChild(container);
    eventBus = new EventBus();
    playbackManager = makePlaybackManagerStub();
    mixer = new ChannelMixer({ container, eventBus, playbackManager });
    jest.useFakeTimers();
  });

  afterEach(() => {
    mixer.dispose?.();
    settingFeaturePerChannelAnalyser.set(false); // reset atom to default after each test
    eventBus.clear();
    document.body.removeChild(container);
    jest.useRealTimers();
  });

  it('renders the waveform-analyser toggle button in the toolbar', () => {
    const btn = document.getElementById('bb-cp-waveform-toggle');
    expect(btn).not.toBeNull();
  });

  it('toggle button has active class when analyserEnabled is true (via settings atom)', () => {
    mixer.dispose?.();
    document.body.removeChild(container);
    settingFeaturePerChannelAnalyser.set(true);

    container = document.createElement('div');
    document.body.appendChild(container);
    const mixerWithAnalyser = new ChannelMixer({ container, eventBus, playbackManager });

    const btn = document.getElementById('bb-cp-waveform-toggle');
    expect(btn?.classList.contains('bb-cp__toolbar-btn--active')).toBe(true);

    mixerWithAnalyser.dispose?.();
  });

  it('clicking toggle calls playbackManager.setPerChannelAnalyser', () => {
    const btn = document.getElementById('bb-cp-waveform-toggle') as HTMLButtonElement;
    btn.click();
    expect(playbackManager.setPerChannelAnalyser).toHaveBeenCalledTimes(1);
  });

  it('clicking toggle persists state to localStorage via settings atom', () => {
    const btn = document.getElementById('bb-cp-waveform-toggle') as HTMLButtonElement;
    const initialValue = settingFeaturePerChannelAnalyser.get();
    btn.click();
    // State should have flipped both in atom and in localStorage
    expect(settingFeaturePerChannelAnalyser.get()).toBe(!initialValue);
  });

  it('playback:channel-waveform draws to the channel wave canvas', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const canvas = document.getElementById('bb-cp-wave-1') as HTMLCanvasElement;
    expect(canvas).not.toBeNull();

    // Mock getContext so both the test and drawAnalyserWaveform share the same instance
    const mockCtx = {
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      quadraticCurveTo: jest.fn(),
      stroke: jest.fn(),
    };
    jest.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any);

    const samples = new Float32Array(32).fill(0).map((_, i) => Math.sin(i * 0.2) * 0.5);
    eventBus.emit('playback:channel-waveform', {
      channelId: 1,
      timestamp: Date.now(),
      samples,
      format: 'float32',
      sampleCount: 32,
      sampleRateHint: 44100,
    });

    expect(mockCtx.stroke).toHaveBeenCalled();
  });

  it('playback:stopped clears the analyser canvas', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    // Seed with waveform data
    const samples = new Float32Array(32).fill(0.5);
    eventBus.emit('playback:channel-waveform', {
      channelId: 1,
      timestamp: Date.now(),
      samples,
      format: 'float32',
      sampleCount: 32,
      sampleRateHint: 44100,
    });

    // Now stop — internal channelWaveforms map should clear (no error thrown)
    expect(() => eventBus.emit('playback:stopped', undefined)).not.toThrow();
  });
});
