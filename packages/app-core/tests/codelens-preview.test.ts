const mockParse: jest.Mock = jest.fn(() => ({
  pats: {},
  patsOrder: [],
  insts: {},
  seqs: {},
  channels: [],
  bpm: 120,
}));
const mockParseWithPeggy = jest.fn();
const mockResolveImports: jest.Mock = jest.fn(async (ast: any) => ast);

jest.mock('@beatbax/engine/parser', () => ({
  parse: (...args: any[]) => mockParse(...args),
  parseWithPeggy: (...args: unknown[]) => mockParseWithPeggy(...args),
}));

jest.mock('@beatbax/engine/song', () => ({
  resolveSong: jest.fn((ast: any) => ast),
  resolveImports: (ast: any, options?: any) => mockResolveImports(ast, options),
}));

import { EventBus } from '../src/utils/event-bus';
import {
  resolveAuditionInstrumentForLine,
  parseSourceForPreview,
  parseAndResolveForPreview,
  resolveEffectPreviewInstrument,
  setupCodeLensPreview,
  triggerInstNotePreview,
  stopInstPreview,
} from '../src/editor/codelens-preview';
import { Player } from '@beatbax/engine/audio/playback';
import { chipRegistry } from '@beatbax/engine/chips';
import * as monaco from 'monaco-editor';

