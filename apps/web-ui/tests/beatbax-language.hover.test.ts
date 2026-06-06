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
    // Chip keyword hover should now list installed chips
    expect(hover.contents[0].value).toContain('target audio chip');
    expect(hover.contents[0].value).toContain('gameboy');
  });

  test('chip keyword hover lists all installed chips', () => {
    const hoverProvider = getHoverProvider();
    const line = 'chip gameboy';

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({ word: 'chip', startColumn: 1, endColumn: 5 })),
    } as any;

    // Hover on the 'chip' keyword token itself (column 2 is inside 'chip')
    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column: 2 });

    expect(hover).toBeTruthy();
    expect(hover.contents[0].value).toContain('Installed chips');
    expect(hover.contents[0].value).toContain('`gameboy`');
  });

  test('shows hover docs when hovering chip directive value', () => {
    const hoverProvider = getHoverProvider();
    const line = 'chip atari-st';

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({ word: 'atari', startColumn: 6, endColumn: 11 })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column: 8 });

    expect(hover).toBeTruthy();
    expect(hover.contents[0].value).toContain('Chip target');
    expect(hover.contents[0].value).toContain('atari-st');
  });

  test('time keyword hover notes deprecation', () => {
    const hoverProvider = getHoverProvider();
    const line = 'time 4';

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({ word: 'time', startColumn: 1, endColumn: 5 })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column: 2 });

    expect(hover).toBeTruthy();
    expect(hover.contents[0].value).toContain('deprecated');
    expect(hover.contents[0].value).toContain('stepsPerBar');
  });

  test('ticksPerStep keyword hover notes deprecation', () => {
    const hoverProvider = getHoverProvider();
    const line = 'ticksPerStep 16';

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({ word: 'ticksPerStep', startColumn: 1, endColumn: 13 })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column: 5 });

    expect(hover).toBeTruthy();
    expect(hover.contents[0].value).toContain('deprecated');
    expect(hover.contents[0].value).toContain('no effect');
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

  test('shows tier-2 transform hover for lag in a chained seq modifier', () => {
    const hoverProvider = getHoverProvider();
    const line = 'seq demo_lag = lead_core:rot(1):lag(1)';
    const lagColumn = line.lastIndexOf('lag') + 2;

    const model = makeMultilineModel([line]);
    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column: lagColumn });

    expect(hover).toBeTruthy();
    expect(hover.contents[0].value).toContain('Lag');
    expect(hover.contents[0].value).toContain('off');
    expect(hover.contents[0].value).toContain('rot(1):lag(1)');
  });

  test('shows tier-2 transform hover for invert and every', () => {
    const hoverProvider = getHoverProvider();

    const invertLine = 'seq demo = lead_core:invert';
    const invertModel = makeMultilineModel([invertLine]);
    const invertHover = hoverProvider.provideHover(invertModel, {
      lineNumber: 1,
      column: invertLine.indexOf('invert') + 3,
    });
    expect(invertHover?.contents[0].value).toContain('Invert');
    expect(invertHover?.contents[0].value).toContain('pivot');

    const everyLine = 'seq demo = lead_core:every(2,mute)';
    const everyModel = makeMultilineModel([everyLine]);
    const everyHover = hoverProvider.provideHover(everyModel, {
      lineNumber: 1,
      column: everyLine.indexOf('every') + 3,
    });
    expect(everyHover?.contents[0].value).toContain('Every');
    expect(everyHover?.contents[0].value).toContain('every(2,oct(+1))');
  });

  test('seq keyword hover lists tier-2 transforms', () => {
    const hoverProvider = getHoverProvider();
    const line = 'seq main = intro';

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => ({ word: 'seq', startColumn: 1, endColumn: 4 })),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column: 2 });

    expect(hover).toBeTruthy();
    expect(hover.contents[0].value).toContain('Tier-2 transforms');
    expect(hover.contents[0].value).toContain('shuffle(seed)');
  });

  test('shows tier-1 transform hover for rot and clamp', () => {
    const hoverProvider = getHoverProvider();

    const rotLine = 'seq demo_rot = lead_core:rot(1)';
    const rotModel = makeMultilineModel([rotLine]);
    const rotHover = hoverProvider.provideHover(rotModel, {
      lineNumber: 1,
      column: rotLine.lastIndexOf('rot') + 2,
    });
    expect(rotHover?.contents[0].value).toContain('Rotate');
    expect(rotHover?.contents[0].value).toContain('[C4 D4 E4 G4]');

    const clampLine = 'seq demo = out_of_range:clamp(C3,C6)';
    const clampModel = makeMultilineModel([clampLine]);
    const clampHover = hoverProvider.provideHover(clampModel, {
      lineNumber: 1,
      column: clampLine.indexOf('clamp') + 3,
    });
    expect(clampHover?.contents[0].value).toContain('Clamp');
    expect(clampHover?.contents[0].value).toContain('cut');
  });
});
