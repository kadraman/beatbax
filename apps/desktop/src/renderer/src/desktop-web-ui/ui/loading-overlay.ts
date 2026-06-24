/**
 * LoadingOverlay — Full-screen loading blocker
 *
 * Displays a semi-transparent overlay with a spinner to prevent user interaction
 * while loading operations complete (e.g. opening files, loading examples).
 */

export class LoadingOverlay {
  private el: HTMLElement | null = null;
  private activeCount = 0;

  /**
   * Show the loading overlay (increments internal counter; only visible if counter > 0).
   * Use this when starting an async operation.
   */
  show(): void {
    this.activeCount++;
    if (this.activeCount === 1) {
      this.render();
    }
  }

  /**
   * Hide the loading overlay (decrements internal counter; hidden when counter reaches 0).
   * Use this when an async operation completes.
   */
  hide(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    if (this.activeCount === 0 && this.el) {
      this.el.remove();
      this.el = null;
    }
  }

  private render(): void {
    if (this.el) return; // Already rendered

    const overlay = document.createElement('div');
    overlay.className = 'bb-loading-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-label', 'Loading');

    const spinnerRing = document.createElement('div');
    spinnerRing.className = 'bb-spinner-ring';
    spinnerRing.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.textContent = 'Opening Song...';

    overlay.appendChild(spinnerRing);
    overlay.appendChild(label);
    document.body.appendChild(overlay);
    this.el = overlay;
  }
}
