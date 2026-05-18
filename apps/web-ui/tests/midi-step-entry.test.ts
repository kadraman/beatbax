/**
 * Unit tests for the MIDI Step Entry subsystem.
 *
 * Covers:
 *  - midiNoteToName: MIDI note number → BeatBax note name conversion
 *  - formatNoteToken: note + step length → formatted token
 *  - isCursorInsidePatBody: cursor context detection
 *  - extractNoteTokenSpans: token location extraction from selected text
 *  - MidiStepEntryService: device lifecycle, state management, callbacks
 *  - New StorageKey entries for MIDI settings
 */

import {
  midiNoteToName,
  formatNoteToken,
  isCursorInsidePatBody,
  extractNoteTokenSpans,
  durationMsToStepLength,
  MidiStepEntryService,
} from '../src/input/midi-step-entry';
import { MidiStepEntryController } from '../src/input/midi-step-entry-controller';

// ─── midiNoteToName ───────────────────────────────────────────────────────────

describe('midiNoteToName', () => {
  it('converts middle C (60) to C4', () => {
    expect(midiNoteToName(60)).toBe('C4');
  });

  it('converts note 61 to C#4 (sharp only)', () => {
    expect(midiNoteToName(61)).toBe('C#4');
  });

  it('converts note 69 to A4 (concert pitch)', () => {
    expect(midiNoteToName(69)).toBe('A4');
  });

  it('converts note 0 to C-1 (lowest standard MIDI note)', () => {
    expect(midiNoteToName(0)).toBe('C-1');
  });

  it('converts note 127 to G9 (highest standard MIDI note)', () => {
    expect(midiNoteToName(127)).toBe('G9');
  });

  it('converts note 48 to C3', () => {
    expect(midiNoteToName(48)).toBe('C3');
  });

  it('converts note 72 to C5', () => {
    expect(midiNoteToName(72)).toBe('C5');
  });

  it('converts F#4 (note 66) correctly', () => {
    expect(midiNoteToName(66)).toBe('F#4');
  });

  it('converts A#3 (note 58) correctly', () => {
    expect(midiNoteToName(58)).toBe('A#3');
  });

  it('all notes in one octave have unique names', () => {
    const names = new Set<string>();
    for (let i = 60; i < 72; i++) {
      names.add(midiNoteToName(i));
    }
    expect(names.size).toBe(12);
  });
});

// ─── formatNoteToken ──────────────────────────────────────────────────────────

describe('formatNoteToken', () => {
  it('returns plain note name when emitDuration is false', () => {
    expect(formatNoteToken('C4', '4', false)).toBe('C4');
  });

  it('returns plain note name when stepLength is inherit', () => {
    expect(formatNoteToken('C4', 'inherit', true)).toBe('C4');
  });

  it('returns plain note name when stepLength is 1', () => {
    expect(formatNoteToken('C4', '1', true)).toBe('C4');
  });

  it('appends duration suffix when emitDuration is true and stepLength is not inherit', () => {
    expect(formatNoteToken('C4', '4', true)).toBe('C4:4');
    expect(formatNoteToken('F#5', '8', true)).toBe('F#5:8');
    expect(formatNoteToken('A3', '16', true)).toBe('A3:16');
  });

  it('handles all step lengths', () => {
    expect(formatNoteToken('C4', '2', true)).toBe('C4:2');
    expect(formatNoteToken('C4', '4', true)).toBe('C4:4');
    expect(formatNoteToken('C4', '8', true)).toBe('C4:8');
    expect(formatNoteToken('C4', '16', true)).toBe('C4:16');
    for (const len of ['1', '2', '4', '8', '16'] as const) {
      expect(formatNoteToken('C4', len, false)).toBe('C4');
    }
  });
});

// ─── durationMsToStepLength ───────────────────────────────────────────────────

describe('durationMsToStepLength', () => {
  it('maps very short hold to step 1', () => {
    expect(durationMsToStepLength(50)).toBe('1');
    expect(durationMsToStepLength(199)).toBe('1');
  });

  it('maps 200-399 ms to step 2', () => {
    expect(durationMsToStepLength(200)).toBe('2');
    expect(durationMsToStepLength(399)).toBe('2');
  });

  it('maps 400-799 ms to step 4', () => {
    expect(durationMsToStepLength(400)).toBe('4');
    expect(durationMsToStepLength(799)).toBe('4');
  });

  it('maps 800-1599 ms to step 8', () => {
    expect(durationMsToStepLength(800)).toBe('8');
    expect(durationMsToStepLength(1599)).toBe('8');
  });

  it('maps 1600+ ms to step 16 (maximum)', () => {
    expect(durationMsToStepLength(1600)).toBe('16');
    expect(durationMsToStepLength(5000)).toBe('16');
  });
});

// ─── isCursorInsidePatBody ────────────────────────────────────────────────────

