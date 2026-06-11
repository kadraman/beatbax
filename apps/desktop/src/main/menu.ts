import path from 'node:path';
import { Menu, shell } from 'electron';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '../shared/electron-api';
import { IPC_CHANNELS } from '../shared/ipc';

function sendMenuAction(window: BrowserWindow, action: MenuAction): void {
  window.webContents.send(IPC_CHANNELS.MENU_ACTION, action);
}

export function createMenuTemplate(window: BrowserWindow, recentFiles: string[]): MenuItemConstructorOptions[] {
  const recentSubmenu: MenuItemConstructorOptions[] = recentFiles.length > 0
    ? recentFiles.map((filePath) => ({
        label: path.basename(filePath),
        toolTip: filePath,
        click: () => window.webContents.send(IPC_CHANNELS.FILE_OPENED_REQUEST, filePath),
      }))
    : [{ label: 'No recent files', enabled: false }];

  return [
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction(window, 'file:new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction(window, 'file:open') },
        { label: 'Open Recent', submenu: recentSubmenu },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction(window, 'file:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuAction(window, 'file:save-as') },
        { type: 'separator' },
        {
          label: 'Export',
          submenu: [
            { label: 'JSON', click: () => sendMenuAction(window, 'file:export-json') },
            { label: 'MIDI', click: () => sendMenuAction(window, 'file:export-midi') },
            { label: 'UGE', click: () => sendMenuAction(window, 'file:export-uge') },
            { label: 'WAV', click: () => sendMenuAction(window, 'file:export-wav') },
          ],
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Playback',
      submenu: [
        { label: 'Play / Resume', accelerator: 'Space', click: () => sendMenuAction(window, 'playback:play') },
        { label: 'Pause', accelerator: 'Shift+Space', click: () => sendMenuAction(window, 'playback:pause') },
        { label: 'Stop', accelerator: 'Escape', click: () => sendMenuAction(window, 'playback:stop') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => window.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'BeatBax Docs', click: () => { sendMenuAction(window, 'help:docs'); void shell.openExternal('https://github.com/kadraman/beatbax#readme'); } },
        { label: 'GitHub Repository', click: () => { sendMenuAction(window, 'help:repo'); void shell.openExternal('https://github.com/kadraman/beatbax'); } },
      ],
    },
  ];
}

export function installAppMenu(window: BrowserWindow, recentFiles: string[]): void {
  const menu = Menu.buildFromTemplate(createMenuTemplate(window, recentFiles));
  Menu.setApplicationMenu(menu);
}