describe('CodeLens Preview provider', () => {
  let eventBus: EventBus;
  beforeEach(() => {
    jest.clearAllMocks();
    eventBus = new EventBus();
    (monaco.languages.registerCodeLensProvider as jest.Mock)
      .mockReset()
      .mockReturnValue({ dispose: jest.fn() });
  });

  it('registers a CodeLens provider and produces lenses after parse:success', () => {
    // Capture the provider passed to registerCodeLensProvider
    let capturedProvider: any = null;
    (monaco.languages.registerCodeLensProvider as jest.Mock).mockImplementation((lang: string, prov: any) => {
      capturedProvider = prov;
      return { dispose: jest.fn() };
    });

    const source = [
      'chip gameboy',
      'pat bass-line = C3 C4',
      'seq main = bass-line',
      'inst lead type=pulse1 duty=50 env=12,down',
    ].join('\n');

    const mockEditor: any = {
      // Not used by the provider itself beyond being passed through
    };

    // Install the provider
    setupCodeLensPreview(mockEditor, eventBus as any, () => source);

    // Provider should have been registered for the beatbax language
    expect(monaco.languages.registerCodeLensProvider).toHaveBeenCalledWith('beatbax', expect.any(Object));
    expect(capturedProvider).toBeTruthy();

    // Before parse:success the provider should return no lenses (hasValidParse false)
    const modelBefore = {
      getLineCount: () => 4,
      getLineContent: (ln: number) => source.split('\n')[ln - 1],
    };

    const beforeResult = capturedProvider.provideCodeLenses(modelBefore);
    expect(beforeResult).toEqual({ lenses: [], dispose: expect.any(Function) });

    // Emit parse:success to enable lenses
    eventBus.emit('parse:success', { ast: {}, valid: true });

    const model = {
      getLineCount: () => 4,
      getLineContent: (ln: number) => source.split('\n')[ln - 1],
    };

    const result = capturedProvider.provideCodeLenses(model);
    expect(result).toHaveProperty('lenses');
    const ids = (result.lenses || []).map((l: any) => l.id);

    // Expect pattern preview + loop lenses for 'bass-line'
    expect(ids).toContain('bb-pat-preview-bass-line');
    expect(ids).toContain('bb-pat-loop-bass-line');

    // Expect seq preview lenses for 'main'
    expect(ids).toContain('bb-seq-preview-main');
    expect(ids).toContain('bb-seq-loop-main');

    // Expect inst preview notes for 'lead' (at least one note button)
    expect(ids.some((id: string) => id.startsWith('bb-inst-lead-'))).toBe(true);

    eventBus.emit('parse:success', { ast: {}, valid: false });
    const afterInvalid = capturedProvider.provideCodeLenses(model);
    expect(afterInvalid.lenses).toEqual([]);
  });

  it('resolves step-entry audition instrument from a pat line via channel usage', () => {
    const ast = {
      insts: {
        bass: { type: 'pulse1' },
        lead: { type: 'pulse2' },
      },
      seqs: {
        main: ['melody'],
      },
      channels: [
        { id: 1, inst: 'lead', seqSpecTokens: ['main'] },
      ],
    };

    expect(resolveAuditionInstrumentForLine('pat melody = C4 D4', ast)).toBe('lead');
  });

  it('resolves step-entry audition instrument from a nested seq tree', () => {
    const ast = {
      insts: {
        adv_lead: { type: 'pulse1' },
        adv_wave_dark: { type: 'wave' },
      },
      seqs: {
        mel: ['deep_a'],
        deep_w: ['wave_i'],
        wave: ['deep_w'],
      },
      channels: [
        { id: 1, inst: 'adv_lead', seqSpecTokens: ['mel'] },
        { id: 3, inst: 'adv_wave_dark', seqSpecTokens: ['wave'] },
      ],
    };

    expect(resolveAuditionInstrumentForLine('pat wave_i = E3:2 . B3:2', ast)).toBe(
      'adv_wave_dark',
    );
  });

  it('resolves step-entry audition instrument directly from an inst line', () => {
    const ast = {
      insts: {
        arpLead: { type: 'pulse1' },
      },
    };

    expect(resolveAuditionInstrumentForLine('inst arpLead type=pulse1 duty=50', ast)).toBe('arpLead');
  });

  it('parseSourceForPreview returns partial AST when empty pat is a syntax error', () => {
    mockParseWithPeggy.mockReturnValue({
      hasErrors: true,
      errors: [{ message: "Pattern statement is incomplete: missing pattern content after '='." }],
      ast: {
        chip: 'nes',
        insts: { lead: { type: 'pulse1' } },
        pats: {},
        channels: [],
      },
    });
    const ast = parseSourceForPreview('chip nes\ninst lead type=pulse1\npat test =\n');
    expect(ast).not.toBeNull();
    expect(Object.keys(ast.insts)).toContain('lead');
    expect(ast.chip).toBe('nes');
  });

  it('parseSourceForPreview returns null when source has no preview context', () => {
    mockParseWithPeggy.mockReturnValue({
      hasErrors: true,
      errors: [{ message: "Pattern statement is incomplete: missing pattern content after '='." }],
      ast: { pats: {}, insts: {}, channels: [] },
    });
    expect(parseSourceForPreview('pat test =')).toBeNull();
  });

  it('parseAndResolveForPreview merges imported instruments before preview lookup', async () => {
    mockParse.mockReturnValue({
      imports: [{ source: 'local:lib/kit.ins' }],
      insts: {},
      pats: { melody: ['C5'] },
      seqs: { main: ['melody'] },
      channels: [{ id: 1, inst: 'gb_lead', seqSpecTokens: ['main'] }],
    });
    mockResolveImports.mockResolvedValue({
      imports: [],
      insts: { gb_lead: { type: 'pulse1' }, kick: { type: 'noise' } },
      pats: { melody: ['C5'] },
      seqs: { main: ['melody'] },
      channels: [{ id: 1, inst: 'gb_lead', seqSpecTokens: ['main'] }],
    });

    const ast = await parseAndResolveForPreview('import "local:lib/kit.ins"\n', eventBus);
    expect(mockResolveImports).toHaveBeenCalled();
    expect(ast.insts.gb_lead).toEqual({ type: 'pulse1' });
    expect(resolveAuditionInstrumentForLine('pat melody = C5', ast)).toBe('gb_lead');
    expect(resolveEffectPreviewInstrument(ast)).toBe('gb_lead');
    expect(resolveEffectPreviewInstrument(ast, 'noise')).toBe('kick');
  });

  it('parseAndResolveForPreview skips resolveImports when the song has no imports', async () => {
    mockParse.mockReturnValue({
      imports: [],
      insts: { lead: { type: 'pulse1' } },
    });

    const ast = await parseAndResolveForPreview('inst lead type=pulse1', eventBus);
    expect(mockResolveImports).not.toHaveBeenCalled();
    expect(ast.insts.lead).toEqual({ type: 'pulse1' });
  });

  it('parseAndResolveForPreview emits preview:error when import merge fails', async () => {
    mockParse.mockReturnValue({
      imports: [{ source: 'local:missing.ins' }],
      insts: {},
    });
    mockResolveImports.mockRejectedValue(new Error('file not found'));

    const messages: string[] = [];
    eventBus.on('preview:error', ({ message }) => { messages.push(message); });

    const ast = await parseAndResolveForPreview('import "local:missing.ins"\n', eventBus);
    expect(ast).toBeNull();
    expect(messages[0]).toMatch(/Import failed: file not found/);
  });

  describe('hold-to-play cancellation', () => {
    const mockEditor: any = {};
    const leadAst = {
      imports: [{ source: 'local:kit.ins' }],
      insts: { lead: { type: 'pulse1' } },
      chip: 'gameboy',
    };
    const resolvedLeadAst = {
      imports: [],
      insts: { lead: { type: 'pulse1' } },
      chip: 'gameboy',
    };

    afterEach(() => {
      delete (window as unknown as { electronAPI?: unknown }).electronAPI;
      const nes = chipRegistry.get('nes') as { resolveSampleAsset?: unknown };
      delete nes.resolveSampleAsset;
    });

    it('does not start a player if stopPreview runs during astForPreview', async () => {
      const playAST = jest.spyOn(Player.prototype, 'playAST');
      let finishImports!: (ast: typeof resolvedLeadAst) => void;
      mockParse.mockReturnValue(leadAst);
      mockResolveImports.mockImplementation(
        () => new Promise((resolve) => { finishImports = resolve; }),
      );

      setupCodeLensPreview(mockEditor, eventBus as any, () => 'inst lead type=pulse1');
      triggerInstNotePreview('lead', 'C4', { sustain: true });
      stopInstPreview();
      finishImports(resolvedLeadAst);
      await Promise.resolve();
      await Promise.resolve();

      expect(playAST).not.toHaveBeenCalled();
      playAST.mockRestore();
    });

    it('does not start a player if stopPreview runs during DMC sample resolve', async () => {
      const playAST = jest.spyOn(Player.prototype, 'playAST');
      let finishSample!: () => void;
      const sampleStarted = new Promise<void>((resolveStarted) => {
        const nes = chipRegistry.get('nes') as { resolveSampleAsset?: (ref: string) => Promise<void> };
        nes.resolveSampleAsset = jest.fn(() => {
          resolveStarted();
          return new Promise<void>((resolve) => { finishSample = resolve; });
        });
      });
      (window as any).electronAPI = { readFileSync: jest.fn() };
      mockParse.mockReturnValue({
        imports: [],
        insts: { kick: { type: 'dmc', dmc_sample: 'local:kick.dmc' } },
        chip: 'nes',
      });
      mockResolveImports.mockImplementation(async (ast: any) => ast);

      setupCodeLensPreview(mockEditor, eventBus as any, () => 'inst kick type=dmc');
      triggerInstNotePreview('kick', 'C4', { sustain: true });
      await sampleStarted;

      stopInstPreview();
      finishSample();
      await Promise.resolve();
      await Promise.resolve();

      expect(playAST).not.toHaveBeenCalled();
      playAST.mockRestore();
    });

    it('stops a player created after release during playAST', async () => {
      const stop = jest.spyOn(Player.prototype, 'stop');
      let finishPlay!: () => void;
      const playAST = jest.spyOn(Player.prototype, 'playAST');
      const playStarted = new Promise<void>((resolveStarted) => {
        playAST.mockImplementation(() => {
          resolveStarted();
          return new Promise<void>((resolve) => { finishPlay = resolve; });
        });
      });
      mockParse.mockReturnValue(resolvedLeadAst);
      mockResolveImports.mockImplementation(async (ast: any) => ast);

      setupCodeLensPreview(mockEditor, eventBus as any, () => 'inst lead type=pulse1');
      triggerInstNotePreview('lead', 'C4', { sustain: true });
      await playStarted;

      stopInstPreview();
      finishPlay();
      await Promise.resolve();
      await Promise.resolve();

      expect(stop).toHaveBeenCalled();
      playAST.mockRestore();
      stop.mockRestore();
    });
  });
});
