export interface SectionFocusOverlayOptions {
  onExit: () => void;
}

export interface SectionFocusOverlayHandle {
  setFocus: (active: boolean) => void;
  dispose: () => void;
}

/**
 * Exit control for section-focus mode, overlaid at the top-right of the editor pane.
 */
export function setupSectionFocusOverlay(
  editorPane: HTMLElement,
  options: SectionFocusOverlayOptions,
): SectionFocusOverlayHandle {
  const root = document.createElement('div');
  root.className = 'bb-section-focus-overlay';
  root.hidden = true;

  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.className = 'bb-section-focus-overlay-exit';
  exitBtn.textContent = 'Exit focus';
  exitBtn.title = 'Leave section focus (Esc)';
  exitBtn.setAttribute('aria-label', 'Exit section focus');

  root.appendChild(exitBtn);
  editorPane.appendChild(root);

  const onExit = (): void => options.onExit();
  exitBtn.addEventListener('click', onExit);

  return {
    setFocus: (active) => {
      root.hidden = !active;
    },
    dispose: () => {
      exitBtn.removeEventListener('click', onExit);
      root.remove();
    },
  };
}
