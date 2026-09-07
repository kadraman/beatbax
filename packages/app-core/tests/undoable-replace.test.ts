import { applyUndoableReplace } from '../src/editor/undoable-replace';

function fakeEditor(value: string) {
  const model = {
    getValue: () => value,
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

describe('applyUndoableReplace', () => {
  it('replaces via executeEdits so the change stays on the undo stack', () => {
    const { editor, executeEdits, model } = fakeEditor('inst lead type=pulse1');

    const ok = applyUndoableReplace(editor, 'instrument-editor', 'inst lead type=pulse1 env=12,down,1');

    expect(ok).toBe(true);
    expect(executeEdits).toHaveBeenCalledWith('instrument-editor', [{
      range: model.getFullModelRange(),
      text: 'inst lead type=pulse1 env=12,down,1',
      forceMoveMarkers: true,
    }]);
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
