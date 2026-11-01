/**
 * PatternGrid DOM tests for timeline seek and loop (spec 097 / spec 014).
 */

import { PatternGrid } from '../src/ui/pattern-grid';
import { playbackStatus } from '@beatbax/app-core/stores/playback.store';
import {
  clearPlaybackRange,
  playbackLoopEnabled,
  playbackLoopRange,
  playbackStartStep,
  setPlaybackLoopRange,
  setPlaybackStartStep,
} from '@beatbax/app-core/stores/playback-range.store';

function makeSong() {
  return {
    chip: 'gameboy',
    pats: {
      intro: ['C4', 'D4', 'E4', 'F4'],
      verse: ['G4', 'A4', 'B4', 'C5'],
      chorus: ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'],
    },
    channels: [
      { id: 1, events: Array.from({ length: 16 }, () => ({ type: 'note', token: 'C4' })) },
      { id: 2, events: Array.from({ length: 16 }, () => ({ type: 'note', token: 'E4' })) },
    ],
  };
}

function makeAst() {
  return {
    pats: {
      intro: ['C4', 'D4', 'E4', 'F4'],
      verse: ['G4', 'A4', 'B4', 'C5'],
      chorus: ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'],
    },
    seqs: {
      lead: ['intro', 'verse', 'chorus'],
      bass: ['intro', 'verse', 'intro', 'verse'],
    },
    channels: [
      { id: 1, seqSpecTokens: ['lead'] },
      { id: 2, seqSpecTokens: ['bass'] },
    ],
  };
}

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: { clientX: number; pointerId?: number; button?: number; altKey?: boolean },
): void {
  const EventCtor = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;
  const event = new EventCtor(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    button: init.button ?? 0,
    altKey: init.altKey ?? false,
  });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
  target.dispatchEvent(event);
}

