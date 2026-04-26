/**
 * Tests for ChannelMixer panel
 *
 * Covers: initial render, parse:success rendering, channel strips, VU meters,
 * instrument/pattern readouts, mute/solo controls, volume fader chip-dependence,
 * collapse/expand, show/hide, playback:stopped reset, and channel store updates.
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

function makePosition(overrides: Partial<PlaybackPosition> = {}): PlaybackPosition {
  return {
    channelId: 1,
    eventIndex: 0,
    totalEvents: 4,
    currentInstrument: 'lead',
    currentPattern: 'melody',
    sourceSequence: 'main',
    barNumber: 0,
    progress: 0.5,
    ...overrides,
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
    mixer.destroy();
    eventBus.clear();
    document.body.removeChild(container);
    jest.useRealTimers();
  });

  // ── Initial render ──────────────────────────────────────────────────────────

  it('renders the root element with correct id', () => {
    expect(document.getElementById('bb-channel-mixer')).not.toBeNull();
  });

  it('shows "No channels defined" placeholder when no AST is set', () => {
    expect(container.innerHTML).toContain('No channels defined');
  });

  it('renders the CHANNEL MIXER toolbar label', () => {
    const label = container.querySelector('.bb-channel-mixer__toolbar-label');
    expect(label?.textContent).toBe('CHANNEL MIXER');
  });

  // ── parse:success ───────────────────────────────────────────────────────────

  it('renders channel strips on parse:success', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2, 3, 4]) });

    expect(document.getElementById('bb-channel-mixer-strip-1')).not.toBeNull();
    expect(document.getElementById('bb-channel-mixer-strip-2')).not.toBeNull();
    expect(document.getElementById('bb-channel-mixer-strip-3')).not.toBeNull();
    expect(document.getElementById('bb-channel-mixer-strip-4')).not.toBeNull();
  });

  it('renders VU meter for each channel', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });

    expect(document.getElementById('bb-channel-mixer-vu-1')).not.toBeNull();
    expect(document.getElementById('bb-channel-mixer-vu-2')).not.toBeNull();
  });

  it('renders 12 VU segments per channel', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const vu = document.getElementById('bb-channel-mixer-vu-1');
    const segs = vu?.querySelectorAll('.bb-channel-mixer__vu-seg');
    expect(segs?.length).toBe(12);
  });

  it('VU segments have correct colour classes', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const vu = document.getElementById('bb-channel-mixer-vu-1');
    const green  = vu?.querySelectorAll('.bb-channel-mixer__vu-seg--green');
    const yellow = vu?.querySelectorAll('.bb-channel-mixer__vu-seg--yellow');
    const red    = vu?.querySelectorAll('.bb-channel-mixer__vu-seg--red');

    expect(green?.length).toBe(8);   // segments 0–7
    expect(yellow?.length).toBe(2);  // segments 8–9
    expect(red?.length).toBe(2);     // segments 10–11
  });

  it('renders instrument display element', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const instEl = document.getElementById('bb-channel-mixer-inst-1');
    expect(instEl).not.toBeNull();
    expect(instEl?.textContent).toContain('inst1');
  });

  it('does not render sequence and pattern display elements in strip', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const seqEl = document.getElementById('bb-channel-mixer-seq-1');
    const patEl = document.getElementById('bb-channel-mixer-pat-1');
    expect(seqEl).toBeNull();
    expect(patEl).toBeNull();
  });

  it('renders mute and solo buttons', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    expect(document.getElementById('bb-channel-mixer-mute-1')).not.toBeNull();
    expect(document.getElementById('bb-channel-mixer-solo-1')).not.toBeNull();
  });

  it('re-renders when channel structure changes', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    expect(document.getElementById('bb-channel-mixer-strip-3')).toBeNull();

    eventBus.emit('parse:success', { ast: makeAst([1, 2, 3]) });
    expect(document.getElementById('bb-channel-mixer-strip-3')).not.toBeNull();
  });

  it('does NOT re-render when channels are unchanged', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    const strip1Before = document.getElementById('bb-channel-mixer-strip-1');

    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    const strip1After = document.getElementById('bb-channel-mixer-strip-1');

    expect(strip1Before).toBe(strip1After); // same DOM node, no re-render
  });

  it('re-renders when chip changes', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2], 'gameboy') });
    const stripBefore = document.getElementById('bb-channel-mixer-strip-1');

    eventBus.emit('parse:success', { ast: makeAst([1, 2], 'nes') });
    const stripAfter = document.getElementById('bb-channel-mixer-strip-1');

    // Re-render creates a new DOM node for the strip
    expect(stripBefore).not.toBe(stripAfter);
  });

  // ── Volume fader chip-dependence ─────────────────────────────────────────────

  it('disables volume fader for gameboy (envelope-driven chip)', () => {
    eventBus.emit('parse:success', { ast: makeAst([1], 'gameboy') });

    const faderCol = container.querySelector('.bb-channel-mixer__fader-col');
    expect(faderCol?.classList.contains('bb-channel-mixer__fader-col--disabled')).toBe(true);

    const fader = document.getElementById('bb-channel-mixer-fader-1') as HTMLElement | null;
    expect(fader).not.toBeNull();
  });

  it('enables volume fader for nes (runtime volume chip)', () => {
    eventBus.emit('parse:success', { ast: makeAst([1], 'nes') });

    const faderCol = container.querySelector('.bb-channel-mixer__fader-col');
    expect(faderCol?.classList.contains('bb-channel-mixer__fader-col--disabled')).toBe(false);

    const fader = document.getElementById('bb-channel-mixer-fader-1') as HTMLElement | null;
    expect(fader).not.toBeNull();
  });

  // ── playback:position-changed ─────────────────────────────────────────────────

  it('updates instrument label on playback:position-changed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, currentInstrument: 'lead' }),
    });

    const instEl = document.getElementById('bb-channel-mixer-inst-1');
    expect(instEl?.textContent).toBe('lead');
  });

  it('does not render pattern/sequence fields on playback:position-changed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, sourceSequence: 'main', currentPattern: 'melody' }),
    });

    const seqEl = document.getElementById('bb-channel-mixer-seq-1');
    const patEl = document.getElementById('bb-channel-mixer-pat-1');
    expect(seqEl).toBeNull();
    expect(patEl).toBeNull();
  });

  it('keeps strip focused on instrument even when no pattern is available', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, currentPattern: null, barNumber: 2 }),
    });

    const instEl = document.getElementById('bb-channel-mixer-inst-1');
    expect(instEl).not.toBeNull();
  });

  // ── playback:stopped ──────────────────────────────────────────────────────────

  it('resets instrument to default on playback:stopped', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    // Simulate playback changing the instrument display
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, currentInstrument: 'lead' }),
    });
    expect(document.getElementById('bb-channel-mixer-inst-1')?.textContent).toBe('lead');

    eventBus.emit('playback:stopped', undefined);

    const instEl = document.getElementById('bb-channel-mixer-inst-1');
    expect(instEl?.textContent).toBe('inst1'); // back to default
  });

  it('does not use removed pattern/sequence fields on playback:stopped', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, currentPattern: 'melody', sourceSequence: 'main' }),
    });

    eventBus.emit('playback:stopped', undefined);

    expect(document.getElementById('bb-channel-mixer-seq-1')).toBeNull();
    expect(document.getElementById('bb-channel-mixer-pat-1')).toBeNull();
  });

  // ── Mute / Solo ───────────────────────────────────────────────────────────────

  it('mute button has aria-pressed=false when channel is not muted', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const muteBtn = document.getElementById('bb-channel-mixer-mute-1') as HTMLButtonElement | null;
    expect(muteBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(muteBtn?.classList.contains('bb-cp__btn--active')).toBe(false);
  });

  it('reflects muted state after toggleChannelMuted', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    channelStore.toggleChannelMuted(1);

    const muteBtn = document.getElementById('bb-channel-mixer-mute-1') as HTMLButtonElement | null;
    expect(muteBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(muteBtn?.classList.contains('bb-cp__btn--active')).toBe(true);
  });

  it('adds silent class to strip when channel is muted', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    channelStore.toggleChannelMuted(1);

    const strip = document.getElementById('bb-channel-mixer-strip-1');
    expect(strip?.classList.contains('bb-channel-mixer__strip--silent')).toBe(true);
  });

  it('reflects soloed state after toggleChannelSoloed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });

    channelStore.toggleChannelSoloed(1);

    const soloBtn = document.getElementById('bb-channel-mixer-solo-1') as HTMLButtonElement | null;
    expect(soloBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(soloBtn?.classList.contains('bb-cp__btn--active')).toBe(true);
  });

  it('marks non-soloed channels as silent when another is soloed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });

    channelStore.toggleChannelSoloed(1);

    const strip2 = document.getElementById('bb-channel-mixer-strip-2');
    expect(strip2?.classList.contains('bb-channel-mixer__strip--silent')).toBe(true);
  });

  it('solo button auto-unmutes a muted channel', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    channelStore.setChannelMuted(1, true);

    const soloBtn = document.getElementById('bb-channel-mixer-solo-1') as HTMLButtonElement | null;
    soloBtn?.click();

    expect(channelStore.channelStates.get()[1]?.soloed).toBe(true);
    expect(channelStore.channelStates.get()[1]?.muted).toBe(false);
  });

  it('mute button auto-unsolos a soloed channel', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    channelStore.toggleChannelSoloed(1);

    const muteBtn = document.getElementById('bb-channel-mixer-mute-1') as HTMLButtonElement | null;
    muteBtn?.click();

    expect(channelStore.channelStates.get()[1]?.muted).toBe(true);
    expect(channelStore.channelStates.get()[1]?.soloed).toBe(false);
  });

  // ── Unmute All / Clear Solo toolbar buttons ────────────────────────────────

  it('unmute-all button is disabled when no channels are muted', () => {
    const btn = document.getElementById('bb-channel-mixer-unmute-all') as HTMLButtonElement | null;
    expect(btn?.dataset.ariaDisabled).toBe('true');
  });

  it('unmute-all button becomes enabled when a channel is muted', () => {
    channelStore.toggleChannelMuted(1);
    const btn = document.getElementById('bb-channel-mixer-unmute-all') as HTMLButtonElement | null;
    expect(btn?.dataset.ariaDisabled).toBeUndefined();
  });

  it('clear-solo button is disabled when no channels are soloed', () => {
    const btn = document.getElementById('bb-channel-mixer-clear-solo') as HTMLButtonElement | null;
    expect(btn?.dataset.ariaDisabled).toBe('true');
  });

  it('clear-solo button becomes enabled when a channel is soloed', () => {
    channelStore.toggleChannelSoloed(1);
    const btn = document.getElementById('bb-channel-mixer-clear-solo') as HTMLButtonElement | null;
    expect(btn?.dataset.ariaDisabled).toBeUndefined();
  });

  // ── Show / hide ───────────────────────────────────────────────────────────────

  it('hide() sets display:none on root element', () => {
    mixer.hide();
    const root = document.getElementById('bb-channel-mixer');
    expect(root?.style.display).toBe('none');
  });

  it('show() removes display:none from root element', () => {
    mixer.hide();
    mixer.show();
    const root = document.getElementById('bb-channel-mixer');
    expect(root?.style.display).not.toBe('none');
  });

  it('toggle() hides when visible', () => {
    // Explicitly show first to ensure visible state
    mixer.show();
    expect(mixer.isVisible()).toBe(true);
    mixer.toggle();
    expect(mixer.isVisible()).toBe(false);
  });

  it('toggle() shows when hidden', () => {
    mixer.hide();
    expect(mixer.isVisible()).toBe(false);
    mixer.toggle();
    expect(mixer.isVisible()).toBe(true);
  });

  // ── Collapse / expand ─────────────────────────────────────────────────────────

  it('strips container is visible in expanded state (default)', () => {
    const root = document.getElementById('bb-channel-mixer');
    expect(root?.classList.contains('bb-channel-mixer--collapsed')).toBe(false);
  });

  it('persists collapsed state to localStorage', () => {
    // Manually toggle collapse via the button
    const collapseBtn = container.querySelector('.bb-channel-mixer__toolbar-btn') as HTMLButtonElement | null;
    collapseBtn?.click();

    const storedVal = localStorage.getItem('beatbax:ui.channelMixerCollapsed');
    expect(storedVal).toBe('true');
  });

  it('restores collapsed state from localStorage', () => {
    localStorage.setItem('beatbax:ui.channelMixerCollapsed', 'true');
    // Create a new mixer that reads persisted state
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    const mixer2 = new ChannelMixer({ container: container2, eventBus });
    const root2 = container2.querySelector('#bb-channel-mixer');
    expect(root2?.classList.contains('bb-channel-mixer--collapsed')).toBe(true);
    mixer2.destroy();
    document.body.removeChild(container2);
  });

  // ── song:loaded ───────────────────────────────────────────────────────────────

  it('re-renders empty (no channels) after song:loaded clears AST', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    expect(document.getElementById('bb-channel-mixer-strip-1')).not.toBeNull();

    // song:loaded now triggers render() with no AST → shows empty placeholder
    eventBus.emit('song:loaded', { filename: 'new.bax' });

    expect(document.getElementById('bb-channel-mixer-strip-1')).toBeNull();
    expect(container.innerHTML).toContain('No channels defined');
  });

  // ── VU meter level update ─────────────────────────────────────────────────────

  it('segments start unlit when no events have occurred', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const vu = document.getElementById('bb-channel-mixer-vu-1');
    const litSegs = vu?.querySelectorAll('.bb-channel-mixer__vu-seg--lit');
    // Before any playback event, no segments should be lit
    expect(litSegs?.length ?? 0).toBe(0);
  });

  // ── Dock mode ─────────────────────────────────────────────────────────────────

  it('defaults to docked mode', () => {
    expect(mixer.getDockMode()).toBe('docked');
  });

  it('setDockMode("inline") moves root to inline container', () => {
    const dockedContainer = document.createElement('div');
    const inlineContainer = document.createElement('div');
    document.body.appendChild(dockedContainer);
    document.body.appendChild(inlineContainer);
    const mixer2 = new ChannelMixer({ container: dockedContainer, inlineContainer, eventBus });
    mixer2.setDockMode('inline');
    expect(inlineContainer.querySelector('.bb-channel-mixer')).not.toBeNull();
    expect(dockedContainer.querySelector('.bb-channel-mixer')).toBeNull();
    mixer2.destroy();
    document.body.removeChild(dockedContainer);
    document.body.removeChild(inlineContainer);
  });

  it('setDockMode("docked") moves root back to docked container', () => {
    const dockedContainer = document.createElement('div');
    const inlineContainer = document.createElement('div');
    document.body.appendChild(dockedContainer);
    document.body.appendChild(inlineContainer);
    const mixer2 = new ChannelMixer({ container: dockedContainer, inlineContainer, eventBus });
    mixer2.setDockMode('inline');
    mixer2.setDockMode('docked');
    expect(dockedContainer.querySelector('.bb-channel-mixer')).not.toBeNull();
    expect(inlineContainer.querySelector('.bb-channel-mixer')).toBeNull();
    mixer2.destroy();
    document.body.removeChild(dockedContainer);
    document.body.removeChild(inlineContainer);
  });

  it('inline mode adds bb-channel-mixer--inline class to root', () => {
    const dockedContainer = document.createElement('div');
    const inlineContainer = document.createElement('div');
    document.body.appendChild(dockedContainer);
    document.body.appendChild(inlineContainer);
    const mixer2 = new ChannelMixer({ container: dockedContainer, inlineContainer, eventBus });
    mixer2.setDockMode('inline');
    const root = inlineContainer.querySelector('.bb-channel-mixer');
    expect(root?.classList.contains('bb-channel-mixer--inline')).toBe(true);
    mixer2.destroy();
    document.body.removeChild(dockedContainer);
    document.body.removeChild(inlineContainer);
  });

  // ── Sequence/pattern readouts live in Song Visualizer ─────────────────────────

  it('does not render sequence/pattern text fields in ChannelMixer strip', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, sourceSequence: 'intro', currentPattern: 'fill' }),
    });

    expect(document.getElementById('bb-channel-mixer-seq-1')).toBeNull();
    expect(document.getElementById('bb-channel-mixer-pat-1')).toBeNull();
  });

  it('keeps instrument text as primary readout when sequence absent', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, sourceSequence: undefined, currentPattern: 'pat1' }),
    });

    expect(document.getElementById('bb-channel-mixer-inst-1')).not.toBeNull();
    expect(document.getElementById('bb-channel-mixer-seq-1')).toBeNull();
    expect(document.getElementById('bb-channel-mixer-pat-1')).toBeNull();
  });

  // ── destroy ───────────────────────────────────────────────────────────────────

  it('destroy() removes the root element', () => {
    mixer.destroy();
    expect(container.querySelector('.bb-channel-mixer')).toBeNull();
  });
});
