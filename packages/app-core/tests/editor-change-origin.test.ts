import { applyUndoableReplace } from '../src/editor/undoable-replace';
import {
  consumeEditorChangeOrigin,
  noteEditorModelChange,
  resetEditorChangeOriginForTests,
  shouldArmTransportLive,
} from '../src/editor/editor-change-origin';

function fakeEditor(value: string, onExecute?: () => void) {
  const model = {
    getValue: () => value,
    getPositionAt: (offset: number) => {
      const clamped = Math.max(0, Math.min(value.length, offset));
      return { lineNumber: 1, column: clamped + 1 };
    },
  };
  return {
    getModel: () => model,
    executeEdits: () => {
      onExecute?.();
    },
  } as unknown as Parameters<typeof applyUndoableReplace>[0];
}

describe('transport Live vs Instrument Editor writes', () => {
  beforeEach(() => {
    resetEditorChangeOriginForTests();
  });

  it('does not arm Live for an instrument-editor edit while Live is on', () => {
    const editor = fakeEditor('inst lead type=pulse1', () => noteEditorModelChange());
    applyUndoableReplace(editor, 'instrument-editor', 'inst lead type=pulse2');
    const origin = consumeEditorChangeOrigin();
    expect(origin).toBe('instrument-editor');
    expect(shouldArmTransportLive({ liveMode: true, hasParseErrors: false, origin })).toBe(false);
  });

  it('arms Live for a Monaco edit that follows an instrument write', () => {
    const editor = fakeEditor('inst lead type=pulse1', () => noteEditorModelChange());
    applyUndoableReplace(editor, 'instrument-editor', 'inst lead type=pulse2');
    noteEditorModelChange();
    const origin = consumeEditorChangeOrigin();
    expect(origin).toBe('user');
    expect(shouldArmTransportLive({ liveMode: true, hasParseErrors: false, origin })).toBe(true);
  });

  it('arms Live for other tooling edits', () => {
    const editor = fakeEditor('pat a = C4', () => noteEditorModelChange());
    applyUndoableReplace(editor, 'copilot', 'pat a = D4');
    const origin = consumeEditorChangeOrigin();
    expect(origin).toBe('user');
    expect(shouldArmTransportLive({ liveMode: true, hasParseErrors: false, origin })).toBe(true);
  });

  it('keeps Live disarmed when the song has parse errors or Live is off', () => {
    expect(shouldArmTransportLive({ liveMode: true, hasParseErrors: true, origin: 'user' })).toBe(false);
    expect(shouldArmTransportLive({ liveMode: false, hasParseErrors: false, origin: 'user' })).toBe(false);
    expect(shouldArmTransportLive({ liveMode: true, hasParseErrors: false })).toBe(true);
  });
});
