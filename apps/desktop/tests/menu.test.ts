/** @jest-environment node */

import type { MenuItemConstructorOptions } from 'electron';
import { createMenuTemplate, type AppMenuHandlers } from '../src/main/menu';
import type { MenuAction } from '../src/shared/electron-api';
import { DEFAULT_NATIVE_MENU_CHECK_STATE } from '../src/shared/native-menu-checks';

function findTopLevelMenu(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions {
  const item = template.find((entry) => entry.label === label);
  if (!item) throw new Error(`Menu not found: ${label}`);
  return item;
}

describe('desktop native menu', () => {
  const mockWindow = {
    webContents: {
      send: jest.fn(),
      toggleDevTools: jest.fn(),
    },
  } as any;

  let onMenuAction: jest.Mock<void, [MenuAction]>;

  const handlers = (): AppMenuHandlers => ({
    getWindow: () => mockWindow,
    onMenuAction: onMenuAction,
    onOpenRecent: undefined,
    onClearRecent: undefined,
  });

  const isMac = process.platform === 'darwin';

  beforeEach(() => {
    mockWindow.webContents.send.mockClear();
    onMenuAction = jest.fn();
  });

  it('includes file, view, and help menus', () => {
    const template = createMenuTemplate(['/tmp/song.bax'], handlers());
    const labels = template.map((item) => item.label).filter(Boolean);
    if (isMac) {
      expect(labels).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Help']));
      expect(labels).not.toContain('Playback');
      expect(template[0].submenu && Array.isArray(template[0].submenu)
        && template[0].submenu.some((item) => item.label === 'About BeatBax')).toBe(true);
    } else {
      expect(labels).toEqual(['File', 'View', 'Help']);
    }
  });

  it('includes export submenu entries', () => {
    const template = createMenuTemplate([], handlers());
    const fileMenu = findTopLevelMenu(template, 'File').submenu as MenuItemConstructorOptions[];
    const exportMenu = fileMenu.find((item) => item.label === 'Export')!;
    expect((exportMenu.submenu as MenuItemConstructorOptions[]).map((item) => item.label))
      .toEqual(['JSON', 'MIDI', 'UGE', 'WAV']);
  });

  it('shows basename labels in Open Recent', () => {
    const template = createMenuTemplate(['/home/runner/music/duck_tales.bax'], handlers());
    const fileMenu = findTopLevelMenu(template, 'File').submenu as MenuItemConstructorOptions[];
    const openRecent = fileMenu.find((item) => item.label === 'Open Recent')!;
    const recentItems = openRecent.submenu as MenuItemConstructorOptions[];
    expect(recentItems[0].label).toBe('duck_tales.bax');
    expect(recentItems[0].toolTip).toBe('/home/runner/music/duck_tales.bax');
  });

  it('opens recent files via the provided callback', () => {
    const onOpenRecent = jest.fn();
    const template = createMenuTemplate(
      ['/home/runner/music/duck_tales.bax'],
      { ...handlers(), onOpenRecent },
    );
    const fileMenu = findTopLevelMenu(template, 'File').submenu as MenuItemConstructorOptions[];
    const openRecent = fileMenu.find((item) => item.label === 'Open Recent')!;
    const recentItems = openRecent.submenu as MenuItemConstructorOptions[];

    recentItems[0].click?.({} as any, mockWindow, {} as any);

    expect(onOpenRecent).toHaveBeenCalledWith('/home/runner/music/duck_tales.bax');
    expect(onMenuAction).not.toHaveBeenCalled();
  });

  it('dispatches file actions via onMenuAction', () => {
    const template = createMenuTemplate([], handlers());
    const fileMenu = findTopLevelMenu(template, 'File').submenu as MenuItemConstructorOptions[];
    const newItem = fileMenu.find((item) => item.label === 'New')!;

    newItem.click?.({} as any, mockWindow, {} as any);

    expect(onMenuAction).toHaveBeenCalledWith('file:new');
    expect(mockWindow.webContents.send).not.toHaveBeenCalled();
  });

  it('includes Auto Save as a checkbox in the File menu', () => {
    const template = createMenuTemplate([], handlers(), {
      ...DEFAULT_NATIVE_MENU_CHECK_STATE,
      'file:toggle-auto-save': { checked: false },
    });
    const fileMenu = findTopLevelMenu(template, 'File').submenu as MenuItemConstructorOptions[];
    const autoSave = fileMenu.find((item) => item.label === 'Auto Save')!;

    expect(autoSave.type).toBe('checkbox');
    expect(autoSave.checked).toBe(false);

    autoSave.click?.({} as any, mockWindow, {} as any);
    expect(onMenuAction).toHaveBeenCalledWith('file:toggle-auto-save');
  });

  it('includes a clear action in Open Recent', () => {
    const onClearRecent = jest.fn();
    const template = createMenuTemplate(
      ['/home/runner/music/duck_tales.bax'],
      { ...handlers(), onClearRecent },
    );
    const fileMenu = findTopLevelMenu(template, 'File').submenu as MenuItemConstructorOptions[];
    const openRecent = fileMenu.find((item) => item.label === 'Open Recent')!;
    const recentItems = openRecent.submenu as MenuItemConstructorOptions[];
    const clearItem = recentItems.find((item) => item.label === 'Clear Recently Opened...')!;

    clearItem.click?.({} as any, mockWindow, {} as any);

    expect(clearItem).toBeTruthy();
    expect(clearItem.enabled).toBe(true);
    expect(onClearRecent).toHaveBeenCalledTimes(1);
  });

  it('disables the Open Recent clear action without a clear callback', () => {
    const template = createMenuTemplate(['/home/runner/music/duck_tales.bax'], handlers());
    const fileMenu = findTopLevelMenu(template, 'File').submenu as MenuItemConstructorOptions[];
    const openRecent = fileMenu.find((item) => item.label === 'Open Recent')!;
    const recentItems = openRecent.submenu as MenuItemConstructorOptions[];
    const clearItem = recentItems.find((item) => item.label === 'Clear Recently Opened...')!;

    expect(clearItem.enabled).toBe(false);
  });

  it('includes About BeatBax in Help menu', () => {
    const template = createMenuTemplate([], handlers());
    const helpMenu = findTopLevelMenu(template, 'Help');
    const helpItems = helpMenu.submenu as MenuItemConstructorOptions[];
    expect(helpItems.map((item) => item.label)).toContain('About BeatBax');
  });

  it('includes macOS app menu with settings and examples when on darwin', () => {
    if (!isMac) return;

    const template = createMenuTemplate([], handlers());
    const appMenu = template[0].submenu as MenuItemConstructorOptions[];
    expect(appMenu.map((item) => item.label)).toEqual(expect.arrayContaining(['About BeatBax', 'Settings…']));

    const fileMenu = findTopLevelMenu(template, 'File').submenu as MenuItemConstructorOptions[];
    expect(fileMenu.map((item) => item.label)).toContain('Examples');
    expect(findTopLevelMenu(template, 'Edit').label).toBe('Edit');
  });

  it('marks visible View items with checkbox state on macOS', () => {
    if (!isMac) return;

    const template = createMenuTemplate([], handlers(), {
      ...DEFAULT_NATIVE_MENU_CHECK_STATE,
      'view:toggle-output': { checked: false },
      'view:toggle-problems': { checked: true },
      'view:toggle-toolbar': { checked: true },
      'view:toggle-transport-bar': { checked: false },
      'view:toggle-channel-mixer': { checked: false, enabled: true },
      'view:toggle-song-visualizer': { checked: false, enabled: true },
      'view:toggle-pattern-grid': { checked: false, enabled: true },
      'view:toggle-ai-assistant': { checked: false, enabled: true },
      'view:toggle-wrap-text': { checked: true },
      'view:toggle-fold-all': { checked: false },
    });
    const viewMenu = findTopLevelMenu(template, 'View').submenu as MenuItemConstructorOptions[];
    const transport = viewMenu.find((item) => item.label === 'Transport Bar')!;
    const wrapText = viewMenu.find((item) => item.label === 'Wrap Text')!;

    expect(transport.type).toBe('checkbox');
    expect(transport.checked).toBe(false);
    expect(wrapText.type).toBe('checkbox');
    expect(wrapText.checked).toBe(true);
  });

  it('uses catalog accelerators for desktop panel toggles on macOS', () => {
    if (!isMac) return;

    const template = createMenuTemplate([], handlers());
    const viewMenu = findTopLevelMenu(template, 'View').submenu as MenuItemConstructorOptions[];
    const toolbar = viewMenu.find((item) => item.label === 'Toolbar')!;
    const transport = viewMenu.find((item) => item.label === 'Transport Bar')!;
    const patternGrid = viewMenu.find((item) => item.label === 'Pattern Grid')!;

    expect(toolbar.accelerator).toBe('CmdOrCtrl+Shift+B');
    expect(transport.accelerator).toBe('CmdOrCtrl+Shift+R');
    expect(patternGrid.accelerator).toBe('CmdOrCtrl+Shift+G');
  });
});
