import * as monaco from 'monaco-editor';
import { registerBeatBaxLanguage } from '../src/editor/beatbax-language';
import {
  collectSongSymbols,
  detectCompletionContext,
  effectSnippetToPlain,
  inlineEffectInsertRange,
  parseSymbolsFromSource,
  provideBeatBaxCompletions,
} from '../src/editor/completion';

describe('BeatBax completion context', () => {
  test('detects channel instrument position', () => {
    const line = 'channel 1 => inst lead seq main';
    const instCol = line.indexOf('lead') + 1;
    expect(detectCompletionContext(line, instCol, false).kind).toBe('channel-instrument');
  });

  test('detects channel sequence position', () => {
    const line = 'channel 1 => inst lead seq main';
    const seqCol = line.indexOf('main') + 1;
    expect(detectCompletionContext(line, seqCol, false).kind).toBe('channel-sequence');
  });

  test('detects sequence body and modifier', () => {
    const line = 'seq main = intro melody:oct(-1)';
    const bodyCol = line.indexOf('melody') + 1;
    expect(detectCompletionContext(line, bodyCol, false).kind).toBe('sequence-body');

    const modCol = line.indexOf('oct') + 1;
    expect(detectCompletionContext(line, modCol, false).kind).toBe('sequence-modifier');
  });

  test('detects pattern body and inline effect', () => {
    const patLine = 'pat kick = C4 E4 G4';
    expect(detectCompletionContext(patLine, patLine.length, false).kind).toBe('pattern-body');

    const fxLine = 'pat arp = C4<vib:4,6>';
    const insideCol = fxLine.indexOf('vib') + 1;
    expect(detectCompletionContext(fxLine, insideCol, false).kind).toBe('inline-effect');
  });

  test('detects effect definition RHS', () => {
    const line = 'effect shimmer = vib:3,6';
    const col = line.indexOf('vib') + 1;
    expect(detectCompletionContext(line, col, false).kind).toBe('effect-rhs');
  });

  test('detects chip value and inst property contexts', () => {
    expect(detectCompletionContext('chip ', 6, false).kind).toBe('chip-value');
    expect(detectCompletionContext('inst lead type=', 16, false).kind).toBe('inst-property');
    expect(detectCompletionContext('export ', 8, false).kind).toBe('export-format');
    expect(detectCompletionContext('seq main = pat:inst(', 22, false).kind).toBe('modifier-inst-arg');
  });

  test('detects import path inside quoted string', () => {
    const line = 'import "local:lib/x.ins"';
    const col = line.indexOf('x') + 2;
    expect(detectCompletionContext(line, col, true).kind).toBe('import-path');
  });

  test('blocks completions inside strings', () => {
    expect(detectCompletionContext('title "My Song"', 12, true).kind).toBe('blocked');
  });
});

describe('BeatBax symbol collection', () => {
  test('parseSymbolsFromSource finds definitions', () => {
    const source = [
      'inst lead type=pulse1',
      'pat kick = C4',
      'seq main = kick',
      'effect shimmer = vib:3,6',
    ].join('\n');

    expect(parseSymbolsFromSource(source)).toEqual({
      instruments: ['lead'],
      patterns: ['kick'],
      sequences: ['main'],
      namedEffects: ['shimmer'],
    });
  });

  test('collectSongSymbols merges resolved ast, song, and regex', () => {
    const ast = {
      insts: { lead: {} },
      pats: { kick: [] },
      seqs: { main: [] },
      effects: { shimmer: 'vib:3,6' },
    };
    const resolvedAst = {
      insts: { lead: {}, imported: {} },
      pats: { kick: [] },
      seqs: { main: [] },
    };
    const song = { insts: { imported: {} }, pats: {}, seqs: {} };
    const symbols = collectSongSymbols(ast, resolvedAst, song, 'pat extra = C4');

    expect(symbols.instruments).toEqual(expect.arrayContaining(['lead', 'imported']));
    expect(symbols.patterns).toEqual(expect.arrayContaining(['kick', 'extra']));
    expect(symbols.sequences).toContain('main');
    expect(symbols.namedEffects).toContain('shimmer');
  });
});

