const mockParse: jest.Mock = jest.fn(() => ({
  pats: {},
  patsOrder: [],
  insts: {},
  seqs: {},
  channels: [],
  bpm: 120,
}));
const mockResolveImports: jest.Mock = jest.fn(async (ast: any) => ast);
const mockResolveSong: jest.Mock = jest.fn((ast: any) => ({
  ast,
  insts: ast?.insts ?? {},
  channels: ast?.channels ?? [],
  chip: ast?.chip,
}));

jest.mock('@beatbax/engine/parser', () => ({
  parse: (...args: any[]) => mockParse(...args),
}));

jest.mock('@beatbax/engine/song', () => ({
  resolveSong: (...args: any[]) => mockResolveSong(...args),
  resolveImports: (ast: any, options?: any) => mockResolveImports(ast, options),
}));

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
import { storage, StorageKey } from '../src/utils/local-storage';

const KIT_SOURCE = `
chip gameboy
import "local:lib/kit.ins"
bpm 120
pat melody = C5 E5 G5 C6
channel 1 => inst gb_lead pat melody
`;

const INLINE_SOURCE = `
chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env={"level":10,"direction":"down","period":1,"format":"gb"}
pat melody = C5 E5 G5 C6
channel 1 => inst lead pat melody
`;

function unmergedKitAst() {
  return {
    chip: 'gameboy',
    imports: [{ source: 'local:lib/kit.ins' }],
    insts: {},
    pats: { melody: ['C5', 'E5', 'G5', 'C6'] },
    seqs: {},
    channels: [{ id: 1, inst: 'gb_lead' }],
    bpm: 120,
  };
}

