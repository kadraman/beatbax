/**
 * Pattern Grid zoom helpers (spec 100).
 */

import {
  clampPxPerStep,
  contentWidth,
  DEFAULT_MIN_PX_PER_STEP,
  edgeAutoscrollDelta,
  fitPxPerStep,
  resolveAutoPxPerStep,
  steppedPxPerStep,
  zoomAboutAnchor,
} from '../src/playback/pattern-grid-zoom';

describe('fitPxPerStep', () => {
  it('fits the song into the viewport', () => {
    expect(fitPxPerStep(400, 100)).toBe(4);
    expect(fitPxPerStep(200, 400)).toBe(0.5);
  });

  it('falls back when width or steps are non-positive', () => {
    expect(fitPxPerStep(0, 100)).toBe(DEFAULT_MIN_PX_PER_STEP);
    expect(fitPxPerStep(400, 0)).toBe(DEFAULT_MIN_PX_PER_STEP);
  });
});

describe('resolveAutoPxPerStep', () => {
  it('fits when that stays at or above the readable minimum', () => {
    expect(resolveAutoPxPerStep(800, 100, 4)).toBe(8);
    expect(resolveAutoPxPerStep(400, 100, 4)).toBe(4);
  });

  it('uses the minimum and implies scroll when fitting would go smaller', () => {
    expect(resolveAutoPxPerStep(200, 100, 4)).toBe(4);
    expect(contentWidth(200, 100, 4)).toBe(400);
  });

  it('shows more of a long song as the viewport widens before scrolling', () => {
    const T = 200;
    const min = 4;
    const narrow = resolveAutoPxPerStep(400, T, min);
    const medium = resolveAutoPxPerStep(600, T, min);
    const wide = resolveAutoPxPerStep(1000, T, min);
    expect(narrow).toBe(4);
    expect(medium).toBe(4);
    expect(wide).toBe(5);
    expect(contentWidth(400, T, narrow) / 400).toBeGreaterThan(1);
    expect(contentWidth(600, T, medium) / 600).toBeGreaterThan(1);
    expect(contentWidth(1000, T, wide)).toBe(1000);
  });
});

describe('clampPxPerStep / steppedPxPerStep', () => {
  it('clamps to the configured bounds', () => {
    expect(clampPxPerStep(0.5, 4, 48)).toBe(4);
    expect(clampPxPerStep(100, 4, 48)).toBe(48);
    expect(clampPxPerStep(12, 4, 48)).toBe(12);
  });

  it('steps in and out multiplicatively within bounds', () => {
    expect(steppedPxPerStep(4, 'in', 1.25, 4, 48)).toBe(5);
    expect(steppedPxPerStep(5, 'out', 1.25, 4, 48)).toBe(4);
    expect(steppedPxPerStep(48, 'in', 1.25, 4, 48)).toBe(48);
    expect(steppedPxPerStep(4, 'out', 1.25, 4, 48)).toBe(4);
  });
});

describe('contentWidth', () => {
  it('is at least the viewport and at least T * pxPerStep', () => {
    expect(contentWidth(400, 50, 4)).toBe(400);
    expect(contentWidth(400, 200, 4)).toBe(800);
  });

  it('treats subpixel near-fit as fit (avoids a 1px Windows scrollbar)', () => {
    expect(contentWidth(400, 100, 4.001)).toBe(400);
    expect(contentWidth(400, 100, 4.01)).toBe(401);
  });
});

describe('zoomAboutAnchor', () => {
  it('keeps the anchored step under the same viewport X', () => {
    const oldPx = 4;
    const newPx = 8;
    const anchorStep = 50;
    const scrollLeft = 100;
    const viewportX = anchorStep * oldPx - scrollLeft;
    const nextScroll = zoomAboutAnchor({
      oldPxPerStep: oldPx,
      newPxPerStep: newPx,
      anchorStep,
      scrollLeft,
    });
    expect(anchorStep * newPx - nextScroll).toBeCloseTo(viewportX);
  });
});

describe('edgeAutoscrollDelta', () => {
  const rect = { left: 100, width: 400 };

  it('returns 0 in the middle of the scroller', () => {
    expect(edgeAutoscrollDelta(300, rect)).toBe(0);
  });

  it('scrolls left near the left edge and right near the right edge', () => {
    expect(edgeAutoscrollDelta(105, rect)).toBeLessThan(0);
    expect(edgeAutoscrollDelta(490, rect)).toBeGreaterThan(0);
  });
});
