/** @jest-environment node */

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
    const fileMenu = template[0].submenu as any[];
    const exportMenu = fileMenu.find((item) => item.label === 'Export');
    expect(exportMenu.submenu.map((item: { label: string }) => item.label)).toEqual(['JSON', 'MIDI', 'UGE', 'WAV']);
  });
});