describe('BeatBax Monaco completion provider', () => {
  function makeModel(lines: string[], cursorLine = 1, cursorCol?: number) {
    const line = lines[cursorLine - 1] ?? '';
    const column = cursorCol ?? line.length + 1;
    return {
      getValue: () => lines.join('\n'),
      getLineContent: (n: number) => lines[n - 1] ?? '',
      getLineCount: () => lines.length,
      getWordUntilPosition: () => ({ word: '', startColumn: column, endColumn: column }),
    } as any;
  }

  function getCompletionProvider() {
    registerBeatBaxLanguage();
    const call = (monaco.languages.registerCompletionItemProvider as jest.Mock).mock.calls.find(
      ([lang]) => lang === 'beatbax',
    );
    expect(call).toBeDefined();
    return call![1];
  }

  test('registers trigger characters', () => {
    const provider = getCompletionProvider();
    expect(provider.triggerCharacters).toEqual([':', '<', '=', '"', '/']);
  });

  test('suggests instruments on channel inst slot', () => {
    const source = [
      'inst lead type=pulse1',
      'inst bass type=pulse2',
      'pat kick = C4',
      'seq main = kick',
      'channel 1 => inst ',
    ];
    const model = makeModel(source);
    const col = source[4].length + 1;
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 5, column: col },
      {
        ast: {
          insts: { lead: {}, bass: {} },
          pats: { kick: [] },
          seqs: { main: [] },
        },
        resolvedAst: undefined,
        song: null,
        chip: 'gameboy',
      },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels).toContain('lead');
    expect(labels).toContain('bass');
    expect(labels).not.toContain('C4');
  });

  test('suggests patterns in sequence body', () => {
    const model = makeModel(['pat intro = C4', 'pat chorus = E4', 'seq main = '], 3);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 3, column: 13 },
      {
        ast: { insts: {}, pats: { intro: [], chorus: [] }, seqs: {} },
        resolvedAst: undefined,
        song: null,
        chip: 'gameboy',
      },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels).toContain('intro');
    expect(labels).toContain('chorus');
  });

  test('suggests modifiers after colon in sequence', () => {
    const model = makeModel(['seq main = intro:'], 1, 18);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: 18 },
      {
        ast: { insts: {}, pats: { intro: [] }, seqs: {}, effects: { shimmer: 'vib:3,6' } },
        resolvedAst: undefined,
        song: null,
        chip: 'gameboy',
      },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels).toContain(':oct(+1)');
    expect(labels).toContain(':shimmer');
  });

  test('effectSnippetToPlain strips tab-stop markup', () => {
    expect(effectSnippetToPlain('arp:${1:4},${2:7}')).toBe('arp:4,7');
  });

  test('inlineEffectInsertRange spans text after <', () => {
    const line = 'pat x = C4<ar';
    const range = inlineEffectInsertRange(line, { lineNumber: 1, column: 14 });
    expect(range.startColumn).toBe(12);
    expect(range.endColumn).toBe(14);
  });

  test('suggests inline effects inside angle brackets with closing >', () => {
    const model = makeModel(['pat x = C4<'], 1, 12);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: 12 },
      {
        ast: { insts: {}, pats: {}, seqs: {}, effects: { shimmer: 'vib:3,6' } },
        resolvedAst: undefined,
        song: null,
        chip: 'gameboy',
      },
    );
    const list = result as { suggestions: { label: string; insertText?: string; range?: { startColumn: number } }[]; incomplete?: boolean };
    expect(list.incomplete).toBe(true);
    const labels = list.suggestions.map((s) => s.label);
    expect(labels).toContain('vib');
    expect(labels).toContain('shimmer');
    const vib = list.suggestions.find((s) => s.label === 'vib');
    expect(vib?.insertText).toBe('vib:4,6>');
    expect(vib?.insertText).not.toContain('${');
    const shimmer = list.suggestions.find((s) => s.label === 'shimmer');
    expect(shimmer?.insertText).toBe('shimmer>');
    expect(vib?.range?.startColumn).toBe(12);
  });

  test('replaces partial effect name inside brackets', () => {
    const model = makeModel(['pat x = C4<ar'], 1, 14);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: 14 },
      {
        ast: { insts: {}, pats: {}, seqs: {}, effects: {} },
        resolvedAst: undefined,
        song: null,
        chip: 'gameboy',
      },
    );
    const arp = (result as { suggestions: { label: string; insertText?: string; range?: { startColumn: number; endColumn: number } }[] })
      .suggestions.find((s) => s.label === 'arp');
    expect(arp?.insertText).toBe('arp:4,7>');
    expect(arp?.range).toEqual({
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: 12,
      endColumn: 14,
    });
  });

  test('top-level does not include note spam', () => {
    const model = makeModel([''], 1, 1);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: 1 },
      { ast: null, resolvedAst: null, song: null, chip: 'gameboy' },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels).toContain('chip');
    expect(labels).not.toContain('C4');
  });

  test('suggests chip ids on chip directive line', () => {
    const model = makeModel(['chip '], 1, 6);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: 6 },
      { ast: null, resolvedAst: null, song: null, chip: 'gameboy' },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels).toContain('gameboy');
    expect(labels).toContain('gb');
  });

  test('suggests export formats for active chip', () => {
    const model = makeModel(['export '], 1, 8);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: 8 },
      { ast: null, resolvedAst: null, song: null, chip: 'gameboy' },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels).toContain('json');
    expect(labels).toContain('midi');
    expect(labels).toContain('wav');
  });

  test('suggests instruments inside :inst() modifier', () => {
    const model = makeModel(['seq main = pat:inst('], 1, 22);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: 22 },
      {
        ast: { insts: { lead: {}, bass: {} }, pats: { pat: [] }, seqs: {} },
        resolvedAst: undefined,
        song: null,
        chip: 'gameboy',
      },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels).toContain('lead');
    expect(labels).toContain('bass');
  });

  test('suggests instrument types on inst property', () => {
    const model = makeModel(['inst lead type='], 1, 16);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: 16 },
      { ast: null, resolvedAst: null, song: null, chip: 'gameboy' },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels).toContain('pulse1');
    expect(labels).toContain('wave');
  });

  test('does not suggest other properties while editing free-form inst values', () => {
    const line = 'inst lead type=pulse1 env=down';
    const model = makeModel([line], 1, line.indexOf('down') + 3);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: line.indexOf('down') + 3 },
      { ast: null, resolvedAst: null, song: null, chip: 'gameboy' },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels).not.toContain('wave=');
    expect(labels).not.toContain('duty=');
  });

  test('suggests import paths inside quoted import string', () => {
    const line = 'import "local:lib/';
    const model = makeModel([line], 1, line.length);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: line.length },
      { ast: null, resolvedAst: null, song: null, chip: 'gameboy' },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels.some((l) => l.startsWith('local:lib/'))).toBe(true);
  });

  test('shows no files found for unknown import prefix', () => {
    const line = 'import "local:missing/';
    const model = makeModel([line], 1, line.length);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: line.length },
      { ast: null, resolvedAst: null, song: null, chip: 'gameboy' },
    );
    const labels = (result as { suggestions: { label: string }[] }).suggestions.map((s) => s.label);
    expect(labels).toContain('(no files found)');
  });

  test('includes documentation on effect suggestions', () => {
    const model = makeModel(['pat x = C4<'], 1, 12);
    const result = provideBeatBaxCompletions(
      model,
      { lineNumber: 1, column: 12 },
      { ast: { insts: {}, pats: {}, seqs: {}, effects: {} }, resolvedAst: undefined, song: null, chip: 'gameboy' },
    );
    const vib = (result as { suggestions: { label: string; documentation?: { value: string } }[] })
      .suggestions.find((s) => s.label === 'vib');
    expect(vib?.documentation?.value).toBeTruthy();
  });
});
