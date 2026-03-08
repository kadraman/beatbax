/**
 * Error boundary utilities for BeatBax Web UI.
 *
 * Three layers of protection:
 * 1. withErrorBoundary  — wraps individual component init; renders an inline
 *    error card if it throws so the rest of the app keeps loading.
 * 2. showFatalError     — full-screen overlay for catastrophic init failures.
 * 3. installGlobalErrorHandlers — window.onerror + unhandledrejection hook that
 *    forwards to a caller-supplied callback (usually OutputPanel.addMessage).
 */

import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:error-boundary');

// ─── Inline component error card ─────────────────────────────────────────────

function renderErrorCard(container: HTMLElement, label: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  const card = document.createElement('div');
  card.setAttribute('data-bb-error-boundary', label);
  card.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'gap:6px',
    'padding:12px 16px',
    'margin:8px',
    'border-radius:6px',
    'border:1px solid #f48771',
    'background:#2a1a1a',
    'color:#f48771',
    'font-family:Consolas,monospace',
    'font-size:12px',
  ].join(';');

  const title = document.createElement('strong');
  title.textContent = `Component error — ${label}`;
  title.style.cssText = 'font-size:13px;';

  const body = document.createElement('span');
  // Escape text to prevent XSS before inserting via textContent (safe)
  body.textContent = msg;

  const hint = document.createElement('span');
  hint.style.cssText = 'color:#858585;';
  hint.textContent = 'This component failed to initialise. Other parts of the app may still work.';

  card.append(title, body, hint);
  container.appendChild(card);
}

/**
 * Execute `fn` inside a try/catch.
 *
 * - On success: returns the result of `fn`.
 * - On failure: logs the error, renders an error card inside `container`
 *   (if provided), and returns `null` so callers can guard with `?? fallback`.
 */
export function withErrorBoundary<T>(
  label: string,
  fn: () => T,
  container?: HTMLElement | null,
): T | null {
  try {
    return fn();
  } catch (err) {
    log.error(`[${label}] component init failed:`, err);
    if (container) {
      renderErrorCard(container, label, err);
    }
    return null;
  }
}

// ─── Fatal error overlay ──────────────────────────────────────────────────────

/** Render a full-screen error overlay. Call when startup itself fails. */
export function showFatalError(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? '') : '';

  log.error('Fatal initialisation error:', error);

  // Remove any existing overlay first
  document.getElementById('bb-fatal-error')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'bb-fatal-error';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:99999',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'background:#1a0a0a',
    'color:#f48771',
    'font-family:Consolas,monospace',
    'padding:40px',
    'gap:16px',
  ].join(';');

  const icon = document.createElement('div');
  icon.textContent = '⚠';
  icon.style.cssText = 'font-size:48px;';

  const heading = document.createElement('h2');
  heading.textContent = 'BeatBax failed to start';
  heading.style.cssText = 'margin:0; font-size:22px; color:#ff8a80;';

  const msgEl = document.createElement('p');
  msgEl.textContent = msg;
  msgEl.style.cssText = 'margin:0; font-size:14px; max-width:640px; text-align:center;';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex; gap:12px;';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload';
  reloadBtn.style.cssText = [
    'padding:8px 20px',
    'font-size:14px',
    'cursor:pointer',
    'border-radius:4px',
    'border:1px solid #f48771',
    'background:transparent',
    'color:#f48771',
  ].join(';');
  reloadBtn.addEventListener('click', () => window.location.reload());

  actions.appendChild(reloadBtn);
  overlay.append(icon, heading, msgEl, actions);

  if (stack) {
    const details = document.createElement('details');
    details.style.cssText = 'max-width:700px; width:100%; font-size:11px; color:#858585;';
    const summary = document.createElement('summary');
    summary.textContent = 'Stack trace';
    summary.style.cssText = 'cursor:pointer; margin-bottom:8px;';
    const pre = document.createElement('pre');
    // Use textContent to avoid XSS
    pre.textContent = stack;
    pre.style.cssText = [
      'overflow:auto',
      'max-height:220px',
      'padding:10px',
      'background:#111',
      'border-radius:4px',
      'white-space:pre-wrap',
      'word-break:break-all',
    ].join(';');
    details.append(summary, pre);
    overlay.appendChild(details);
  }

  document.body.appendChild(overlay);
}

// ─── Global error handlers ────────────────────────────────────────────────────

export type GlobalErrorCallback = (message: string, error?: unknown) => void;

/**
 * Install `window.onerror` and `unhandledrejection` handlers.
 * The provided `callback` receives a human-readable message so the caller
 * can forward it to wherever errors are displayed (e.g. OutputPanel).
 *
 * Returns a teardown function that removes the handlers.
 */
export function installGlobalErrorHandlers(callback: GlobalErrorCallback): () => void {
  const onError = (
    event: string | Event,
    _source?: string,
    _lineno?: number,
    _colno?: number,
    error?: Error,
  ) => {
    const msg =
      error?.message ??
      (typeof event === 'string' ? event : (event as ErrorEvent).message) ??
      'Unknown error';
    log.error('Uncaught error:', msg, error);
    callback(msg, error);
    // Don't suppress default browser handling
    return false;
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection';
    log.error('Unhandled rejection:', reason);
    callback(msg, reason);
  };

  window.addEventListener('error', onError as EventListener);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onError as EventListener);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
