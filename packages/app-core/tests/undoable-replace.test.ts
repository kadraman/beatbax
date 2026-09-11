import { applyUndoableReplace, minimalTextEdit } from '../src/editor/undoable-replace';

function fakeEditor(value: string) {
  const model = {
    getValue: () => value,
    getPositionAt: (offset: number) => {
      // 1-based Monaco positions for a single-line buffer used by most tests.
      const clamped = Math.max(0, Math.min(value.length, offset));
      return { lineNumber: 1, column: clamped + 1 };
    },
    getFullModelRange: () => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: value.length + 1,
    }),
  };
  const executeEdits = jest.fn();
  return {
    editor: {
      getModel: () => model,
      executeEdits,
    } as unknown as Parameters<typeof applyUndoableReplace>[0],
    executeEdits,
    model,
  };
}

describe('minimalTextEdit', () => {
  it('returns null when strings are identical', () => {
    expect(minimalTextEdit('a', 'a')).toBeNull();
  });

  it('replaces only the changed middle of a multi-line song', () => {
    const previous = [
      'chip gameboy',
      'inst lead type=pulse1',
      'inst bass type=wave',
      'pat a = C4',
      '',
    ].join('\n');
    const next = [
      'chip gameboy',
      'inst lead type=pulse1 env=12,down',
      'inst bass type=wave',
      'pat a = C4',
      '',
    ].join('\n');

    const edit = minimalTextEdit(previous, next);
    expect(edit).toEqual({
      start: previous.indexOf('type=pulse1') + 'type=pulse1'.length,
      end: previous.indexOf('type=pulse1') + 'type=pulse1'.length,
      text: ' env=12,down',
    });
    // Surrounding lines are outside the edit span.
    expect(previous.slice(0, edit!.start)).toContain('chip gameboy');
    expect(previous.slice(edit!.end)).toContain('inst bass');
    expect(edit!.text.length).toBeLessThan(previous.length);
  });

  it('handles pure insertions and deletions at the edges', () => {
    expect(minimalTextEdit('abc', 'abXc')).toEqual({ start: 2, end: 2, text: 'X' });
    expect(minimalTextEdit('abXc', 'abc')).toEqual({ start: 2, end: 3, text: '' });
    expect(minimalTextEdit('abc', 'Xabc')).toEqual({ start: 0, end: 0, text: 'X' });
    expect(minimalTextEdit('abc', 'abcY')).toEqual({ start: 3, end: 3, text: 'Y' });
  });
});

describe('applyUndoableReplace', () => {
  it('executes a minimal-range edit so the change stays on the undo stack', () => {
    const previous = 'chip gameboy\ninst lead type=pulse1\npat a = C4\n';
    const next = 'chip gameboy\ninst lead type=pulse1 env=12,down,1\npat a = C4\n';
    const { editor, executeEdits } = fakeEditor(previous);

    // Multi-line positions: extend the fake model for this case.
    const model = (editor.getModel() as {
      getPositionAt: (offset: number) => { lineNumber: number; column: number };
    });
    model.getPositionAt = (offset: number) => {
      const before = previous.slice(0, offset);
      const lines = before.split('\n');
      return {
        lineNumber: lines.length,
        column: (lines[lines.length - 1] ?? '').length + 1,
      };
    };

    const ok = applyUndoableReplace(editor, 'instrument-editor', next);

    expect(ok).toBe(true);
    const edit = minimalTextEdit(previous, next)!;
    const start = model.getPositionAt(edit.start);
    const end = model.getPositionAt(edit.end);
    expect(executeEdits).toHaveBeenCalledWith('instrument-editor', [{
      range: {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
      text: edit.text,
      forceMoveMarkers: true,
    }]);
    expect(edit.text).toBe(' env=12,down,1');
    expect(edit.text.length).toBeLessThan(next.length);
  });

  it('is a no-op when the document is unchanged', () => {
    const { editor, executeEdits } = fakeEditor('inst lead type=pulse1');

    expect(applyUndoableReplace(editor, 'instrument-editor', 'inst lead type=pulse1')).toBe(false);
    expect(executeEdits).not.toHaveBeenCalled();
  });

  it('returns false when the editor has no model', () => {
    const editor = {
      getModel: () => null,
      executeEdits: jest.fn(),
    } as unknown as Parameters<typeof applyUndoableReplace>[0];

    expect(applyUndoableReplace(editor, 'instrument-editor', 'x')).toBe(false);
  });
});