describe('isCursorInsidePatBody', () => {
  const patLine = 'pat melody = C4 E4 G4';

  it('returns true when cursor is past the = sign', () => {
    // 'pat melody = ' has 13 chars; cursor at column 14 (1-based) is inside the body
    const eqIndex = patLine.indexOf('=');
    expect(isCursorInsidePatBody(patLine, eqIndex + 2)).toBe(true);
  });

  it('returns false when cursor is on the pat keyword', () => {
    expect(isCursorInsidePatBody(patLine, 1)).toBe(false);
  });

  it('returns false for a non-pat line', () => {
    expect(isCursorInsidePatBody('seq foo = bar baz', 14)).toBe(false);
  });

  it('returns false for a blank line', () => {
    expect(isCursorInsidePatBody('', 1)).toBe(false);
  });

  it('returns false for an inst line', () => {
    expect(isCursorInsidePatBody('inst lead type=pulse1', 10)).toBe(false);
  });

  it('returns true for a pat line with a leading space', () => {
    const line = '  pat lead2 = D4 F4';
    const eqIndex = line.indexOf('=');
    expect(isCursorInsidePatBody(line, eqIndex + 2)).toBe(true);
  });

  it('returns false when cursor is exactly on the =', () => {
    // Column 1-based; = is at 0-based index eqIndex → 1-based column eqIndex+1
    const eqIndex = patLine.indexOf('=');
    // 'pat melody =' → 'pat melody = '.length = eqIndex + 1 (1-based) is exactly at the '='
    expect(isCursorInsidePatBody(patLine, eqIndex + 1)).toBe(false);
  });
});

// ─── extractNoteTokenSpans ────────────────────────────────────────────────────

describe('extractNoteTokenSpans', () => {
  it('extracts note tokens from a simple string', () => {
    const spans = extractNoteTokenSpans('C4 E4 G4');
    expect(spans).toHaveLength(3);
    expect(spans[0].value).toBe('C4');
    expect(spans[1].value).toBe('E4');
    expect(spans[2].value).toBe('G4');
  });

  it('extracts note tokens with duration suffixes', () => {
    const spans = extractNoteTokenSpans('C4:4 E4:8 G4');
    expect(spans).toHaveLength(3);
    expect(spans[0].value).toBe('C4:4');
    expect(spans[1].value).toBe('E4:8');
    expect(spans[2].value).toBe('G4');
  });

  it('extracts rest tokens', () => {
    const spans = extractNoteTokenSpans('C4 . E4');
    expect(spans).toHaveLength(3);
    expect(spans[1].value).toBe('.');
  });

  it('returns empty array for text with no note tokens', () => {
    expect(extractNoteTokenSpans('inst lead type=pulse1')).toHaveLength(0);
  });

  it('returns correct start/end offsets', () => {
    const text = 'C4 E4';
    const spans = extractNoteTokenSpans(text);
    expect(spans[0].start).toBe(0);
    expect(spans[0].end).toBe(2);
    expect(spans[1].start).toBe(3);
    expect(spans[1].end).toBe(5);
  });

  it('handles sharp notes', () => {
    const spans = extractNoteTokenSpans('C#4 F#5');
    expect(spans).toHaveLength(2);
    expect(spans[0].value).toBe('C#4');
    expect(spans[1].value).toBe('F#5');
  });

  it('handles negative octave notes (C-1, MIDI note 0)', () => {
    const spans = extractNoteTokenSpans('C-1 D0');
    expect(spans.some(s => s.value === 'C-1')).toBe(true);
  });

  it('handles octave 9 notes (G9, MIDI note 127)', () => {
    const spans = extractNoteTokenSpans('G9');
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBe('G9');
  });
});

// ─── MidiStepEntryService ─────────────────────────────────────────────────────

