/**
 * Pattern Grid zoom / fit math (spec 100). Pure helpers for desktop (and later web-lite).
 */

/** Readable minimum pixels per global step under Auto zoom. */
export const DEFAULT_MIN_PX_PER_STEP = 4;

/** Upper clamp for manual Zoom in. */
export const DEFAULT_MAX_PX_PER_STEP = 48;

/** Multiplicative step for Zoom in / out. */
export const DEFAULT_ZOOM_FACTOR = 1.25;

/** Force the whole song into the viewport width (may go below the readable minimum). */
export function fitPxPerStep(viewportWidth: number, totalSteps: number): number {
  if (viewportWidth <= 0 || totalSteps <= 0) return DEFAULT_MIN_PX_PER_STEP;
  return viewportWidth / totalSteps;
}

/**
 * Auto policy (FR-002): fit when that stays at or above `minPxPerStep`, otherwise
 * use the minimum and let the track scroll horizontally.
 */
export function resolveAutoPxPerStep(
  viewportWidth: number,
  totalSteps: number,
  minPxPerStep: number = DEFAULT_MIN_PX_PER_STEP,
): number {
  const fit = fitPxPerStep(viewportWidth, totalSteps);
  return Math.max(fit, minPxPerStep);
}

export function clampPxPerStep(
  pxPerStep: number,
  minPxPerStep: number = DEFAULT_MIN_PX_PER_STEP,
  maxPxPerStep: number = DEFAULT_MAX_PX_PER_STEP,
): number {
  if (!Number.isFinite(pxPerStep)) return minPxPerStep;
  return Math.min(maxPxPerStep, Math.max(minPxPerStep, pxPerStep));
}

/** Inner track content width so short songs still fill the viewport. */
export function contentWidth(
  viewportWidth: number,
  totalSteps: number,
  pxPerStep: number,
): number {
  if (totalSteps <= 0) return Math.max(0, viewportWidth);
  const needed = totalSteps * pxPerStep;
  // Float / DPI rounding can make needed ≈ viewportWidth + ε and force a
  // useless 1px scrollbar (especially on Windows). Treat near-fit as fit.
  if (needed <= viewportWidth + 0.5) return Math.max(0, viewportWidth);
  return needed;
}

/**
 * Scroll offset that keeps `anchorStep` under the same viewport X after a zoom
 * change (`viewportX = anchorStep * oldPx - scrollLeft`).
 */
export function zoomAboutAnchor(args: {
  oldPxPerStep: number;
  newPxPerStep: number;
  anchorStep: number;
  scrollLeft: number;
}): number {
  const { oldPxPerStep, newPxPerStep, anchorStep, scrollLeft } = args;
  const viewportX = anchorStep * oldPxPerStep - scrollLeft;
  return anchorStep * newPxPerStep - viewportX;
}

/** Next manual scale after Zoom in / out from the current effective scale. */
export function steppedPxPerStep(
  currentPxPerStep: number,
  direction: 'in' | 'out',
  factor: number = DEFAULT_ZOOM_FACTOR,
  minPxPerStep: number = DEFAULT_MIN_PX_PER_STEP,
  maxPxPerStep: number = DEFAULT_MAX_PX_PER_STEP,
): number {
  const next = direction === 'in' ? currentPxPerStep * factor : currentPxPerStep / factor;
  return clampPxPerStep(next, minPxPerStep, maxPxPerStep);
}

/**
 * Scroll delta that nudges the view when a pointer sits near a scroller edge
 * during a ruler drag (positive = scroll right).
 */
export function edgeAutoscrollDelta(
  clientX: number,
  scrollerRect: { left: number; width: number },
  edgePx: number = 28,
  maxStepPx: number = 18,
): number {
  if (scrollerRect.width <= 0 || edgePx <= 0) return 0;
  const leftDist = clientX - scrollerRect.left;
  const rightDist = scrollerRect.left + scrollerRect.width - clientX;
  if (leftDist < edgePx) {
    const t = 1 - Math.max(0, leftDist) / edgePx;
    return -Math.ceil(maxStepPx * t);
  }
  if (rightDist < edgePx) {
    const t = 1 - Math.max(0, rightDist) / edgePx;
    return Math.ceil(maxStepPx * t);
  }
  return 0;
}
