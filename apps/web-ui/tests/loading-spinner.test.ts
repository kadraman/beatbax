/**
 * Unit tests for LoadingSpinner
 *
 * Covers:
 * - hideBoot() removes #bb-boot-spinner
 * - show() creates the overlay on first call and makes it visible
 * - show() updates the label text
 * - hide() hides the overlay when depth returns to 0
 * - hide() is a no-op when already hidden (depth never goes below 0)
 * - ref-counting: nested show/hide pairs keep overlay visible until balanced
 * - style tag is injected exactly once across multiple instances (static guard)
 * - overlay has required ARIA attributes
 * - DOM is clean between tests
 */

import { LoadingSpinner } from '../src/utils/loading-spinner';

// Reset the static stylesInjected flag and DOM between every test so each
// test runs in isolation, regardless of execution order.
beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  // Reset static field — access via the class itself (TypeScript allows bracket
  // access on the constructor for private statics in tests).
  (LoadingSpinner as any).stylesInjected = false;
});

// ─── hideBoot ────────────────────────────────────────────────────────────────

describe('hideBoot()', () => {
  it('removes #bb-boot-spinner when it exists', () => {
    const boot = document.createElement('div');
    boot.id = 'bb-boot-spinner';
    document.body.appendChild(boot);

    new LoadingSpinner().hideBoot();

    expect(document.getElementById('bb-boot-spinner')).toBeNull();
  });

  it('is a no-op when #bb-boot-spinner is absent', () => {
    expect(() => new LoadingSpinner().hideBoot()).not.toThrow();
  });
});

// ─── show() ──────────────────────────────────────────────────────────────────

describe('show()', () => {
  it('inserts #bb-activity-spinner into document.body on first call', () => {
    const spinner = new LoadingSpinner();
    spinner.show();

    expect(document.getElementById('bb-activity-spinner')).not.toBeNull();
  });

  it('makes the overlay visible', () => {
    const spinner = new LoadingSpinner();
    spinner.show();

    const overlay = document.getElementById('bb-activity-spinner') as HTMLElement;
    expect(overlay.hidden).toBe(false);
  });

  it('uses the default label "Loading…"', () => {
    const spinner = new LoadingSpinner();
    spinner.show();

    const label = document.querySelector('.bb-spinner-label') as HTMLElement;
    expect(label.textContent).toBe('Loading…');
  });

  it('sets a custom label when provided', () => {
    const spinner = new LoadingSpinner();
    spinner.show('Rendering WAV audio…');

    const label = document.querySelector('.bb-spinner-label') as HTMLElement;
    expect(label.textContent).toBe('Rendering WAV audio…');
  });

  it('updates the label on subsequent calls', () => {
    const spinner = new LoadingSpinner();
    spinner.show('Step 1');
    spinner.show('Step 2');

    const label = document.querySelector('.bb-spinner-label') as HTMLElement;
    expect(label.textContent).toBe('Step 2');
  });

  it('does not insert a second overlay element on repeated calls', () => {
    const spinner = new LoadingSpinner();
    spinner.show();
    spinner.show();

    expect(document.querySelectorAll('#bb-activity-spinner').length).toBe(1);
  });
});

// ─── hide() ──────────────────────────────────────────────────────────────────

describe('hide()', () => {
  it('hides the overlay after a matching show()', () => {
    const spinner = new LoadingSpinner();
    spinner.show();
    spinner.hide();

    const overlay = document.getElementById('bb-activity-spinner') as HTMLElement;
    expect(overlay.hidden).toBe(true);
  });

  it('is a no-op (does not throw) when called before show()', () => {
    const spinner = new LoadingSpinner();
    expect(() => spinner.hide()).not.toThrow();
  });

  it('depth never goes below 0 — extra hide() calls are safe', () => {
    const spinner = new LoadingSpinner();
    spinner.show();
    spinner.hide();
    spinner.hide(); // extra — should not throw or go negative
    expect(() => spinner.hide()).not.toThrow();
  });
});

// ─── ref-counting ──────────────────────────────────────────────────────────

describe('ref-counting', () => {
  it('keeps overlay visible while depth > 0', () => {
    const spinner = new LoadingSpinner();
    spinner.show('A');
    spinner.show('B'); // depth = 2
    spinner.hide();    // depth = 1 — still visible

    const overlay = document.getElementById('bb-activity-spinner') as HTMLElement;
    expect(overlay.hidden).toBe(false);
  });

  it('hides only when depth reaches 0', () => {
    const spinner = new LoadingSpinner();
    spinner.show('A'); // depth = 1
    spinner.show('B'); // depth = 2
    spinner.hide();    // depth = 1
    spinner.hide();    // depth = 0

    const overlay = document.getElementById('bb-activity-spinner') as HTMLElement;
    expect(overlay.hidden).toBe(true);
  });

  it('can be shown again after being fully hidden', () => {
    const spinner = new LoadingSpinner();
    spinner.show();
    spinner.hide();
    spinner.show('Round 2');

    const overlay = document.getElementById('bb-activity-spinner') as HTMLElement;
    expect(overlay.hidden).toBe(false);
    expect((document.querySelector('.bb-spinner-label') as HTMLElement).textContent).toBe('Round 2');
  });
});

// ─── style injection ─────────────────────────────────────────────────────────

describe('style injection', () => {
  it('injects a <style id="bb-spinner-dynamic-styles"> on first show()', () => {
    const spinner = new LoadingSpinner();
    spinner.show();

    expect(document.getElementById('bb-spinner-dynamic-styles')).not.toBeNull();
  });

  it('injects the style tag only once across multiple instances', () => {
    new LoadingSpinner().show();
    new LoadingSpinner().show();

    expect(document.querySelectorAll('#bb-spinner-dynamic-styles').length).toBe(1);
  });

  it('includes the @keyframes bb-spin rule', () => {
    new LoadingSpinner().show();

    const style = document.getElementById('bb-spinner-dynamic-styles') as HTMLStyleElement;
    expect(style.textContent).toContain('@keyframes bb-spin');
  });
});

// ─── ARIA attributes ─────────────────────────────────────────────────────────

describe('ARIA attributes', () => {
  it('sets role="status" on the overlay', () => {
    new LoadingSpinner().show();
    expect(document.getElementById('bb-activity-spinner')!.getAttribute('role')).toBe('status');
  });

  it('sets aria-live="polite" on the overlay', () => {
    new LoadingSpinner().show();
    expect(document.getElementById('bb-activity-spinner')!.getAttribute('aria-live')).toBe('polite');
  });

  it('sets aria-busy="true" on the overlay', () => {
    new LoadingSpinner().show();
    expect(document.getElementById('bb-activity-spinner')!.getAttribute('aria-busy')).toBe('true');
  });

  it('sets aria-hidden="true" on the decorative ring element', () => {
    new LoadingSpinner().show();
    const ring = document.querySelector('.bb-spinner-ring');
    expect(ring!.getAttribute('aria-hidden')).toBe('true');
  });
});
