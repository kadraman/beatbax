/**
 * App modal dialogs.
 *
 * Currently exposes the Keyboard Shortcuts modal.  CSS for the modal lives in
 * src/styles.css (moved from the original document.createElement('style')
 * injection in main.ts).
 */

export interface ShortcutsModalController {
  /**
   * The element where the HelpPanel `singleSection: 'shortcuts'` instance
   * should be mounted.
   */
  container: HTMLElement;
  open():  void;
  close(): void;
}

/**
 * Build the Keyboard Shortcuts modal, append it to `document.body`, and
 * return a controller for opening / closing it.
 */
export function buildShortcutsModal(): ShortcutsModalController {
  const backdrop = document.createElement('div');
  backdrop.className = 'bb-shortcuts-modal-backdrop';
  backdrop.setAttribute('role',       'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Keyboard Shortcuts');

  const modalEl = document.createElement('div');
  modalEl.className = 'bb-shortcuts-modal';

  const header = document.createElement('div');
  header.className = 'bb-shortcuts-modal-header';

  const title = document.createElement('span');
  title.className   = 'bb-shortcuts-modal-header-title';
  title.textContent = 'Keyboard Shortcuts';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'bb-shortcuts-modal-close';
  closeBtn.setAttribute('aria-label', 'Close keyboard shortcuts');
  closeBtn.textContent = '✕';

  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = 'bb-shortcuts-modal-body';

  const container = document.createElement('div');
  container.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
  body.appendChild(container);

  modalEl.append(header, body);
  backdrop.appendChild(modalEl);
  document.body.appendChild(backdrop);

  const open  = (): void => { backdrop.classList.add('bb-shortcuts-modal--open'); closeBtn.focus(); };
  const close = (): void => { backdrop.classList.remove('bb-shortcuts-modal--open'); };

  // Close on backdrop click, close-button click, and Escape key.
  backdrop.addEventListener('click',   (e) => { if (e.target === backdrop) close(); });
  closeBtn.addEventListener('click',   close);
  backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });

  return { container, open, close };
}
