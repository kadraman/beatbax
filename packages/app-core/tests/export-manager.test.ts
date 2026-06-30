jest.mock('@beatbax/engine/export', () => ({
  normalizeExporterResult: (result: unknown) => {
    if (result === undefined || result === null) return null;
    if (typeof result === 'string') return { data: result };
    if (result instanceof Uint8Array) return { data: result };
    if (result instanceof ArrayBuffer) return { data: new Uint8Array(result) };
    if (typeof result === 'object' && result !== null && 'data' in result) {
      const payload = result as { data: string | Uint8Array | ArrayBuffer };
      if (typeof payload.data === 'string') return { data: payload.data };
      if (payload.data instanceof Uint8Array) return { data: payload.data };
      if (payload.data instanceof ArrayBuffer) return { data: new Uint8Array(payload.data) };
    }
    return null;
  },
}));

const mockUgeExport = jest.fn(async (_song: unknown, _options?: unknown) => new Uint8Array([0x55, 0x47, 0x45]));

jest.mock('../src/plugins/browser-exporter-registry.js', () => ({
  exporterRegistry: {
    get: (id: string) => {
      if (id === 'uge') {
        return {
          id: 'uge',
          label: 'hUGETracker UGE',
          version: '1.0.0',
          extension: 'uge',
          mimeType: 'application/octet-stream',
          supportedChips: ['gameboy', 'gb', 'dmg'],
          export: mockUgeExport,
        };
      }
      return undefined;
    },
  },
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

  test('exports UGE via exporter plugin without CLI fallback', async () => {
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

    expect(mockUgeExport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ onWarn: expect.any(Function) }),
    );
    const exportOptions = mockUgeExport.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(exportOptions).toBeDefined();
    expect(exportOptions).not.toHaveProperty('outputPath');
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

    await new Promise<void>((resolve) => {
      const waitForSave = () => {
        if (saveFile.mock.calls.length > 0) {
          resolve();
          return;
        }
        setTimeout(waitForSave, 0);
      };
      waitForSave();
    });

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
