/**
 * Tests for HorizontalMixer panel
 *
 * Covers: initial render, parse:success rendering, channel strips, VU meters,
 * instrument/pattern readouts, mute/solo controls, volume fader chip-dependence,
 * collapse/expand, show/hide, playback:stopped reset, and channel store updates.
 */

import { HorizontalMixer } from '../src/panels/horizontal-mixer';
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

describe('HorizontalMixer', () => {
  let container: HTMLElement;
  let eventBus: EventBus;
  let mixer: HorizontalMixer;

  beforeEach(() => {
    localStorage.clear();
    channelStore.resetChannels();
    container = document.createElement('div');
    document.body.appendChild(container);
    eventBus = new EventBus();
    mixer = new HorizontalMixer({ container, eventBus });
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
    expect(document.getElementById('bb-horizontal-mixer')).not.toBeNull();
  });

  it('shows "No channels defined" placeholder when no AST is set', () => {
    expect(container.innerHTML).toContain('No channels defined');
  });

  it('renders the CHANNEL MIXER toolbar label', () => {
    const label = container.querySelector('.bb-hmix__toolbar-label');
    expect(label?.textContent).toBe('CHANNEL MIXER');
  });

  // ── parse:success ───────────────────────────────────────────────────────────

  it('renders channel strips on parse:success', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2, 3, 4]) });

    expect(document.getElementById('bb-hmix-strip-1')).not.toBeNull();
    expect(document.getElementById('bb-hmix-strip-2')).not.toBeNull();
    expect(document.getElementById('bb-hmix-strip-3')).not.toBeNull();
    expect(document.getElementById('bb-hmix-strip-4')).not.toBeNull();
  });

  it('renders VU meter for each channel', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });

    expect(document.getElementById('bb-hmix-vu-1')).not.toBeNull();
    expect(document.getElementById('bb-hmix-vu-2')).not.toBeNull();
  });

  it('renders 12 VU segments per channel', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const vu = document.getElementById('bb-hmix-vu-1');
    const segs = vu?.querySelectorAll('.bb-hmix__vu-seg');
    expect(segs?.length).toBe(12);
  });

  it('VU segments have correct colour classes', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const vu = document.getElementById('bb-hmix-vu-1');
    const green  = vu?.querySelectorAll('.bb-hmix__vu-seg--green');
    const yellow = vu?.querySelectorAll('.bb-hmix__vu-seg--yellow');
    const red    = vu?.querySelectorAll('.bb-hmix__vu-seg--red');

    expect(green?.length).toBe(8);   // segments 0–7
    expect(yellow?.length).toBe(2);  // segments 8–9
    expect(red?.length).toBe(2);     // segments 10–11
  });

  it('renders instrument display element', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const instEl = document.getElementById('bb-hmix-inst-1');
    expect(instEl).not.toBeNull();
    expect(instEl?.textContent).toContain('inst1');
  });

  it('renders sequence and pattern display elements', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const seqEl = document.getElementById('bb-hmix-seq-1');
    const patEl = document.getElementById('bb-hmix-pat-1');
    expect(seqEl).not.toBeNull();
    expect(patEl).not.toBeNull();
  });

  it('renders mute and solo buttons', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    expect(document.getElementById('bb-hmix-mute-1')).not.toBeNull();
    expect(document.getElementById('bb-hmix-solo-1')).not.toBeNull();
  });

  it('re-renders when channel structure changes', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    expect(document.getElementById('bb-hmix-strip-3')).toBeNull();

    eventBus.emit('parse:success', { ast: makeAst([1, 2, 3]) });
    expect(document.getElementById('bb-hmix-strip-3')).not.toBeNull();
  });

  it('does NOT re-render when channels are unchanged', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    const strip1Before = document.getElementById('bb-hmix-strip-1');

    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    const strip1After = document.getElementById('bb-hmix-strip-1');

    expect(strip1Before).toBe(strip1After); // same DOM node, no re-render
  });

  it('re-renders when chip changes', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2], 'gameboy') });
    const stripBefore = document.getElementById('bb-hmix-strip-1');

    eventBus.emit('parse:success', { ast: makeAst([1, 2], 'nes') });
    const stripAfter = document.getElementById('bb-hmix-strip-1');

    // Re-render creates a new DOM node for the strip
    expect(stripBefore).not.toBe(stripAfter);
  });

  // ── Volume fader chip-dependence ─────────────────────────────────────────────

  it('disables volume fader for gameboy (envelope-driven chip)', () => {
    eventBus.emit('parse:success', { ast: makeAst([1], 'gameboy') });

    const faderWrap = container.querySelector('.bb-hmix__fader-wrap');
    expect(faderWrap?.classList.contains('bb-hmix__fader-wrap--disabled')).toBe(true);

    const fader = document.getElementById('bb-hmix-fader-1') as HTMLInputElement | null;
    expect(fader?.disabled).toBe(true);
  });

  it('enables volume fader for nes (runtime volume chip)', () => {
    eventBus.emit('parse:success', { ast: makeAst([1], 'nes') });

    const faderWrap = container.querySelector('.bb-hmix__fader-wrap');
    expect(faderWrap?.classList.contains('bb-hmix__fader-wrap--disabled')).toBe(false);

    const fader = document.getElementById('bb-hmix-fader-1') as HTMLInputElement | null;
    expect(fader?.disabled).toBe(false);
  });

  // ── playback:position-changed ─────────────────────────────────────────────────

  it('updates instrument label on playback:position-changed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, currentInstrument: 'lead' }),
    });

    const instEl = document.getElementById('bb-hmix-inst-1');
    expect(instEl?.textContent).toBe('lead');
  });

  it('updates pattern display on playback:position-changed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, sourceSequence: 'main', currentPattern: 'melody' }),
    });

    // Sequence shown in seq element, pattern shown in pat element (separate lines)
    const seqEl = document.getElementById('bb-hmix-seq-1');
    const patEl = document.getElementById('bb-hmix-pat-1');
    expect(seqEl?.textContent).toBe('main');
    expect(patEl?.textContent).toBe('melody');
  });

  it('shows bar number when no pattern name is available', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, currentPattern: null, barNumber: 2 }),
    });

    const patEl = document.getElementById('bb-hmix-pat-1');
    expect(patEl?.textContent).toContain('Bar 3');
  });

  // ── playback:stopped ──────────────────────────────────────────────────────────

  it('resets instrument to default on playback:stopped', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    // Simulate playback changing the instrument display
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, currentInstrument: 'lead' }),
    });
    expect(document.getElementById('bb-hmix-inst-1')?.textContent).toBe('lead');

    eventBus.emit('playback:stopped', undefined);

    const instEl = document.getElementById('bb-hmix-inst-1');
    expect(instEl?.textContent).toBe('inst1'); // back to default
  });

  it('resets pattern display to "—" on playback:stopped', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, currentPattern: 'melody', sourceSequence: 'main' }),
    });

    eventBus.emit('playback:stopped', undefined);

    const seqEl = document.getElementById('bb-hmix-seq-1');
    const patEl = document.getElementById('bb-hmix-pat-1');
    expect(seqEl?.textContent).toBe('—');
    expect(patEl?.textContent).toBe('—');
  });

  // ── Mute / Solo ───────────────────────────────────────────────────────────────

  it('mute button has aria-pressed=false when channel is not muted', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const muteBtn = document.getElementById('bb-hmix-mute-1') as HTMLButtonElement | null;
    expect(muteBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(muteBtn?.classList.contains('bb-cp__btn--active')).toBe(false);
  });

  it('reflects muted state after toggleChannelMuted', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    channelStore.toggleChannelMuted(1);

    const muteBtn = document.getElementById('bb-hmix-mute-1') as HTMLButtonElement | null;
    expect(muteBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(muteBtn?.classList.contains('bb-cp__btn--active')).toBe(true);
  });

  it('adds silent class to strip when channel is muted', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    channelStore.toggleChannelMuted(1);

    const strip = document.getElementById('bb-hmix-strip-1');
    expect(strip?.classList.contains('bb-hmix__strip--silent')).toBe(true);
  });

  it('reflects soloed state after toggleChannelSoloed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });

    channelStore.toggleChannelSoloed(1);

    const soloBtn = document.getElementById('bb-hmix-solo-1') as HTMLButtonElement | null;
    expect(soloBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(soloBtn?.classList.contains('bb-cp__btn--active')).toBe(true);
  });

  it('marks non-soloed channels as silent when another is soloed', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });

    channelStore.toggleChannelSoloed(1);

    const strip2 = document.getElementById('bb-hmix-strip-2');
    expect(strip2?.classList.contains('bb-hmix__strip--silent')).toBe(true);
  });

  // ── Unmute All / Clear Solo toolbar buttons ────────────────────────────────

  it('unmute-all button is disabled when no channels are muted', () => {
    const btn = document.getElementById('bb-hmix-unmute-all') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
  });

  it('unmute-all button becomes enabled when a channel is muted', () => {
    channelStore.toggleChannelMuted(1);
    const btn = document.getElementById('bb-hmix-unmute-all') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(false);
  });

  it('clear-solo button is disabled when no channels are soloed', () => {
    const btn = document.getElementById('bb-hmix-clear-solo') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
  });

  it('clear-solo button becomes enabled when a channel is soloed', () => {
    channelStore.toggleChannelSoloed(1);
    const btn = document.getElementById('bb-hmix-clear-solo') as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(false);
  });

  // ── Show / hide ───────────────────────────────────────────────────────────────

  it('hide() sets display:none on root element', () => {
    mixer.hide();
    const root = document.getElementById('bb-horizontal-mixer');
    expect(root?.style.display).toBe('none');
  });

  it('show() removes display:none from root element', () => {
    mixer.hide();
    mixer.show();
    const root = document.getElementById('bb-horizontal-mixer');
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
    const root = document.getElementById('bb-horizontal-mixer');
    expect(root?.classList.contains('bb-hmix--collapsed')).toBe(false);
  });

  it('persists collapsed state to localStorage', () => {
    // Manually toggle collapse via the button
    const collapseBtn = container.querySelector('.bb-hmix__toolbar-btn') as HTMLButtonElement | null;
    collapseBtn?.click();

    const storedVal = localStorage.getItem('beatbax:ui.dawMixerCollapsed');
    expect(storedVal).toBe('true');
  });

  it('restores collapsed state from localStorage', () => {
    localStorage.setItem('beatbax:ui.dawMixerCollapsed', 'true');
    // Create a new mixer that reads persisted state
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    const mixer2 = new HorizontalMixer({ container: container2, eventBus });
    const root2 = container2.querySelector('#bb-horizontal-mixer');
    expect(root2?.classList.contains('bb-hmix--collapsed')).toBe(true);
    mixer2.destroy();
    document.body.removeChild(container2);
  });

  // ── song:loaded ───────────────────────────────────────────────────────────────

  it('re-renders empty (no channels) after song:loaded clears AST', () => {
    eventBus.emit('parse:success', { ast: makeAst([1, 2]) });
    expect(document.getElementById('bb-hmix-strip-1')).not.toBeNull();

    // song:loaded now triggers render() with no AST → shows empty placeholder
    eventBus.emit('song:loaded', { filename: 'new.bax' });

    expect(document.getElementById('bb-hmix-strip-1')).toBeNull();
    expect(container.innerHTML).toContain('No channels defined');
  });

  // ── VU meter level update ─────────────────────────────────────────────────────

  it('segments start unlit when no events have occurred', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });

    const vu = document.getElementById('bb-hmix-vu-1');
    const litSegs = vu?.querySelectorAll('.bb-hmix__vu-seg--lit');
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
    const mixer2 = new HorizontalMixer({ container: dockedContainer, inlineContainer, eventBus });
    mixer2.setDockMode('inline');
    expect(inlineContainer.querySelector('.bb-hmix')).not.toBeNull();
    expect(dockedContainer.querySelector('.bb-hmix')).toBeNull();
    mixer2.destroy();
    document.body.removeChild(dockedContainer);
    document.body.removeChild(inlineContainer);
  });

  it('setDockMode("docked") moves root back to docked container', () => {
    const dockedContainer = document.createElement('div');
    const inlineContainer = document.createElement('div');
    document.body.appendChild(dockedContainer);
    document.body.appendChild(inlineContainer);
    const mixer2 = new HorizontalMixer({ container: dockedContainer, inlineContainer, eventBus });
    mixer2.setDockMode('inline');
    mixer2.setDockMode('docked');
    expect(dockedContainer.querySelector('.bb-hmix')).not.toBeNull();
    expect(inlineContainer.querySelector('.bb-hmix')).toBeNull();
    mixer2.destroy();
    document.body.removeChild(dockedContainer);
    document.body.removeChild(inlineContainer);
  });

  it('inline mode adds bb-hmix--inline class to root', () => {
    const dockedContainer = document.createElement('div');
    const inlineContainer = document.createElement('div');
    document.body.appendChild(dockedContainer);
    document.body.appendChild(inlineContainer);
    const mixer2 = new HorizontalMixer({ container: dockedContainer, inlineContainer, eventBus });
    mixer2.setDockMode('inline');
    const root = inlineContainer.querySelector('.bb-hmix');
    expect(root?.classList.contains('bb-hmix--inline')).toBe(true);
    mixer2.destroy();
    document.body.removeChild(dockedContainer);
    document.body.removeChild(inlineContainer);
  });

  // ── Separate sequence/pattern readout ─────────────────────────────────────────

  it('shows sequence name in seq element and pattern in pat element separately', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, sourceSequence: 'intro', currentPattern: 'fill' }),
    });

    expect(document.getElementById('bb-hmix-seq-1')?.textContent).toBe('intro');
    expect(document.getElementById('bb-hmix-pat-1')?.textContent).toBe('fill');
  });

  it('shows — for sequence when not provided', () => {
    eventBus.emit('parse:success', { ast: makeAst([1]) });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: makePosition({ channelId: 1, sourceSequence: undefined, currentPattern: 'pat1' }),
    });

    expect(document.getElementById('bb-hmix-seq-1')?.textContent).toBe('—');
    expect(document.getElementById('bb-hmix-pat-1')?.textContent).toBe('pat1');
  });

  // ── destroy ───────────────────────────────────────────────────────────────────

  it('destroy() removes the root element', () => {
    mixer.destroy();
    expect(container.querySelector('.bb-hmix')).toBeNull();
  });
});
