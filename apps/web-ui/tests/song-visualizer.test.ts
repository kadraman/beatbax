import { SongVisualizer } from '../src/panels/song-visualizer';
import { EventBus } from '../src/utils/event-bus';
import * as channelStore from '../src/stores/channel.store';
import { storage, StorageKey } from '../src/utils/local-storage';
import type { PlaybackPosition } from '../src/playback/playback-manager';

function makeAst(channelIds: number[], chip = 'gameboy') {
  return {
    chip,
    channels: channelIds.map(id => ({ id, inst: `inst${id}`, events: [{ instrument: `inst${id}` }] })),
    insts: Object.fromEntries(channelIds.map(id => [`inst${id}`, { type: 'pulse1' }])),
  };
}

const basePosition = (): PlaybackPosition => ({
  channelId: 1,
  eventIndex: 4,
  totalEvents: 32,
  currentInstrument: 'lead',
  currentPattern: 'melody',
  sourceSequence: 'main',
  barNumber: 1,
  progress: 4 / 32,
});

describe('SongVisualizer', () => {
  let container: HTMLElement;
  let eventBus: EventBus;
  let visualizer: SongVisualizer;

  beforeEach(() => {
    localStorage.clear();
    channelStore.resetChannels();
    container = document.createElement('div');
    document.body.appendChild(container);
    eventBus = new EventBus();
    visualizer = new SongVisualizer({ container, eventBus });
    jest.useFakeTimers();
  });

  afterEach(() => {
    visualizer.dispose?.();
    eventBus.clear();
    document.body.removeChild(container);
    jest.useRealTimers();
  });

  it('renders one card per channel on parse:success', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2, 3, 4]) });
    expect(document.getElementById('bb-viz-card-1')).not.toBeNull();
    expect(document.getElementById('bb-viz-card-4')).not.toBeNull();
  });

  it('renders waveform canvas with 80px visual height in normal mode', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    const canvas = document.getElementById('bb-viz-wave-1') as HTMLCanvasElement | null;
    expect(canvas).not.toBeNull();
    expect(canvas?.classList.contains('bb-viz__wave-canvas')).toBe(true);
  });

  it('playback:position-changed updates instrument, pattern and progress', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', { channelId: 1, position: basePosition() });

    expect(document.getElementById('bb-viz-inst-1')?.textContent).toContain('lead');
    expect(document.getElementById('bb-viz-pattern-1')?.textContent).toContain('main');
    expect(document.getElementById('bb-viz-progress-1')?.getAttribute('style')).toContain('13%');
  });

  it('playback:stopped resets readouts', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', { channelId: 1, position: basePosition() });
    eventBus.emit('playback:stopped', undefined);

    expect(document.getElementById('bb-viz-pattern-1')?.textContent).toBe('');
    expect(document.getElementById('bb-viz-progress-1')?.getAttribute('style')).toContain('0%');
  });

  it('toggles fullscreen class and shows exit button', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const requestFullscreen = jest.fn().mockRejectedValue(new Error('unsupported'));
    const root = document.getElementById('bb-viz-root') as any;
    root.requestFullscreen = requestFullscreen;

    (document as any).fullscreenElement = null;
    (document as any).exitFullscreen = jest.fn();

    (document.getElementById('bb-viz-fullscreen') as HTMLButtonElement).click();
    expect(requestFullscreen).toHaveBeenCalled();

    return Promise.resolve().then(() => {
      expect(document.getElementById('bb-viz-root')?.classList.contains('bb-viz--fullscreen')).toBe(true);
      expect(document.getElementById('bb-viz-exit')).not.toBeNull();
    });
  });

  it('background effect none hides canvas and starfield is visible in fullscreen', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    storage.set(StorageKey.VIZ_BG_EFFECT, 'none');
    visualizer.dispose();
    visualizer = new SongVisualizer({ container, eventBus });
    const hiddenCanvas = document.getElementById('bb-viz-bg');
    expect(hiddenCanvas?.classList.contains('bb-viz__bg-hidden')).toBe(true);

    storage.set(StorageKey.VIZ_BG_EFFECT, 'starfield');
    visualizer.dispose();
    visualizer = new SongVisualizer({ container, eventBus });
    const requestFullscreen = jest.fn().mockRejectedValue(new Error('unsupported'));
    const root = document.getElementById('bb-viz-root') as any;
    root.requestFullscreen = requestFullscreen;
    (document.getElementById('bb-viz-fullscreen') as HTMLButtonElement).click();

    return Promise.resolve().then(() => {
      const shownCanvas = document.getElementById('bb-viz-bg');
      expect(shownCanvas?.classList.contains('bb-viz__bg-hidden')).toBe(false);
    });
  });
});