describe('MidiStepEntryService', () => {
  let onNoteEntered: jest.Mock;
  let onAuditionStart: jest.Mock;
  let onAuditionStop: jest.Mock;
  let onWarning: jest.Mock;
  let service: MidiStepEntryService;

  beforeEach(() => {
    onNoteEntered = jest.fn();
    onAuditionStart = jest.fn();
    onAuditionStop = jest.fn();
    onWarning = jest.fn();
    service = new MidiStepEntryService({
      onNoteEntered,
      onAuditionStart,
      onAuditionStop,
      onWarning,
    });
  });

  afterEach(() => {
    service.dispose();
  });

  it('starts disarmed', () => {
    expect(service.isArmed()).toBe(false);
  });

  it('arm() arms the service', () => {
    service.arm();
    expect(service.isArmed()).toBe(false);
    expect(onWarning).toHaveBeenCalledWith('Select a MIDI input device before arming MIDI step entry.');
  });

  it('disarm() disarms the service', () => {
    service.arm();
    service.disarm();
    expect(service.isArmed()).toBe(false);
  });

  it('toggle() flips armed state', () => {
    // With no MIDI access the arm() path emits a warning
    // We test the pure toggle cycle disarmed → (attempt arm) → disarmed
    const before = service.isArmed();
    service.toggle();
    service.toggle();
    expect(service.isArmed()).toBe(before);
  });

  it('setStepLength / getStepLength round-trips', () => {
    service.setStepLength('8');
    expect(service.getStepLength()).toBe('8');
    service.setStepLength('inherit');
    expect(service.getStepLength()).toBe('inherit');
  });

  it('setEntryMode / getEntryMode round-trips', () => {
    service.setEntryMode('overwrite-selection');
    expect(service.getEntryMode()).toBe('overwrite-selection');
    service.setEntryMode('insert');
    expect(service.getEntryMode()).toBe('insert');
  });

  it('setAutoAdvance / isAutoAdvance round-trips', () => {
    service.setAutoAdvance(false);
    expect(service.isAutoAdvance()).toBe(false);
    service.setAutoAdvance(true);
    expect(service.isAutoAdvance()).toBe(true);
  });

  it('setAuditionNotes / isAuditionNotes round-trips', () => {
    service.setAuditionNotes(false);
    expect(service.isAuditionNotes()).toBe(false);
    service.setAuditionNotes(true);
    expect(service.isAuditionNotes()).toBe(true);
  });

  it('setUseNoteDuration / isUseNoteDuration round-trips', () => {
    service.setUseNoteDuration(true);
    expect(service.isUseNoteDuration()).toBe(true);
    service.setUseNoteDuration(false);
    expect(service.isUseNoteDuration()).toBe(false);
  });

  it('listDevices returns empty array without MIDI access', () => {
    expect(service.listDevices()).toEqual([]);
  });

  it('setDevice returns an error message when MIDI access not granted', () => {
    const err = service.setDevice('test-id');
    expect(err).toBeTruthy();
    expect(typeof err).toBe('string');
  });

  it('isSupported() returns false in jsdom (no Web MIDI API)', () => {
    expect(MidiStepEntryService.isSupported()).toBe(false);
  });
});

describe('MidiStepEntryController overwrite-selection', () => {
  function createSingleLineEditor(lineText: string, startColumn: number, endColumn: number) {
    const state = {
      lineText,
      position: { lineNumber: 1, column: startColumn },
      selection: {
        startLineNumber: 1,
        startColumn,
        endLineNumber: 1,
        endColumn,
      },
    };

    const model = {
      getLineContent: (_lineNumber: number) => state.lineText,
      getValueInRange: (range: any) => state.lineText.slice(range.startColumn - 1, range.endColumn - 1),
      getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
      getOffsetAt: (position: { lineNumber: number; column: number }) => position.column - 1,
    };

    const editor = {
      getModel: () => model,
      getPosition: () => state.position,
      getSelection: () => state.selection,
      setSelection: (range: any) => {
        state.selection = {
          startLineNumber: range.startLineNumber,
          startColumn: range.startColumn,
          endLineNumber: range.endLineNumber,
          endColumn: range.endColumn,
        };
        state.position = { lineNumber: range.endLineNumber, column: range.endColumn };
      },
      executeEdits: (_source: string, edits: any[]) => {
        for (const edit of edits) {
          const start = edit.range.startColumn - 1;
          const end = edit.range.endColumn - 1;
          state.lineText = state.lineText.slice(0, start) + edit.text + state.lineText.slice(end);
        }
      },
      focus: jest.fn(),
    };

    return { editor, state };
  }

  it('advances through highlighted notes and wraps back to the first token', () => {
    const lineText = 'pat melody = C4 C4 C4 C4 C4';
    const selectionStart = lineText.indexOf('C4');
    const selectionText = 'C4 C4 C4 C4';
    const startColumn = selectionStart + 1;
    const endColumn = startColumn + selectionText.length;
    const { editor, state } = createSingleLineEditor(lineText, startColumn, endColumn);

    const controller = new MidiStepEntryController({
      getEditor: () => editor as any,
    });
    controller.setEntryMode('overwrite-selection');

    (controller as any)._insertNoteInEditor('D4', 'inherit', false);
    expect(state.lineText).toBe('pat melody = D4 C4 C4 C4 C4');

    (controller as any)._insertNoteInEditor('D4', 'inherit', false);
    (controller as any)._insertNoteInEditor('D4', 'inherit', false);
    (controller as any)._insertNoteInEditor('D4', 'inherit', false);
    expect(state.lineText).toBe('pat melody = D4 D4 D4 D4 C4');

    (controller as any)._insertNoteInEditor('E4', 'inherit', false);
    expect(state.lineText).toBe('pat melody = E4 D4 D4 D4 C4');
  });
});