function mergedKitAst() {
  return {
    chip: 'gameboy',
    imports: [],
    insts: { gb_lead: { type: 'pulse1' }, kick: { type: 'noise' } },
    pats: { melody: ['C5', 'E5', 'G5', 'C6'] },
    seqs: {},
    channels: [{ id: 1, inst: 'gb_lead' }],
    bpm: 120,
  };
}

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
    storage.remove(StorageKey.LAST_DOCUMENT_PATH);
    mockParse.mockImplementation(() => ({
      pats: {},
      patsOrder: [],
      insts: {},
      seqs: {},
      channels: [],
      bpm: 120,
    }));
    mockResolveImports.mockImplementation(async (ast: any) => ast);
    mockResolveSong.mockImplementation((ast: any) => ({
      ast,
      insts: ast?.insts ?? {},
      channels: ast?.channels ?? [],
      chip: ast?.chip,
    }));
  });

  afterEach(() => {
    storage.remove(StorageKey.LAST_DOCUMENT_PATH);
  });

  test('prefers open document stem over song metadata for download name', async () => {
    const { clickSpy } = setupDownloadMocks();
    const manager = new ExportManager(new EventBus());
    const source = `
chip gameboy
bpm 120
song name "AY Synth Channels"

inst lead type=pulse1 duty=50 env={"level":10,"direction":"down","period":1,"format":"gb"}

pat melody = C5 E5 G5 C6
channel 1 => inst lead pat melody
`;

    const result = await manager.export(source, 'uge', {
      filename: 'ay_synth_channels.bax',
      validate: false,
    });

    expect(result.success).toBe(true);
    expect(result.filename).toBe('ay_synth_channels.uge');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('preserves multi-dot document stems when replacing extension', async () => {
    setupDownloadMocks();
    const manager = new ExportManager(new EventBus());
    const source = `
chip gameboy
bpm 120

inst lead type=pulse1 duty=50 env={"level":10,"direction":"down","period":1,"format":"gb"}

pat melody = C5 E5 G5 C6
channel 1 => inst lead pat melody
`;

    const result = await manager.export(source, 'uge', {
      filename: 'my.song.bax',
      validate: false,
    });

    expect(result.success).toBe(true);
    expect(result.filename).toBe('my.song.uge');
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

  test('merges imported instruments before default validation and plugin export', async () => {
    setupDownloadMocks();
    mockParse.mockReturnValue(unmergedKitAst());
    mockResolveImports.mockResolvedValue(mergedKitAst());
    const manager = new ExportManager(new EventBus());

    const result = await manager.export(KIT_SOURCE, 'uge', { filename: 'kit-song.bax' });

    expect(result.success).toBe(true);
    expect(mockResolveImports).toHaveBeenCalledTimes(1);
    expect(mockResolveSong).toHaveBeenCalledWith(
      expect.objectContaining({
        imports: [],
        insts: expect.objectContaining({ gb_lead: { type: 'pulse1' } }),
      }),
      expect.anything(),
    );
    expect(mockUgeExport).toHaveBeenCalledWith(
      expect.objectContaining({
        insts: expect.objectContaining({ gb_lead: { type: 'pulse1' }, kick: { type: 'noise' } }),
      }),
      expect.objectContaining({ onWarn: expect.any(Function) }),
    );
  });

  test('does not call resolveImports when the song has no import lines', async () => {
    setupDownloadMocks();
    mockParse.mockReturnValue({
      chip: 'gameboy',
      imports: [],
      insts: { lead: { type: 'pulse1' } },
      pats: { melody: ['C5'] },
      channels: [{ id: 1, inst: 'lead' }],
      bpm: 120,
    });
    const manager = new ExportManager(new EventBus());

    const result = await manager.export(INLINE_SOURCE, 'uge', { filename: 'inline.bax' });

    expect(result.success).toBe(true);
    expect(mockResolveImports).not.toHaveBeenCalled();
  });

  test('emits export:error with the import message when kit merge fails', async () => {
    mockParse.mockReturnValue(unmergedKitAst());
    mockResolveImports.mockRejectedValue(new Error('file not found'));
    const eventBus = new EventBus();
    const exportError = jest.fn();
    eventBus.on('export:error', exportError);
    const manager = new ExportManager(eventBus);

    const result = await manager.export(KIT_SOURCE, 'uge', { filename: 'kit-song.bax' });

    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/Import failed: file not found/);
    expect(result.error?.message).not.toMatch(/undefined instrument/);
    expect(exportError).toHaveBeenCalledWith({
      format: 'uge',
      error: expect.objectContaining({ message: expect.stringMatching(/Import failed: file not found/) }),
    });
    expect(mockUgeExport).not.toHaveBeenCalled();
  });

  test('still errors when a channel inst is missing after import merge', async () => {
    mockParse.mockReturnValue(unmergedKitAst());
    mockResolveImports.mockResolvedValue({
      ...mergedKitAst(),
      insts: { kick: { type: 'noise' } },
    });
    const manager = new ExportManager(new EventBus());

    const result = await manager.export(KIT_SOURCE, 'uge', { filename: 'kit-song.bax' });

    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/undefined instrument 'gb_lead'/);
    expect(mockUgeExport).not.toHaveBeenCalled();
  });

  test('passes LAST_DOCUMENT_PATH through buildImportResolverOptions on desktop', async () => {
    setupDownloadMocks();
    storage.set(StorageKey.LAST_DOCUMENT_PATH, 'C:\\music\\song.bax');
    const existsSync = jest.fn().mockReturnValue(true);
    const readFileSync = jest.fn().mockReturnValue('inst gb_lead type=pulse1');
    (window as typeof window & { electronAPI: unknown }).electronAPI = {
      readFileSync,
      existsSync,
    };
    mockParse.mockReturnValue(unmergedKitAst());
    mockResolveImports.mockResolvedValue(mergedKitAst());
    const manager = new ExportManager(new EventBus());

    const result = await manager.export(KIT_SOURCE, 'uge', { filename: 'kit-song.bax' });

    expect(result.success).toBe(true);
    expect(mockResolveImports).toHaveBeenCalledWith(
      expect.objectContaining({ imports: [{ source: 'local:lib/kit.ins' }] }),
      expect.objectContaining({
        baseFilePath: 'C:\\music\\song.bax',
        readFile: expect.any(Function),
        fileExists: expect.any(Function),
      }),
    );
  });
});
