import type { BeatBaxEditor } from '@beatbax/app-core/editor';

/** Regions that should not receive initial window focus on desktop. */
const CHROME_ROOTS = [
  '.desktop-title-bar',
  '#bb-toolbar-host',
  '#bb-status-bar-host',
  '.bb-transport',
  '.bb-toolbar',
  '.status-bar',
] as const;

const CHROME_SELECTOR = CHROME_ROOTS.join(',');

function isInChrome(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && !!el.closest(CHROME_SELECTOR);
}

/** Keep shell controls clickable but out of the default tab order. */
export function suppressChromeTabFocus(root: ParentNode = document): void {
  for (const selector of CHROME_ROOTS) {
    for (const button of root.querySelectorAll<HTMLElement>(`${selector} button`)) {
      button.tabIndex = -1;
    }
  }
}

export function blurChromeFocus(): void {
  if (isInChrome(document.activeElement)) {
    document.activeElement.blur();
  }
}

/** Move keyboard focus into Monaco after the shell finishes mounting. */
export function focusWorkspaceEditor(editor: BeatBaxEditor): void {
  const apply = () => {
    blurChromeFocus();
    editor.focus();
  };

  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  window.setTimeout(apply, 0);
  window.setTimeout(apply, 100);
}
