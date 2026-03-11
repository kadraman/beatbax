import { EventBus } from '../src/utils/event-bus';
import { setupCodeLensPreview } from '../src/editor/codelens-preview';
import * as monaco from 'monaco-editor';

describe('CodeLens Preview provider', () => {
  let eventBus: EventBus;
  beforeEach(() => {
    jest.clearAllMocks();
    eventBus = new EventBus();
  });

  it('registers a CodeLens provider and produces lenses after parse:success', () => {
    // Capture the provider passed to registerCodeLensProvider
    let capturedProvider: any = null;
    (monaco.languages.registerCodeLensProvider as jest.Mock).mockImplementation((lang: string, prov: any) => {
      capturedProvider = prov;
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
    eventBus.emit('parse:success', { ast: {} });

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
  });
});
