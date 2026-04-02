/**
 * LoadingSpinner — manages a boot overlay and a modal activity indicator.
 *
 * Boot overlay (#bb-boot-spinner):
 *   Rendered as a static HTML element in index.html so it appears
 *   immediately, before any JavaScript runs.  Call hideBoot() once the editor
 *   is ready to remove it.
 *
 * Activity overlay (#bb-activity-spinner):
 *   Created dynamically on first show() call.  Use show(label) / hide() to
 *   wrap any async operation that may take more than ~300 ms.  A ref-count
 *   ensures nested show/hide pairs work correctly.
 */
export class LoadingSpinner {
  private overlay: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private depth = 0;

  /** Remove the static boot overlay from the DOM (call once, after editor init). */
  hideBoot(): void {
    document.getElementById('bb-boot-spinner')?.remove();
  }

  /**
   * Show the activity spinner with `label`.
   * Calls are ref-counted — every show() should be balanced by a hide().
   */
  show(label = 'Loading…'): void {
    this.depth++;
    if (!this.overlay) {
      this._createOverlay();
    }
    if (this.labelEl) this.labelEl.textContent = label;
    this.overlay!.hidden = false;
  }

  /** Hide the activity spinner.  Only actually hides when the depth returns to 0. */
  hide(): void {
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0 && this.overlay) {
      this.overlay.hidden = true;
    }
  }

  private _createOverlay(): void {
    const el = document.createElement('div');
    el.id = 'bb-activity-spinner';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-busy', 'true');
    el.innerHTML =
      '<div class="bb-spinner-ring" aria-hidden="true"></div>' +
      '<span class="bb-spinner-label"></span>';
    document.body.appendChild(el);
    this.overlay = el;
    this.labelEl = el.querySelector<HTMLElement>('.bb-spinner-label');
  }
}
