jest.mock('@beatbax/engine', () => ({
  renderSongToPCM: jest.fn(),
}));

jest.mock('@beatbax/engine/export', () => ({
  buildUGE: jest.fn(() => new Uint8Array([0x55, 0x47, 0x45])),
  writeWAV: jest.fn(),
}));

jest.mock('../src/export/midi-builder', () => ({
  buildMIDI: jest.fn(() => new Uint8Array([0x4d, 0x54, 0x68, 0x64])),
}));

import { ExportManager } from '../src/export/export-manager';
import { EventBus } from '../src/utils/event-bus';

function setupDownloadMocks() {
  const revokeObjectURL = jest.fn();
  const createObjectURL = jest.fn(() => 'blob:mock-url');
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true });

  const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return { createObjectURL, clickSpy };
}

describe('ExportManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
  });

  test('exports UGE as downloadable bytes without CLI fallback', async () => {
    const { clickSpy, createObjectURL } = setupDownloadMocks();
    const manager = new ExportManager(new EventBus());
    const source = `
chip gameboy
bpm 120

inst lead type=pulse1 duty=50 env={"level":10,"direction":"down","period":1,"format":"gb"}

pat melody = C5 E5 G5 C6
channel 1 => inst lead pat melody
`;

    const result = await manager.export(source, 'uge', { filename: 'desktop-test', validate: false });

    expect(result.success).toBe(true);
    expect(result.filename).toBe('desktop-test.uge');
    expect(result.size).toBeGreaterThan(0);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  test('does not emit export success until desktop save completes', async () => {
    let resolveSave: (value: string | null) => void = () => {};
    const saveFile = jest.fn(() => new Promise<string | null>((resolve) => {
      resolveSave = resolve;
    }));
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { saveFile },
    });

    const eventBus = new EventBus();
    const success = jest.fn();
    eventBus.on('export:success', success);
    const manager = new ExportManager(eventBus);

    const exportPromise = manager.export('chip gameboy', 'uge', {
      filename: 'desktop-test',
      validate: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(success).not.toHaveBeenCalled();

    resolveSave('C:\\Exports\\desktop-test.uge');
    const result = await exportPromise;

    expect(result.success).toBe(true);
    expect(result.filename).toBe('C:\\Exports\\desktop-test.uge');
    expect(success).toHaveBeenCalledWith({
      format: 'uge',
      filename: 'C:\\Exports\\desktop-test.uge',
    });
  });

  test('emits export cancelled instead of success when desktop save is cancelled', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { saveFile: jest.fn(async () => null) },
    });

    const eventBus = new EventBus();
    const success = jest.fn();
    const cancelled = jest.fn();
    eventBus.on('export:success', success);
    eventBus.on('export:cancelled', cancelled);
    const manager = new ExportManager(eventBus);

    const result = await manager.export('chip gameboy', 'uge', {
      filename: 'desktop-test',
      validate: false,
    });

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(success).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledWith({
      format: 'uge',
      filename: 'desktop-test.uge',
    });
  });
});
