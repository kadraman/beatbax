import * as monaco from 'monaco-editor';
import {
  buildNoteHoverMarkdown,
  getGmDrumName,
  noteToUgeIndex,
  parseNoteAtPosition,
} from '../src/editor/inst-note-hover';
import { registerBeatBaxLanguage } from '../src/editor/beatbax-language';

describe('inst note= hover helpers', () => {
  test('noteToUgeIndex matches hUGE export offset', () => {
    expect(noteToUgeIndex(36)).toBe(0); // C2 → index 0
    expect(noteToUgeIndex(60)).toBe(24); // C4
    expect(noteToUgeIndex(96)).toBe(60); // C7
  });

  test('getGmDrumName returns standard drum labels', () => {
    expect(getGmDrumName(38)).toBe('Acoustic Snare');
    expect(getGmDrumName(42)).toBe('Closed Hi-Hat');
    expect(getGmDrumName(34)).toBeNull();
  });

  test('parseNoteAtPosition matches note= on inst lines only', () => {
    const line = 'inst snare type=noise gb:width=7 env=13,down note=C7';
    const noteColumn = line.indexOf('C7') + 1;
    const model = {
      getLineContent: jest.fn(() => line),
    } as unknown as monaco.editor.ITextModel;

    const parsed = parseNoteAtPosition(model, { lineNumber: 1, column: noteColumn });
    expect(parsed?.noteName).toBe('C7');
    expect(parsed?.instType).toBe('noise');

    const seqModel = {
      getLineContent: jest.fn(() => 'pat drums = note=C7'),
    } as unknown as monaco.editor.ITextModel;
    expect(parseNoteAtPosition(seqModel, { lineNumber: 1, column: 16 })).toBeNull();
  });

  test('buildNoteHoverMarkdown includes MIDI, frequency, and noise guidance', () => {
    const md = buildNoteHoverMarkdown({
      noteName: 'C7',
      instType: 'noise',
      instLine: 'inst snare type=noise note=C7',
      range: {
        startLineNumber: 1,
        endLineNumber: 1,
        startColumn: 1,
        endColumn: 10,
      },
    }, 'gameboy');

    expect(md).toContain('MIDI **96**');
    expect(md).toContain('Hz');
    expect(md).toContain('hUGE export index: **60**');
    expect(md).toContain('noise');
  });
});

describe('BeatBax Monaco hover provider — note=', () => {
  function getHoverProvider() {
    registerBeatBaxLanguage();
    const call = (monaco.languages.registerHoverProvider as jest.Mock).mock.calls.find(
      ([lang]) => lang === 'beatbax',
    );
    expect(call).toBeDefined();
    return call?.[1];
  }

  test('shows note details when hovering note= on percussion inst line', () => {
    const hoverProvider = getHoverProvider();
    const line = 'inst hihat type=noise gb:width=15 env=6,down note=E7';
    const column = line.indexOf('E7') + 1;

    const model = {
      getLineContent: jest.fn(() => line),
      getWordAtPosition: jest.fn(() => null),
    } as any;

    const hover = hoverProvider.provideHover(model, { lineNumber: 1, column });

    expect(hover).toBeTruthy();
    expect(hover.contents[0].value).toContain('Default hit note');
    expect(hover.contents[0].value).toContain('E7');
    expect(hover.contents[0].value).toContain('MIDI **100**');
  });
});
