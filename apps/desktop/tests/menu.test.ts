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

  it('shows basename labels for Windows-style paths on any platform', () => {
    const template = createMenuTemplate(mockWindow, ['C:\\music\\duck_tales.bax']);
    const fileMenu = template[0].submenu as MenuItemConstructorOptions[];
    const openRecent = fileMenu.find((item) => item.label === 'Open Recent')!;
    const recentItems = openRecent.submenu as MenuItemConstructorOptions[];
    expect(recentItems[0].label).toBe('duck_tales.bax');
    expect(recentItems[0].toolTip).toBe('C:\\music\\duck_tales.bax');
  });
});
