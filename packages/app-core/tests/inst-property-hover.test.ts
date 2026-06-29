import * as monaco from 'monaco-editor';
import { chipRegistry } from '@beatbax/engine/chips';
import { buildInstPropertyHover, buildInstPropertyKeywordHover } from '../src/editor/inst-property-hover';
import { registerBeatBaxLanguage } from '../src/editor/beatbax-language';
import { eventBus } from '../src/utils/event-bus';

describe('NES inst property hovers', () => {
  test('chip hoverDocs include type, duty, and vol', () => {
    const docs = chipRegistry.get('nes')?.uiContributions?.hoverDocs ?? {};
    expect(docs.type).toContain('Channel type');
    expect(docs.duty).toContain('Duty cycle');
    expect(docs.vol).toContain('Constant volume');
  });

  test('buildInstPropertyHover explains duty= value on inst line', () => {
    const line = 'inst lead type=pulse1 duty=50 env=13,down';
    const column = line.indexOf('50') + 1;
    const model = {
      getLineContent: jest.fn(() => line),
    } as unknown as monaco.editor.ITextModel;

    const hover = buildInstPropertyHover(model, { lineNumber: 1, column }, 'nes');
    expect(hover?.contents[0].value).toContain('Duty cycle 50%');
    expect(hover?.contents[0].value).toContain('Balanced');
  });

  test('buildInstPropertyHover explains vol= value on inst line', () => {
    const line = 'inst lead type=pulse1 duty=25 vol=10';
    const column = line.indexOf('10') + 2;
    const model = {
      getLineContent: jest.fn(() => line),
    } as unknown as monaco.editor.ITextModel;

    const hover = buildInstPropertyHover(model, { lineNumber: 1, column }, 'nes');
    expect(hover?.contents[0].value).toContain('Volume 10');
    expect(hover?.contents[0].value).toContain('67%');
  });
});

describe('BeatBax Monaco hover provider — NES inst properties', () => {
  function getHoverProvider() {
    registerBeatBaxLanguage();
    eventBus.emit('parse:success', {
      ast: { chip: 'nes', insts: {}, pats: {}, seqs: {} },
    });
    const call = (monaco.languages.registerHoverProvider as jest.Mock).mock.calls.find(
      ([lang]) => lang === 'beatbax',
    );
    expect(call).toBeDefined();
    return call?.[1];
  }

  test('shows type doc when hovering type on NES inst line', () => {
    const hoverProvider = getHoverProvider();
    const line = 'inst lead type=pulse1 duty=25 vol=10';
    const column = line.indexOf('type') + 2;

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({
        word: 'type',
        startColumn: line.indexOf('type') + 1,
        endColumn: line.indexOf('type') + 5,
      })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column });
    expect(hover?.contents[0].value).toContain('Channel type');
  });

  test('shows duty doc when hovering duty keyword on NES inst line', () => {
    const hoverProvider = getHoverProvider();
    const line = 'inst lead type=pulse1 duty=25 env=13,down';
    const column = line.indexOf('duty') + 2;

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({
        word: 'duty',
        startColumn: line.indexOf('duty') + 1,
        endColumn: line.indexOf('duty') + 5,
      })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column });
    expect(hover?.contents[0].value).toContain('Duty cycle');
  });
});

describe('SMS inst property hovers', () => {
  test('chip hoverDocs include type and vol', () => {
    const docs = chipRegistry.get('sms')?.uiContributions?.hoverDocs ?? {};
    expect(docs.type).toContain('Channel type');
    expect(docs.vol).toContain('attenuation');
  });

  test('buildInstPropertyHover explains SMS vol= with attenuation semantics', () => {
    const line = 'inst lead type=tone1 vol=10';
    const column = line.indexOf('10') + 1;
    const model = {
      getLineContent: jest.fn(() => line),
    } as unknown as monaco.editor.ITextModel;

    const hover = buildInstPropertyHover(model, { lineNumber: 1, column }, 'sms');
    expect(hover?.contents[0].value).toContain('Volume 10');
    expect(hover?.contents[0].value).toContain('0 = loudest');
  });

  test('buildInstPropertyHover explains noise_rate= on SMS inst line', () => {
    const line = 'inst kick type=noise noise_mode=white noise_rate=2 vol=5';
    const column = line.indexOf('noise_rate=2') + 'noise_rate='.length + 1;
    const model = {
      getLineContent: jest.fn(() => line),
    } as unknown as monaco.editor.ITextModel;

    const hover = buildInstPropertyHover(model, { lineNumber: 1, column }, 'sms');
    expect(hover?.contents[0].value).toContain('noise_rate=2');
    expect(hover?.contents[0].value).toContain('Lowest frequency');
  });
});

