import { Menu, shell } from 'electron';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import { electronAcceleratorForCommand } from '@beatbax/app-core/shortcuts';
import type { MenuAction } from '../shared/electron-api';
import type { NativeMenuCheckAction, NativeMenuCheckState } from '../shared/native-menu-checks';
import { DEFAULT_NATIVE_MENU_CHECK_STATE } from '../shared/native-menu-checks';
import { DESKTOP_EXAMPLE_SONG_GROUPS } from '../shared/example-songs';
import { basenameFromPath } from './path-utils';

const isMac = process.platform === 'darwin';
const APP_DISPLAY_NAME = 'BeatBax';
const DESKTOP_PROFILE = 'desktop-full' as const;

function accel(id: Parameters<typeof electronAcceleratorForCommand>[0]): string | undefined {
  return electronAcceleratorForCommand(id, DESKTOP_PROFILE);
}

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
    { label: 'New', accelerator: accel('file.new'), click: () => sendMenuAction(handlers, 'file:new') },
    { label: 'Open…', accelerator: accel('file.open'), click: () => sendMenuAction(handlers, 'file:open') },
    {
      label: 'Open Recent',
      submenu: buildRecentSubmenu(recentFiles, handlers.onOpenRecent, handlers.onClearRecent),
    },
    { type: 'separator' },
    { label: 'Save', accelerator: accel('file.save'), click: () => sendMenuAction(handlers, 'file:save') },
    { label: 'Save As…', accelerator: accel('file.saveAs'), click: () => sendMenuAction(handlers, 'file:save-as') },
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
      { label: 'Exit', role: 'quit' },
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
        accelerator: accel('tools.openCommandPalette'),
        click: () => sendMenuAction(handlers, 'view:command-palette'),
      },
      { type: 'separator' },
      toggle('Output', 'view:toggle-output', accel('view.showOutput')),
      toggle('Problems', 'view:toggle-problems', accel('view.showProblems')),
      toggle('Toolbar', 'view:toggle-toolbar', accel('view.toggleToolbar')),
      toggle('Transport Bar', 'view:toggle-transport-bar', accel('view.toggleTransportBar')),
      toggle('Channel Mixer', 'view:toggle-channel-mixer', accel('view.toggleChannelMixer')),
      toggle('Song Visualizer', 'view:toggle-song-visualizer', accel('view.showSongVisualizer')),
      toggle('Pattern Grid', 'view:toggle-pattern-grid', accel('view.togglePatternGrid')),
      { type: 'separator' },
      toggle('AI Assistant', 'view:toggle-ai-assistant', accel('tools.toggleCopilot')),
      { type: 'separator' },
      toggle('Wrap Text', 'view:toggle-wrap-text'),
      toggle('Fold All', 'view:toggle-fold-all'),
      { type: 'separator' },
      { label: 'Zoom In', accelerator: 'Cmd+=', click: () => sendMenuAction(handlers, 'view:zoom-in') },
      { label: 'Zoom Out', accelerator: 'Cmd+-', click: () => sendMenuAction(handlers, 'view:zoom-out') },
      { label: 'Reset Zoom', accelerator: 'Cmd+0', click: () => sendMenuAction(handlers, 'view:zoom-reset') },
      { type: 'separator' },
      { label: 'Theme (Dark / Light)', accelerator: accel('view.toggleTheme'), click: () => sendMenuAction(handlers, 'view:toggle-theme') },
      { type: 'separator' },
      { label: 'Settings…', accelerator: accel('tools.openSettings'), click: () => sendMenuAction(handlers, 'view:settings') },
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
      { label: 'Keyboard Shortcuts…', accelerator: accel('help.showShortcuts'), click: () => sendMenuAction(handlers, 'help:shortcuts') },
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
      { label: 'Settings…', accelerator: accel('tools.openSettings'), click: () => sendMenuAction(handlers, 'view:settings') },
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
