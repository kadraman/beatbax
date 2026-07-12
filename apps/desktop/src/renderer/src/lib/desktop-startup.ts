import type { MenuAction } from '../../../shared/electron-api';

const STARTUP_MENU_ACTION_PARAM = 'desktopAction';

function isMenuAction(value: string): value is MenuAction {
  if (value.startsWith('file:load-example:')) return true;
  return [
    'file:new',
    'file:open',
    'file:save',
    'file:save-as',
    'file:export-json',
    'file:export-midi',
    'file:export-uge',
    'file:export-wav',
    'playback:play',
    'playback:pause',
    'playback:stop',
    'edit:find',
    'edit:replace',
    'view:command-palette',
    'view:toggle-output',
    'view:toggle-problems',
    'view:toggle-toolbar',
    'view:toggle-transport-bar',
    'view:toggle-channel-mixer',
    'view:toggle-song-visualizer',
    'view:toggle-pattern-grid',
    'view:toggle-ai-assistant',
    'view:toggle-wrap-text',
    'view:toggle-fold-all',
    'view:zoom-in',
    'view:zoom-out',
    'view:zoom-reset',
    'view:toggle-theme',
    'view:settings',
    'view:reload',
    'view:toggle-devtools',
    'help:docs',
    'help:repo',
    'help:shortcuts',
    'help:about',
  ].includes(value);
}

/** Menu action passed when macOS recreates the main window after it was closed. */
export function readStartupMenuAction(): MenuAction | null {
  const action = new URLSearchParams(window.location.search).get(STARTUP_MENU_ACTION_PARAM);
  if (!action || !isMenuAction(action)) return null;
  return action;
}

export function shouldRestorePersistedSession(startupMenuAction: MenuAction | null): boolean {
  return startupMenuAction === null;
}
