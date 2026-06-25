import { insertHelpSnippetBlock } from '../src/editor/help-snippet-insertion';

function makeEditor(lines: string[], selection: {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}) {
  const edits: Array<{ source: string; edits: any[] }> = [];
  const positions: Array<{ lineNumber: number; column: number }> = [];
  const model = {
    getLineCount: jest.fn(() => lines.length),
    getLineMaxColumn: jest.fn((lineNumber: number) => (lines[lineNumber - 1] ?? '').length + 1),
  };
  const editor = {
    getModel: jest.fn(() => model),
    getSelection: jest.fn(() => selection),
    executeEdits: jest.fn((source: string, editList: any[]) => {
      edits.push({ source, edits: editList });
    }),
    setPosition: jest.fn((position: { lineNumber: number; column: number }) => {
      positions.push(position);
    }),
    focus: jest.fn(),
  };
  return { editor: editor as any, edits, positions };
}

describe('insertHelpSnippetBlock', () => {
  test('collapsed cursor inserts snippet below current line as a standalone block', () => {
    const { editor, edits, positions } = makeEditor(
      ['inst lead type=pulse1 duty=50'],
      { startLineNumber: 1, startColumn: 15, endLineNumber: 1, endColumn: 15 },
    );

    insertHelpSnippetBlock(editor, 'pat melody = C5 E5 G5 C6');

    expect(edits[0].edits[0]).toMatchObject({
      range: {
        startLineNumber: 1,
        startColumn: 30,
        endLineNumber: 1,
        endColumn: 30,
      },
      text: '\npat melody = C5 E5 G5 C6\n',
      forceMoveMarkers: true,
    });
    expect(positions[0]).toEqual({ lineNumber: 2, column: 25 });
    expect(editor.focus).toHaveBeenCalled();
  });

  test('multi-line snippet keeps the cursor at the end of the inserted block', () => {
    const { editor, edits, positions } = makeEditor(
      ['bpm 120'],
      { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
    );

    insertHelpSnippetBlock(editor, 'pat a = C4\nseq main = a');

    expect(edits[0].edits[0].text).toBe('\npat a = C4\nseq main = a\n');
    expect(positions[0]).toEqual({ lineNumber: 3, column: 13 });
  });

  test('non-empty selections are replaced as whole-line standalone blocks', () => {
    const { editor, edits, positions } = makeEditor(
      ['chip gameboy', 'inst broken type=pulse1', 'play'],
      { startLineNumber: 2, startColumn: 6, endLineNumber: 2, endColumn: 12 },
    );

    insertHelpSnippetBlock(editor, 'pat melody = C5 E5 G5 C6\nseq main = melody');

    expect(edits[0].edits[0]).toMatchObject({
      range: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 3,
        endColumn: 1,
      },
      text: 'pat melody = C5 E5 G5 C6\nseq main = melody\n',
    });
    expect(positions[0]).toEqual({ lineNumber: 3, column: 18 });
  });
});
