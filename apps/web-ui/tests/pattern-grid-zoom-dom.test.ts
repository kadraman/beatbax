/**
 * PatternGrid zoom / scroll DOM tests (spec 107).
 */

import { PatternGrid } from '../src/ui/pattern-grid';
import { playbackStatus } from '@beatbax/app-core/stores/playback.store';
import {
  clearPlaybackRange,
  playbackLoopEnabled,
  playbackStartStep,
  setPlaybackLoopRange,
  setPlaybackStartStep,
} from '@beatbax/app-core/stores/playback-range.store';
import {
  contentWidth,
  fitPxPerStep,
  resolveAutoPxPerStep,
  steppedPxPerStep,
} from '@beatbax/app-core/playback/pattern-grid-zoom';

function songWithSteps(totalSteps: number) {
  const notes = Array.from({ length: totalSteps }, () => 'C4');
  return {
    song: {
      chip: 'gameboy',
      pats: { lead: notes },
      channels: [
        { id: 1, events: notes.map((token) => ({ type: 'note', token })) },
      ],
    },
    ast: {
      pats: { lead: notes },
      seqs: { lead_seq: ['lead'] },
      channels: [{ id: 1, seqSpecTokens: ['lead_seq'] }],
    },
  };
}

function setClientWidth(el: HTMLElement, width: number): void {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width });
}

function contentEl(grid: PatternGrid): HTMLElement {
  return grid.el.querySelector('.bb-pgrid__content') as HTMLElement;
}

function scrollerEl(grid: PatternGrid): HTMLElement {
  return grid.el.querySelector('.bb-pgrid__scroller') as HTMLElement;
}

function relayout(grid: PatternGrid, viewport: number): void {
  setClientWidth(scrollerEl(grid), viewport);
  window.dispatchEvent(new Event('resize'));
}