describe('PatternGrid timeline DOM (spec 097)', () => {
  let grid: PatternGrid;

  beforeEach(() => {
    document.body.innerHTML = '';
    clearPlaybackRange();
    playbackLoopEnabled.set(false);
    playbackStatus.set('stopped');
    grid = new PatternGrid();
    document.body.appendChild(grid.el);
    grid.setSong(makeSong(), makeAst());

    const rulerTrack = grid.el.querySelector('.bb-pgrid__track--ruler') as HTMLElement | null;
    if (rulerTrack) {
      rulerTrack.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 160,
        bottom: 12,
        width: 160,
        height: 12,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    }
  });

  afterEach(() => {
    grid.dispose();
    clearPlaybackRange();
    playbackLoopEnabled.set(false);
    playbackStatus.set('stopped');
  });

  it('renders a Pos ruler row above channel rows and shares label-cell classes', () => {
    const rulerRow = grid.el.querySelector('.bb-pgrid__row--ruler');
    expect(rulerRow).not.toBeNull();
    expect(rulerRow?.querySelector('.bb-pgrid__section-heading')?.textContent).toBe('Pos');
    expect(rulerRow?.querySelector('.bb-pgrid__dot--spacer')).not.toBeNull();

    const controls = grid.el.querySelectorAll('.bb-pgrid__controls');
    // 1 ruler row + 2 channel rows
    expect(controls).toHaveLength(3);
  });

  it('clicking the ruler calls onPickStart with the snapped block boundary', () => {
    const onPickStart = jest.fn((step: number) => setPlaybackStartStep(step));
    grid.onPickStart = onPickStart;

    const rulerTrack = grid.el.querySelector('.bb-pgrid__track--ruler')!;
    // 65px out of 160px on 16 steps = step ~6.5 -> snaps down to boundary 4
    dispatchPointer(rulerTrack, 'pointerdown', { clientX: 65 });
    dispatchPointer(rulerTrack, 'pointerup', { clientX: 65 });

    expect(onPickStart).toHaveBeenCalledWith(4);
    expect(grid.el.querySelector('.bb-pgrid__start-flag')).not.toBeNull();
    expect(grid.el.querySelector('.bb-pgrid__start-marker')).not.toBeNull();
  });

  it('dragging on the ruler calls onPickLoop(loop, true) and renders loop bar and handles', () => {
    const onPickLoop = jest.fn((loop, enableLoop: boolean) => {
      setPlaybackLoopRange(loop);
      if (enableLoop) playbackLoopEnabled.set(true);
    });
    grid.onPickLoop = onPickLoop;

    const rulerTrack = grid.el.querySelector('.bb-pgrid__track--ruler')!;
    // Drag from step ~5 (50px) to step ~10 (100px) -> snaps to [4, 12]
    dispatchPointer(rulerTrack, 'pointerdown', { clientX: 50 });
    dispatchPointer(rulerTrack, 'pointermove', { clientX: 100 });
    dispatchPointer(rulerTrack, 'pointerup', { clientX: 100 });

    expect(onPickLoop).toHaveBeenCalledWith({ startStep: 4, endStep: 12 }, true);
    expect(grid.el.querySelector('.bb-pgrid__ruler-loop')).not.toBeNull();
    expect(grid.el.querySelector('.bb-pgrid__loop-handle--start')).not.toBeNull();
    expect(grid.el.querySelector('.bb-pgrid__loop-handle--end')).not.toBeNull();
    const overlay = grid.el.querySelector('.bb-pgrid__loop-range') as HTMLElement | null;
    expect(overlay?.style.display).toBe('block');
  });

  it('dragging a loop bracket handle calls onPickLoop(loop, false)', () => {
    setPlaybackLoopRange({ startStep: 4, endStep: 12 });
    playbackLoopEnabled.set(true);

    const onPickLoop = jest.fn((loop) => setPlaybackLoopRange(loop));
    grid.onPickLoop = onPickLoop;

    const rulerTrack = grid.el.querySelector('.bb-pgrid__track--ruler')!;
    const endHandle = grid.el.querySelector('.bb-pgrid__loop-handle--end')!;

    dispatchPointer(endHandle, 'pointerdown', { clientX: 120 });
    dispatchPointer(rulerTrack, 'pointermove', { clientX: 155 });
    dispatchPointer(rulerTrack, 'pointerup', { clientX: 155 });

    expect(onPickLoop).toHaveBeenCalledWith({ startStep: 4, endStep: 16 }, false);
  });

  it('adds inactive classes to loop range when Loop is off', () => {
    setPlaybackLoopRange({ startStep: 4, endStep: 12 });
    playbackLoopEnabled.set(false);

    const rulerLoop = grid.el.querySelector('.bb-pgrid__ruler-loop');
    const overlay = grid.el.querySelector('.bb-pgrid__loop-range');
    expect(rulerLoop?.classList.contains('bb-pgrid__ruler-loop--inactive')).toBe(true);
    expect(overlay?.classList.contains('bb-pgrid__loop-range--inactive')).toBe(true);

    playbackLoopEnabled.set(true);
    expect(grid.el.querySelector('.bb-pgrid__ruler-loop')?.classList.contains('bb-pgrid__ruler-loop--inactive')).toBe(false);
    expect(grid.el.querySelector('.bb-pgrid__loop-range')?.classList.contains('bb-pgrid__loop-range--inactive')).toBe(false);
  });

  it('✕ button clears loop range first, then start marker', () => {
    setPlaybackStartStep(4);
    setPlaybackLoopRange({ startStep: 8, endStep: 16 });
    playbackLoopEnabled.set(true);

    const clearLoopBtn = grid.el.querySelector<HTMLButtonElement>('.bb-pgrid__btn--clear-range');
    expect(clearLoopBtn?.getAttribute('aria-label')).toBe('Clear loop range');
    clearLoopBtn?.click();

    expect(playbackLoopRange.get()).toBeNull();
    expect(playbackStartStep.get()).toBe(4);

    const clearStartBtn = grid.el.querySelector<HTMLButtonElement>('.bb-pgrid__btn--clear-range');
    expect(clearStartBtn?.getAttribute('aria-label')).toBe('Clear start marker');
    clearStartBtn?.click();

    expect(playbackStartStep.get()).toBeNull();
    expect(grid.el.querySelector('.bb-pgrid__section-heading')?.textContent).toBe('Pos');
  });

  it('rests the idle playhead at active loop start, else start flag, else 0 while stopped', () => {
    const cursor = grid.el.querySelector('.bb-pgrid__cursor--global') as HTMLElement;
    expect(cursor.style.left).toBe('0%');

    setPlaybackStartStep(8);
    expect(cursor.style.left).toBe('50%');

    setPlaybackLoopRange({ startStep: 4, endStep: 12 });
    playbackLoopEnabled.set(true);
    expect(cursor.style.left).toBe('25%');

    playbackLoopEnabled.set(false);
    expect(cursor.style.left).toBe('50%');
  });
});
