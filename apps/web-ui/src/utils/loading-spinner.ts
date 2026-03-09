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
  private static stylesInjected = false;

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
      this._ensureStyles();
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

  private _ensureStyles(): void {
    if (LoadingSpinner.stylesInjected) return;
    LoadingSpinner.stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'bb-spinner-dynamic-styles';
    style.textContent = `
@keyframes bb-spin { to { transform: rotate(360deg); } }
#bb-activity-spinner {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(0, 0, 0, 0.55);
  z-index: 10000;
  color: #e0e0e0;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  backdrop-filter: blur(2px);
}
#bb-activity-spinner[hidden] { display: none; }
#bb-activity-spinner .bb-spinner-ring {
  width: 44px;
  height: 44px;
  border: 4px solid rgba(255, 255, 255, 0.15);
  border-top-color: #4ec9b0;
  border-radius: 50%;
  animation: bb-spin 0.7s linear infinite;
}
#bb-activity-spinner .bb-spinner-label {
  letter-spacing: 0.03em;
  opacity: 0.85;
}
`;
    document.head.appendChild(style);
  }
}