describe('PatternGrid zoom DOM (spec 107)', () => {
  let grid: PatternGrid;

  beforeEach(() => {
    document.body.innerHTML = '';
    clearPlaybackRange();
    playbackLoopEnabled.set(false);
    playbackStatus.set('stopped');
    grid = new PatternGrid();
    document.body.appendChild(grid.el);
  });

  afterEach(() => {
    grid.dispose();
    clearPlaybackRange();
    playbackLoopEnabled.set(false);
    playbackStatus.set('stopped');
  });

  it('uses the readable minimum and a wider strip for a long song under Auto', () => {
    const { song, ast } = songWithSteps(80);
    grid.setSong(song, ast);
    const viewport = 200;
    relayout(grid, viewport);
    const px = resolveAutoPxPerStep(viewport, 80);
    expect(px).toBe(4);
    expect(contentEl(grid).style.width).toBe(`${contentWidth(viewport, 80, px)}px`);
    expect(parseFloat(contentEl(grid).style.width)).toBeGreaterThan(viewport);
    expect(grid.el.dataset['zoomMode']).toBe('auto');
  });

  it('fits a short song to the viewport under Auto', () => {
    const { song, ast } = songWithSteps(16);
    grid.setSong(song, ast);
    const viewport = 200;
    relayout(grid, viewport);
    const px = resolveAutoPxPerStep(viewport, 16);
    expect(px).toBeGreaterThanOrEqual(4);
    expect(contentEl(grid).style.width).toBe(`${contentWidth(viewport, 16, px)}px`);
    expect(parseFloat(contentEl(grid).style.width)).toBe(viewport);
  });

  it('Fit forces the whole song into the viewport and Zoom in leaves Auto', () => {
    const { song, ast } = songWithSteps(80);
    grid.setSong(song, ast);
    const viewport = 200;
    relayout(grid, viewport);

    const fitBtn = grid.el.querySelector<HTMLButtonElement>('button[aria-label^="Zoom to fit"]');
    fitBtn?.click();
    const fitPx = fitPxPerStep(viewport, 80);
    expect(fitPx).toBeLessThan(4);
    expect(contentEl(grid).style.width).toBe(`${contentWidth(viewport, 80, fitPx)}px`);
    expect(grid.el.dataset['zoomMode']).toBe('fit');

    const zoomIn = grid.el.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    zoomIn?.click();
    const manual = steppedPxPerStep(fitPx, 'in');
    expect(grid.el.dataset['zoomMode']).toBe('manual');
    expect(contentEl(grid).style.width).toBe(`${contentWidth(viewport, 80, manual)}px`);
    expect(parseFloat(contentEl(grid).style.width)).toBeGreaterThan(viewport);
  });

  it('zoom controls do not clear a pending start or loop', () => {
    const { song, ast } = songWithSteps(16);
    grid.setSong(song, ast);
    relayout(grid, 200);
    setPlaybackStartStep(4);

    grid.el.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.click();
    grid.el.querySelector<HTMLButtonElement>('button[aria-label^="Zoom to fit"]')?.click();
    grid.el.querySelector<HTMLButtonElement>('button[aria-label^="Auto zoom"]')?.click();
    grid.el.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')?.click();

    expect(playbackStartStep.get()).toBe(4);
    expect(grid.el.querySelector('.bb-pgrid__start-flag')).not.toBeNull();
    const position = grid.el.querySelector('.bb-pgrid__nav-chip--position');
    expect(position?.querySelector('.bb-pgrid__nav-chip-value')?.textContent).toBe('4');
    expect(position?.getAttribute('title')).toBe('Playback start');
  });

  it('shows the loop range chip and the Desktop zoom hover text', () => {
    const { song, ast } = songWithSteps(16);
    grid.setSong(song, ast);
    setPlaybackLoopRange({ startStep: 4, endStep: 12 });
    playbackLoopEnabled.set(true);

    const loop = grid.el.querySelector('.bb-pgrid__nav-chip--loop');
    expect(loop?.querySelector('.bb-pgrid__nav-chip-label')?.textContent).toBe('Loop');
    expect(loop?.querySelector('.bb-pgrid__nav-chip-value')?.textContent).toBe('4–11');
    expect(loop?.getAttribute('title')).toBe('Loop range');

    const auto = grid.el.querySelector<HTMLButtonElement>('button[aria-label^="Auto zoom"]');
    expect(auto?.title).toContain('readable block size');
    expect(auto?.title).toContain('scroll horizontally');
    const fit = grid.el.querySelector<HTMLButtonElement>('button[aria-label^="Zoom to fit"]');
    expect(fit?.title).toContain('whole song');
    expect(grid.el.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')?.title).toBe('Zoom out');
    expect(grid.el.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.title).toBe('Zoom in');
  });

  it('resetZoom returns the next song to Auto', () => {
    const { song, ast } = songWithSteps(80);
    grid.setSong(song, ast);
    relayout(grid, 200);
    grid.el.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.click();
    expect(grid.el.dataset['zoomMode']).toBe('manual');

    grid.setSong(song, ast);
    relayout(grid, 200);
    expect(grid.el.dataset['zoomMode']).toBe('manual');

    grid.resetZoom();
    grid.setSong(song, ast);
    relayout(grid, 200);
    expect(grid.el.dataset['zoomMode']).toBe('auto');
  });

  it('maps a ruler click to the same snapped step after zoom and scroll', () => {
    const notes = (n: number) => Array.from({ length: n }, () => 'C4');
    const song = {
      chip: 'gameboy',
      pats: { intro: notes(4), verse: notes(4), chorus: notes(8) },
      channels: [{ id: 1, events: notes(16).map((token) => ({ type: 'note', token })) }],
    };
    const ast = {
      pats: { intro: notes(4), verse: notes(4), chorus: notes(8) },
      seqs: { lead: ['intro', 'verse', 'chorus'] },
      channels: [{ id: 1, seqSpecTokens: ['lead'] }],
    };
    grid.setSong(song, ast);
    const viewport = 40;
    relayout(grid, viewport);
    const px = resolveAutoPxPerStep(viewport, 16);
    const width = contentWidth(viewport, 16, px);
    expect(width).toBeGreaterThan(viewport);

    const onPickStart = jest.fn();
    grid.onPickStart = onPickStart;
    const rulerTrack = grid.el.querySelector('.bb-pgrid__track--ruler') as HTMLElement;
    const scrollLeft = 16;
    scrollerEl(grid).scrollLeft = scrollLeft;
    rulerTrack.getBoundingClientRect = () => ({
      left: -scrollLeft,
      top: 0,
      right: width - scrollLeft,
      bottom: 12,
      width,
      height: 12,
      x: -scrollLeft,
      y: 0,
      toJSON: () => ({}),
    });

    const EventCtor = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;
    const down = new EventCtor('pointerdown', { bubbles: true, cancelable: true, clientX: 0, button: 0 });
    Object.defineProperty(down, 'pointerId', { value: 1 });
    const up = new EventCtor('pointerup', { bubbles: true, cancelable: true, clientX: 0, button: 0 });
    Object.defineProperty(up, 'pointerId', { value: 1 });
    rulerTrack.dispatchEvent(down);
    rulerTrack.dispatchEvent(up);

    // clientX 0 with the track scrolled 16px lands on step 4 of 16 (one block in).
    expect(onPickStart).toHaveBeenCalledWith(4);
  });
});
