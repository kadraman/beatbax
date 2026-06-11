export const Menu = {
  buildFromTemplate: jest.fn((template) => ({ template })),
  setApplicationMenu: jest.fn(),
};

export const shell = {
  openExternal: jest.fn(),
};

export const app = {
  addRecentDocument: jest.fn(),
  getVersion: jest.fn(() => '0.1.0'),
};

export const dialog = {
  showOpenDialog: jest.fn(),
  showSaveDialog: jest.fn(),
};

export const ipcMain = {
  handle: jest.fn(),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
};
