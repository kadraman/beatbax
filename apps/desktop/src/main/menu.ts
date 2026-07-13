import { Menu, shell } from 'electron';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '../shared/electron-api';
import type { NativeMenuCheckAction, NativeMenuCheckState } from '../shared/native-menu-checks';
import { DEFAULT_NATIVE_MENU_CHECK_STATE } from '../shared/native-menu-checks';
import { DESKTOP_EXAMPLE_SONG_GROUPS } from '../shared/example-songs';
import { basenameFromPath } from './path-utils';

const isMac = process.platform === 'darwin';
const APP_DISPLAY_NAME = 'BeatBax';

export type AppMenuHandlers = {
  getWindow: () => BrowserWindow | null;
  onMenuAction: (action: MenuAction) => void;
  onOpenRecent?: (filePath: string) => void;
  onClearRecent?: () => void;
};

function sendMenuAction(handlers: AppMenuHandlers, action: MenuAction): void {
  handlers.onMenuAction(action);
}

function buildExampleSubmenu(handlers: AppMenuHandlers): MenuItemConstructorOptions[] {
  return DESKTOP_EXAMPLE_SONG_GROUPS.map((group) => ({
    label: group.group,
    submenu: group.songs.map((song) => ({
      label: song.label,
      click: () => sendMenuAction(handlers, `file:load-example:${song.path}`),
    })),
  }));
}

function buildRecentSubmenu(
  recentFiles: string[],
  onOpenRecent?: (filePath: string) => void,
  onClearRecent?: () => void,
): MenuItemConstructorOptions[] {
  if (recentFiles.length === 0) {
    return [{ label: 'No recent files', enabled: false }];
  }
  return [
    ...recentFiles.map((filePath) => ({
      label: basenameFromPath(filePath),
      toolTip: filePath,
      click: () => onOpenRecent?.(filePath),
    })),
    { type: 'separator' },
    { label: 'Clear Recently Opened...', enabled: !!onClearRecent, click: () => onClearRecent?.() },
  ];
}

function buildFileMenu(
  handlers: AppMenuHandlers,
  recentFiles: string[],
  menuChecks: NativeMenuCheckState,
): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction(handlers, 'file:new') },
    { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction(handlers, 'file:open') },
    {
      label: 'Open Recent',
      submenu: buildRecentSubmenu(recentFiles, handlers.onOpenRecent, handlers.onClearRecent),
    },
    { type: 'separator' },
    { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction(handlers, 'file:save') },
    { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuAction(handlers, 'file:save-as') },
    {
      label: 'Auto Save',
      type: 'checkbox',
      checked: menuChecks['file:toggle-auto-save'].checked,
      click: () => sendMenuAction(handlers, 'file:toggle-auto-save'),
    },
    { type: 'separator' },
    {
      label: 'Export',
      submenu: [
        { label: 'JSON', click: () => sendMenuAction(handlers, 'file:export-json') },
        { label: 'MIDI', click: () => sendMenuAction(handlers, 'file:export-midi') },
        { label: 'UGE', click: () => sendMenuAction(handlers, 'file:export-uge') },
        { label: 'WAV', click: () => sendMenuAction(handlers, 'file:export-wav') },
      ],
    },
  ];

  if (isMac) {
    submenu.push(
      { type: 'separator' },
      { label: 'Examples', submenu: buildExampleSubmenu(handlers) },
    );
  } else {
    submenu.push(
      { type: 'separator' },
      { role: 'quit' },
    );
  }

  return { label: 'File', submenu };
}

function buildMacEditMenu(handlers: AppMenuHandlers): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Find', accelerator: 'Cmd+F', click: () => sendMenuAction(handlers, 'edit:find') },
      { label: 'Replace', accelerator: 'Cmd+Option+F', click: () => sendMenuAction(handlers, 'edit:replace') },
    ],
  };
}

