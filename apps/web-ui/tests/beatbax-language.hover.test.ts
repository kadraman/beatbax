import * as monaco from 'monaco-editor';
import { registerBeatBaxLanguage } from '../src/editor/beatbax-language';

describe('BeatBax Monaco hover provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeMultilineModel(lines: string[]) {
    return {
      getLineCount: jest.fn(() => lines.length),
      getLineContent: jest.fn((lineNumber: number) => lines[lineNumber - 1] ?? ''),
      getWordAtPosition: jest.fn((position: monaco.IPosition) => {
        const line = lines[position.lineNumber - 1] ?? '';
        const idx = Math.max(0, position.column - 1);
        const left = line.slice(0, idx).match(/[a-zA-Z_]\w*$/)?.[0] ?? '';
        const right = line.slice(idx).match(/^\w*/)?.[0] ?? '';
        const word = left + right;
        if (!word) return null;
        return {
          word,
          startColumn: idx - left.length + 1,
          endColumn: idx + right.length + 1,
        };
      }),
    } as any;
  }

  function getHoverProvider() {
    registerBeatBaxLanguage();
    const call = (monaco.languages.registerHoverProvider as jest.Mock).mock.calls.find(
      ([lang]) => lang === 'beatbax',
    );

    expect(call).toBeDefined();
    return call?.[1];
  }

  test('shows waveform sparkline when hovering wave array values', () => {
    const hoverProvider = getHoverProvider();
    const line = 'inst w type=wave wave=[0,3,6,9,12,9,6,3]';
    const sixColumn = line.indexOf('6') + 1;

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => null),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column: sixColumn });

    expect(hover).toBeTruthy();
    expect(hover.contents[0].value).toContain('Waveform preview');
    expect(hover.contents[1].value).toContain('```text');
    expect(hover.contents[1].value).toContain('^');
    expect(hover.contents[2].value).toContain('Samples: 8');
    expect(hover.contents[2].value).toContain('Index');
  });

  test('falls back to keyword hover docs when not inside wave literal', () => {
    const hoverProvider = getHoverProvider();
    const line = 'chip gameboy';

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({ word: 'chip', startColumn: 1, endColumn: 5 })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column: 2 });

    expect(hover).toBeTruthy();
    expect(hover.contents[0].value).toContain('target audio chip');
  });

  test('suppresses hovers on continuation lines inside triple-quoted metadata', () => {
    const hoverProvider = getHoverProvider();
    const lines = [
      'song description """Opening line with lead mention',
      'middle line with lead and ghost names',
      'closing line"""',
    ];
    const model = makeMultilineModel(lines);
    const column = lines[1].indexOf('lead') + 2;

    const hover = hoverProvider.provideHover(model, { lineNumber: 2, column });

    expect(hover).toBeNull();
  });
});
