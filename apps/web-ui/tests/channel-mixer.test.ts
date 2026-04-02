/**
 * Tests for ChannelMixer panel
 *
 * Covers: initial empty render, parse:success re-render, incremental updates vs
 * full re-render, playback:position-changed display logic, playback:stopped reset,
 * mute/solo/audibility UI updates, volume slider chip-dependence, and chip-change
 * triggering a re-render.
 */

import { ChannelMixer } from '../src/panels/channel-mixer';
import { EventBus } from '../src/utils/event-bus';
import * as channelStore from '../src/stores/channel.store';
import type { PlaybackPosition } from '../src/playback/playback-manager';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAst(channelIds: number[], chip = 'gameboy') {
  return {
    chip,
    channels: channelIds.map(id => ({
      id,
      inst: `inst${id}`,
      events: [{ instrument: `inst${id}` }],
    })),
    insts: Object.fromEntries(
      channelIds.map(id => [`inst${id}`, { type: 'pulse1' }]),
    ),
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ChannelMixer', () => {
  let container: HTMLElement;
  let eventBus: EventBus;
  let mixer: ChannelMixer;

  beforeEach(() => {
    localStorage.clear();
    channelStore.resetChannels();
    container = document.createElement('div');
    document.body.appendChild(container);
    eventBus = new EventBus();
    mixer = new ChannelMixer({ container, eventBus });
    jest.useFakeTimers();
  });

  afterEach(() => {
    mixer.dispose?.();
    eventBus.clear();
    document.body.removeChild(container);
    jest.useRealTimers();
  });

  // ── Initial render ──────────────────────────────────────────────────────────

  it('renders the panel', () => {
    expect(container.innerHTML).toContain('aria-label="Mixer"');
  });

  it('shows "No channels defined" when no AST is set', () => {
    expect(container.innerHTML).toContain('No channels defined');
  });

  // ── parse:success ───────────────────────────────────────────────────────────

  it('renders channel cards on parse:success', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });

    expect(document.getElementById('bb-cp-card-1')).not.toBeNull();
    expect(document.getElementById('bb-cp-card-2')).not.toBeNull();
    expect(container.innerHTML).toContain('Channel 1');
    expect(container.innerHTML).toContain('Channel 2');
  });

  it('renders the default instrument name inside the card', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const instEl = document.getElementById('bb-cp-inst-1');
    expect(instEl).not.toBeNull();
    expect(instEl?.textContent).toContain('inst1');
  });

  it('re-renders when channel set changes', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    expect(document.getElementById('bb-cp-card-3')).toBeNull();

    eventBus.emit('parse:success', { ast: makeAst([1, 2, 3]) });
    expect(document.getElementById('bb-cp-card-3')).not.toBeNull();
  });

  it('does NOT re-render (cards stay the same DOM nodes) when channels are unchanged', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    const card1Before = document.getElementById('bb-cp-card-1');

    // Same channel IDs and same chip — should not re-render
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    const card1After = document.getElementById('bb-cp-card-1');

    // DOM identity preserved (not re-created) means incremental path was taken
    expect(card1Before).toBe(card1After);
  });

  it('re-renders when chip changes (volume controls must update)', () => {
    eventBus.emit('parse:success', { ast: makeAst([1], 'gameboy') });
    const volBefore = document.getElementById('bb-cp-vol-1') as HTMLInputElement | null;
    expect(volBefore?.disabled).toBe(true); // gameboy — no runtime volume

    eventBus.emit('parse:success', { ast: makeAst([1], 'nes') });
    const volAfter = document.getElementById('bb-cp-vol-1') as HTMLInputElement | null;
    expect(volAfter?.disabled).toBe(false); // nes — runtime volume supported
  });

  // ── Volume slider chip-dependence ───────────────────────────────────────────

  it('disables volume slider for gameboy (envelope-driven chip)', () => {
    eventBus.emit('parse:success', { ast: makeAst([1], 'gameboy') });
    const slider = document.getElementById('bb-cp-vol-1') as HTMLInputElement | null;
    expect(slider?.disabled).toBe(true);
    expect(slider?.title).toContain('envelope');
  });

  it('enables volume slider for nes (runtime volume chip)', () => {
    eventBus.emit('parse:success', { ast: makeAst([1], 'nes') });
    const slider = document.getElementById('bb-cp-vol-1') as HTMLInputElement | null;
    expect(slider?.disabled).toBe(false);
  });

  // ── playback:position-changed ───────────────────────────────────────────────

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

  it('updates instrument label on position-changed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', { channelId: 1, position: basePosition() });

    const instEl = document.getElementById('bb-cp-inst-1');
    expect(instEl?.textContent).toContain('lead');
  });

  it('updates pattern display on position-changed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', { channelId: 1, position: basePosition() });

    const patternEl = document.getElementById('bb-cp-pattern-1');
    expect(patternEl?.textContent).toContain('main');
    expect(patternEl?.textContent).toContain('melody');
  });

  it('updates progress bar width on position-changed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', { channelId: 1, position: basePosition() });

    const fill = document.getElementById('bb-cp-progress-1');
    const expected = `${Math.round((4 / 32) * 100)}%`;
    expect(fill?.style.width).toBe(expected);
  });

  it('lights up the level bar on pulse and dims it after timeout', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', { channelId: 1, position: basePosition() });

    const bar = document.getElementById('bb-cp-level-1');
    expect(bar?.style.opacity).toBe('1');

    jest.advanceTimersByTime(200);
    expect(bar?.style.opacity).toBe('0.35'); // audible default
  });

  // ── playback:stopped ─────────────────────────────────────────────────────────

  it('resets progress bar to 0% on playback:stopped', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', { channelId: 1, position: basePosition() });
    eventBus.emit('playback:stopped', undefined);

    const fill = document.getElementById('bb-cp-progress-1');
    expect(fill?.style.width).toBe('0%');
  });

  it('resets pattern display to empty on playback:stopped', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', { channelId: 1, position: basePosition() });
    eventBus.emit('playback:stopped', undefined);

    const patternEl = document.getElementById('bb-cp-pattern-1');
    expect(patternEl?.textContent).toBe('');
  });

  it('clears level bar glow on playback:stopped', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', { channelId: 1, position: basePosition() });
    eventBus.emit('playback:stopped', undefined);

    const bar = document.getElementById('bb-cp-level-1');
    expect(bar?.style.boxShadow).toBe('none');
  });

  // ── Mute / unmute UI ─────────────────────────────────────────────────────────

  it('reflects muted state on channel:muted event', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    channelStore.toggleChannelMuted(1); // fires channel:muted

    const btn = document.getElementById('bb-cp-mute-1') as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    expect(btn?.title).toContain('Unmute');
  });

  it('reflects unmuted state after channel:unmuted event', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    channelStore.toggleChannelMuted(1); // mute
    channelStore.toggleChannelMuted(1); // unmute → channel:unmuted

    const btn = document.getElementById('bb-cp-mute-1') as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    expect(btn?.title).toContain('Mute channel');
  });

  it('adds silent class to card when channel is muted', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    channelStore.toggleChannelMuted(1);

    const card = document.getElementById('bb-cp-card-1');
    expect(card?.classList.contains('bb-cp__card--silent')).toBe(true);
  });

  // ── Solo UI ──────────────────────────────────────────────────────────────────

  it('reflects soloed state on channel:soloed event', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });

    channelStore.toggleChannelSoloed(1); // fires channel:soloed

    const soloBtn = document.getElementById('bb-cp-solo-1') as HTMLButtonElement | null;
    expect(soloBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(soloBtn?.title).toContain('Remove solo');
  });

  it('marks non-soloed channels as silent when another is soloed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });

    channelStore.toggleChannelSoloed(1); // only ch1 is soloed → ch2 is silent

    const card2 = document.getElementById('bb-cp-card-2');
    expect(card2?.classList.contains('bb-cp__card--silent')).toBe(true);
  });

  it('clears solo state on channel:unsoloed event', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });

    channelStore.toggleChannelSoloed(1); // solo
    channelStore.toggleChannelSoloed(1); // unsolo → channel:unsoloed

    const soloBtn = document.getElementById('bb-cp-solo-1') as HTMLButtonElement | null;
    expect(soloBtn?.getAttribute('aria-pressed')).toBe('false');
  });

  // ── song:loaded ──────────────────────────────────────────────────────────────

  it('re-renders (empty) after song:loaded clears the AST cache', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    expect(document.getElementById('bb-cp-card-1')).not.toBeNull();

    eventBus.emit('song:loaded', { filename: 'new.bax' });
    // ast is now null → next parse will always re-render
    eventBus.emit('parse:success', { ast: makeAst([3]) });

    expect(document.getElementById('bb-cp-card-3')).not.toBeNull();
    expect(document.getElementById('bb-cp-card-1')).toBeNull();
  });
});
