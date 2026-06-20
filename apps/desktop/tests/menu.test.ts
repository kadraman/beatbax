/** @jest-environment node */

import type { MenuItemConstructorOptions } from 'electron';
import { createMenuTemplate } from '../src/main/menu';

describe('desktop native menu', () => {
  const mockWindow = {
    webContents: {
      send: jest.fn(),
    },
  } as any;

  it('includes file, playback, view, and help menus', () => {
    const template = createMenuTemplate(mockWindow, ['/tmp/song.bax']);
    expect(template.map((item) => item.label)).toEqual(['File', 'Playback', 'View', 'Help']);
  });

  it('includes export submenu entries', () => {
    const template = createMenuTemplate(mockWindow, []);
    const fileMenu = template[0].submenu as MenuItemConstructorOptions[];
    const exportMenu = fileMenu.find((item) => item.label === 'Export')!;
    expect((exportMenu.submenu as MenuItemConstructorOptions[]).map((item) => item.label))
      .toEqual(['JSON', 'MIDI', 'UGE', 'WAV']);
  });

  it('shows basename labels in Open Recent', () => {
    const template = createMenuTemplate(mockWindow, ['/home/runner/music/duck_tales.bax']);
    const fileMenu = template[0].submenu as MenuItemConstructorOptions[];
    const openRecent = fileMenu.find((item) => item.label === 'Open Recent')!;
    const recentItems = openRecent.submenu as MenuItemConstructorOptions[];
    expect(recentItems[0].label).toBe('duck_tales.bax');
    expect(recentItems[0].toolTip).toBe('/home/runner/music/duck_tales.bax');
  });

  it('opens recent files via the provided callback', () => {
    const onOpenRecent = jest.fn();
    const template = createMenuTemplate(mockWindow, ['/home/runner/music/duck_tales.bax'], onOpenRecent);
    const fileMenu = template[0].submenu as MenuItemConstructorOptions[];
    const openRecent = fileMenu.find((item) => item.label === 'Open Recent')!;
    const recentItems = openRecent.submenu as MenuItemConstructorOptions[];

    recentItems[0].click?.({} as any, mockWindow, {} as any);

    expect(onOpenRecent).toHaveBeenCalledWith('/home/runner/music/duck_tales.bax');
    expect(mockWindow.webContents.send).not.toHaveBeenCalled();
  });

  it('includes a clear action in Open Recent', () => {
    const onClearRecent = jest.fn();
    const template = createMenuTemplate(
      mockWindow,
      ['/home/runner/music/duck_tales.bax'],
      undefined,
      onClearRecent,
    );
    const fileMenu = template[0].submenu as MenuItemConstructorOptions[];
    const openRecent = fileMenu.find((item) => item.label === 'Open Recent')!;
    const recentItems = openRecent.submenu as MenuItemConstructorOptions[];
    const clearItem = recentItems.find((item) => item.label === 'Clear Recently Opened...')!;

    clearItem.click?.({} as any, mockWindow, {} as any);

    expect(clearItem).toBeTruthy();
    expect(clearItem.enabled).toBe(true);
    expect(onClearRecent).toHaveBeenCalledTimes(1);
  });

  it('disables the Open Recent clear action without a clear callback', () => {
    const template = createMenuTemplate(mockWindow, ['/home/runner/music/duck_tales.bax']);
    const fileMenu = template[0].submenu as MenuItemConstructorOptions[];
    const openRecent = fileMenu.find((item) => item.label === 'Open Recent')!;
    const recentItems = openRecent.submenu as MenuItemConstructorOptions[];
    const clearItem = recentItems.find((item) => item.label === 'Clear Recently Opened...')!;

    expect(clearItem.enabled).toBe(false);
  });

  it('uses function keys for playback accelerators', () => {
    const template = createMenuTemplate(mockWindow, []);
    const playbackMenu = template.find((item) => item.label === 'Playback')!;
    const playbackItems = playbackMenu.submenu as MenuItemConstructorOptions[];

    expect(playbackItems.find((item) => item.label === 'Play / Resume')?.accelerator).toBe('F5');
    expect(playbackItems.find((item) => item.label === 'Pause')?.accelerator).toBeUndefined();
    expect(playbackItems.find((item) => item.label === 'Stop')?.accelerator).toBe('F8');
    expect(playbackItems.map((item) => item.accelerator)).not.toContain('Space');
    expect(playbackItems.map((item) => item.accelerator)).not.toContain('Shift+Space');
  });

  it('includes About BeatBax in Help menu', () => {
    const template = createMenuTemplate(mockWindow, []);
    const helpMenu = template.find((item) => item.label === 'Help')!;
    const helpItems = helpMenu.submenu as MenuItemConstructorOptions[];
    expect(helpItems.map((item) => item.label)).toContain('About BeatBax');
  });
});
