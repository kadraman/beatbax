/**
 * Unit tests for desktop clipboard export data helper.
 */

const mockResolveImports: jest.Mock = jest.fn(async (ast: any) => ({ ...ast, imports: [] }));
const mockResolveSong: jest.Mock = jest.fn((ast: any) => ({
  chip: ast?.chip ?? 'gameboy',
  bpm: ast?.bpm ?? 120,
  insts: ast?.insts ?? {},
  channels: ast?.channels ?? [],
}));
const mockBuildImportResolverOptions: jest.Mock = jest.fn(() => ({
  baseFilePath: 'C:\\music\\song.bax',
  readFile: jest.fn(),
  fileExists: jest.fn(),
}));

jest.mock('@beatbax/engine/parser', () => ({
  parse: jest.fn((source: string) => {
    const imports = /import\s+local:/i.test(source)
      ? [{ source: 'local:lib/kit.ins' }]
      : [];
    return {
      chip: 'gameboy',
      bpm: 120,
      imports,
      insts: imports.length ? {} : { lead: { type: 'pulse1' } },
      pats: { melody: ['C4', 'E4', 'G4'] },
      channels: [{ id: 1, inst: imports.length ? 'gb_lead' : 'lead' }],
    };
  }),
}));

jest.mock('@beatbax/engine/song', () => ({
  resolveSong: (ast: any, options?: any) => mockResolveSong(ast, options),
  resolveImports: (ast: any, options?: any) => mockResolveImports(ast, options),
}));

jest.mock('@beatbax/app-core/import/import-resolver-options', () => ({
  buildImportResolverOptions: (overrides?: unknown) => mockBuildImportResolverOptions(overrides),
}));

import { handleDesktopExportData } from '../src/renderer/src/lib/export-handler';

const SAMPLE = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat melody = C4 E4 G4
seq main = melody
channel 1 => inst lead seq main
play
`;

const KIT_SOURCE = `chip gameboy
bpm 120
import local:lib/kit.ins
pat melody = C4 E4 G4
seq main = melody
channel 1 => inst gb_lead seq main
play
`;

describe('handleDesktopExportData', () => {
  beforeEach(() => {
    mockResolveImports.mockClear();
    mockResolveSong.mockClear();
    mockBuildImportResolverOptions.mockClear();
    mockResolveImports.mockImplementation(async (ast: any) => ({
      ...ast,
      imports: [],
      insts: { ...(ast.insts ?? {}), gb_lead: { type: 'pulse1' } },
    }));
    mockResolveSong.mockImplementation((ast: any) => ({
      chip: ast?.chip ?? 'gameboy',
      bpm: ast?.bpm ?? 120,
      insts: ast?.insts ?? {},
      channels: ast?.channels ?? [],
    }));
  });

  it('returns raw source for bax format', async () => {
    const data = await handleDesktopExportData('bax', () => SAMPLE);
    expect(data).toBe(SAMPLE);
    expect(mockResolveImports).not.toHaveBeenCalled();
    expect(mockResolveSong).not.toHaveBeenCalled();
  });

  it('returns null for empty source', async () => {
    expect(await handleDesktopExportData('json', () => '')).toBeNull();
    expect(await handleDesktopExportData('json', () => '   ')).toBeNull();
  });

  it('returns JSON for json format', async () => {
    const data = await handleDesktopExportData('json', () => SAMPLE);
    expect(data).toBeTruthy();
    const parsed = JSON.parse(data!);
    expect(parsed).toEqual(expect.objectContaining({
      chip: expect.anything(),
    }));
    expect(mockResolveImports).not.toHaveBeenCalled();
    expect(mockResolveSong).toHaveBeenCalled();
  });

  it('merges local imports before resolving JSON clipboard export', async () => {
    const data = await handleDesktopExportData('json', () => KIT_SOURCE);
    expect(data).toBeTruthy();
    expect(mockBuildImportResolverOptions).toHaveBeenCalled();
    expect(mockResolveImports).toHaveBeenCalledWith(
      expect.objectContaining({
        imports: [{ source: 'local:lib/kit.ins' }],
      }),
      expect.objectContaining({ baseFilePath: 'C:\\music\\song.bax' }),
    );
    expect(mockResolveSong).toHaveBeenCalledWith(
      expect.objectContaining({
        imports: [],
        insts: expect.objectContaining({ gb_lead: { type: 'pulse1' } }),
      }),
      expect.anything(),
    );
    const parsed = JSON.parse(data!);
    expect(parsed.insts).toEqual(expect.objectContaining({
      gb_lead: expect.anything(),
    }));
  });

  it('returns null when local import merge fails', async () => {
    mockResolveImports.mockRejectedValue(new Error('Import file not found'));
    expect(await handleDesktopExportData('json', () => KIT_SOURCE)).toBeNull();
  });

  it('returns null for unsupported binary formats', async () => {
    expect(await handleDesktopExportData('wav', () => SAMPLE)).toBeNull();
    expect(await handleDesktopExportData('midi', () => SAMPLE)).toBeNull();
  });
});