describe('BeatBax Monaco hover provider — SMS inst properties', () => {
  function getHoverProvider() {
    registerBeatBaxLanguage();
    eventBus.emit('parse:success', {
      ast: { chip: 'sms', insts: {}, pats: {}, seqs: {} },
    });
    const call = (monaco.languages.registerHoverProvider as jest.Mock).mock.calls.find(
      ([lang]) => lang === 'beatbax',
    );
    expect(call).toBeDefined();
    return call?.[1];
  }

  test('shows type doc when hovering type on SMS inst line', () => {
    const hoverProvider = getHoverProvider();
    const line = 'inst lead type=tone1 vol=10';
    const column = line.indexOf('type') + 2;

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({
        word: 'type',
        startColumn: line.indexOf('type') + 1,
        endColumn: line.indexOf('type') + 5,
      })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column });
    expect(hover?.contents[0].value).toContain('Channel type');
  });

  test('shows vol doc when hovering vol keyword on SMS inst line', () => {
    const hoverProvider = getHoverProvider();
    const line = 'inst lead type=tone1 vol=10';
    const column = line.indexOf('vol') + 2;

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({
        word: 'vol',
        startColumn: line.indexOf('vol') + 1,
        endColumn: line.indexOf('vol') + 4,
      })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column });
    expect(hover?.contents[0].value).toContain('attenuation');
  });
});

describe('Spectrum-128 inst property hovers', () => {
  test('chip hoverDocs include type and vol keywords', () => {
    const docs = chipRegistry.get('spectrum-128')?.uiContributions?.hoverDocs ?? {};
    expect(docs.type).toContain('Channel type');
    expect(docs.vol).toContain('Fixed channel amplitude');
  });

  test('buildInstPropertyKeywordHover explains type= property name', () => {
    const line = 'inst tone1 type=tone1 vol=10';
    const column = line.indexOf('type') + 2;
    const model = {
      getLineContent: jest.fn(() => line),
    } as unknown as monaco.editor.ITextModel;

    const hover = buildInstPropertyKeywordHover(model, { lineNumber: 1, column }, 'spectrum-128');
    expect(hover?.contents[0].value).toContain('Channel type');
  });

  test('buildInstPropertyKeywordHover explains vol= property name', () => {
    const line = 'inst tone1 type=tone1 vol=10';
    const column = line.indexOf('vol') + 2;
    const model = {
      getLineContent: jest.fn(() => line),
    } as unknown as monaco.editor.ITextModel;

    const hover = buildInstPropertyKeywordHover(model, { lineNumber: 1, column }, 'spectrum-128');
    expect(hover?.contents[0].value).toContain('Fixed channel amplitude');
  });

  test('buildInstPropertyHover still explains vol= value', () => {
    const line = 'inst tone1 type=tone1 vol=10';
    const column = line.indexOf('10') + 1;
    const model = {
      getLineContent: jest.fn(() => line),
    } as unknown as monaco.editor.ITextModel;

    const hover = buildInstPropertyHover(model, { lineNumber: 1, column }, 'spectrum-128');
    expect(hover?.contents[0].value).toContain('Volume 10');
    expect(hover?.contents[0].value).toContain('15 = loudest');
  });

});

describe('BeatBax Monaco hover provider — Spectrum-128 inst properties', () => {
  function getHoverProvider() {
    registerBeatBaxLanguage();
    eventBus.emit('parse:success', {
      ast: { chip: 'spectrum-128', insts: { tone1: { type: 'tone1', vol: 10 } }, pats: {}, seqs: {} },
    });
    const call = (monaco.languages.registerHoverProvider as jest.Mock).mock.calls.find(
      ([lang]) => lang === 'beatbax',
    );
    expect(call).toBeDefined();
    return call?.[1];
  }

  test('shows type doc when hovering type keyword (not only the value)', () => {
    const hoverProvider = getHoverProvider();
    const line = 'inst tone1 type=tone1 vol=10';
    const column = line.indexOf('type') + 2;

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({
        word: 'type',
        startColumn: line.indexOf('type') + 1,
        endColumn: line.indexOf('type') + 5,
      })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column });
    expect(hover?.contents[0].value).toContain('Channel type');
  });

  test('shows vol doc when hovering vol keyword (not only the value)', () => {
    const hoverProvider = getHoverProvider();
    const line = 'inst tone1 type=tone1 vol=10';
    const column = line.indexOf('vol') + 2;

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({
        word: 'vol',
        startColumn: line.indexOf('vol') + 1,
        endColumn: line.indexOf('vol') + 4,
      })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column });
    expect(hover?.contents[0].value).toContain('Fixed channel amplitude');
  });
});