function buildMacViewMenu(
  handlers: AppMenuHandlers,
  checks: NativeMenuCheckState = DEFAULT_NATIVE_MENU_CHECK_STATE,
): MenuItemConstructorOptions {
  const toggle = (
    label: string,
    action: NativeMenuCheckAction,
    accelerator?: string,
  ): MenuItemConstructorOptions => ({
    label,
    type: 'checkbox',
    checked: checks[action].checked,
    enabled: checks[action].enabled !== false,
    accelerator,
    click: () => sendMenuAction(handlers, action),
  });

  return {
    label: 'View',
    submenu: [
      {
        label: 'Command Palette…',
        accelerator: 'Cmd+Shift+P',
        click: () => sendMenuAction(handlers, 'view:command-palette'),
      },
      { type: 'separator' },
      toggle('Output', 'view:toggle-output', 'Cmd+`'),
      toggle('Problems', 'view:toggle-problems', 'Alt+Shift+P'),
      toggle('Toolbar', 'view:toggle-toolbar', 'Cmd+Shift+B'),
      toggle('Transport Bar', 'view:toggle-transport-bar', 'Cmd+Shift+R'),
      toggle('Channel Mixer', 'view:toggle-channel-mixer', 'Cmd+Shift+M'),
      toggle('Song Visualizer', 'view:toggle-song-visualizer', 'Cmd+Shift+V'),
      toggle('Pattern Grid', 'view:toggle-pattern-grid', 'Cmd+Shift+G'),
      { type: 'separator' },
      toggle('AI Assistant', 'view:toggle-ai-assistant', 'Alt+Shift+I'),
      { type: 'separator' },
      toggle('Wrap Text', 'view:toggle-wrap-text'),
      toggle('Fold All', 'view:toggle-fold-all'),
      { type: 'separator' },
      { label: 'Zoom In', accelerator: 'Cmd+=', click: () => sendMenuAction(handlers, 'view:zoom-in') },
      { label: 'Zoom Out', accelerator: 'Cmd+-', click: () => sendMenuAction(handlers, 'view:zoom-out') },
      { label: 'Reset Zoom', accelerator: 'Cmd+0', click: () => sendMenuAction(handlers, 'view:zoom-reset') },
      { type: 'separator' },
      { label: 'Theme (Dark / Light)', accelerator: 'Cmd+Shift+L', click: () => sendMenuAction(handlers, 'view:toggle-theme') },
      { type: 'separator' },
      { label: 'Settings…', accelerator: 'Cmd+,', click: () => sendMenuAction(handlers, 'view:settings') },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      {
        label: 'Toggle Developer Tools',
        accelerator: 'Alt+Command+I',
        click: () => handlers.getWindow()?.webContents.toggleDevTools(),
      },
    ],
  };
}

function buildBasicViewMenu(handlers: AppMenuHandlers): MenuItemConstructorOptions {
  return {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      {
        label: 'Toggle Developer Tools',
        accelerator: 'Ctrl+Shift+I',
        click: () => handlers.getWindow()?.webContents.toggleDevTools(),
      },
    ],
  };
}

function buildMacHelpMenu(handlers: AppMenuHandlers): MenuItemConstructorOptions {
  return {
    label: 'Help',
    submenu: [
      {
        label: 'BeatBax Docs',
        click: () => {
          sendMenuAction(handlers, 'help:docs');
          void shell.openExternal('https://github.com/kadraman/beatbax#readme');
        },
      },
      {
        label: 'GitHub Repository',
        click: () => {
          sendMenuAction(handlers, 'help:repo');
          void shell.openExternal('https://github.com/kadraman/beatbax');
        },
      },
      { type: 'separator' },
      { label: 'Keyboard Shortcuts…', accelerator: 'Alt+Shift+K', click: () => sendMenuAction(handlers, 'help:shortcuts') },
      { type: 'separator' },
      { label: 'About BeatBax', click: () => sendMenuAction(handlers, 'help:about') },
    ],
  };
}

function buildBasicHelpMenu(handlers: AppMenuHandlers): MenuItemConstructorOptions {
  return {
    label: 'Help',
    submenu: [
      {
        label: 'BeatBax Docs',
        click: () => {
          sendMenuAction(handlers, 'help:docs');
          void shell.openExternal('https://github.com/kadraman/beatbax#readme');
        },
      },
      {
        label: 'GitHub Repository',
        click: () => {
          sendMenuAction(handlers, 'help:repo');
          void shell.openExternal('https://github.com/kadraman/beatbax');
        },
      },
      { type: 'separator' },
      { label: 'About BeatBax', click: () => sendMenuAction(handlers, 'help:about') },
    ],
  };
}

function buildMacAppMenu(handlers: AppMenuHandlers): MenuItemConstructorOptions {
  return {
    label: APP_DISPLAY_NAME,
    submenu: [
      { label: 'About BeatBax', click: () => sendMenuAction(handlers, 'help:about') },
      { type: 'separator' },
      { label: 'Settings…', accelerator: 'Cmd+,', click: () => sendMenuAction(handlers, 'view:settings') },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };
}

export function createMenuTemplate(
  recentFiles: string[],
  handlers: AppMenuHandlers,
  menuChecks: NativeMenuCheckState = DEFAULT_NATIVE_MENU_CHECK_STATE,
): MenuItemConstructorOptions[] {
  const fileMenu = buildFileMenu(handlers, recentFiles, menuChecks);

  if (isMac) {
    return [
      buildMacAppMenu(handlers),
      fileMenu,
      buildMacEditMenu(handlers),
      buildMacViewMenu(handlers, menuChecks),
      { role: 'windowMenu' },
      buildMacHelpMenu(handlers),
    ];
  }

  return [
    fileMenu,
    buildBasicViewMenu(handlers),
    buildBasicHelpMenu(handlers),
  ];
}

export function installAppMenu(
  recentFiles: string[],
  handlers: AppMenuHandlers,
  menuChecks: NativeMenuCheckState = DEFAULT_NATIVE_MENU_CHECK_STATE,
): void {
  const menu = Menu.buildFromTemplate(
    createMenuTemplate(recentFiles, handlers, menuChecks),
  );
  Menu.setApplicationMenu(menu);
}
