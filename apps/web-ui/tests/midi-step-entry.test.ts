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
  prefixSpacingBeforeInsert,
  isCursorInsidePatBody,
  extractNoteTokenSpans,
  durationMsToStepLength,
  normalizeScaleConfig,
  buildScalePitchClasses,
  scaleLockPitchClasses,
  snapMidiToPitchClasses,
  resolveEffectNameFromLine,
  isInstrumentDefinitionLine,
  isEffectDefinitionLine,
  isMidiPreviewLine,
  MidiStepEntryService,
} from '../src/input/midi-step-entry';
import { MidiStepEntryController } from '../src/input/midi-step-entry-controller';
import { settingMidiInputEnabled } from '../src/stores/settings.store';

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
  it('maps very short hold (< 400 ms) to step 2 (minimum — never returns 1)', () => {
    expect(durationMsToStepLength(0)).toBe('2');
    expect(durationMsToStepLength(50)).toBe('2');
    expect(durationMsToStepLength(199)).toBe('2');
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

// ─── prefixSpacingBeforeInsert ────────────────────────────────────────────────

describe('prefixSpacingBeforeInsert', () => {
  it('adds a leading space after a note token with no trailing space', () => {
    const line = 'pat xxx = A4';
    const col = line.length + 1;
    expect(prefixSpacingBeforeInsert(line, col, 'C4')).toBe(' C4');
  });

  it('does not add a leading space when already preceded by whitespace', () => {
    expect(prefixSpacingBeforeInsert('pat xxx = A4 ', 14, 'C4')).toBe('C4');
  });

  it('adds a leading space after = when cursor follows it directly', () => {
    const line = 'pat xxx =';
    expect(prefixSpacingBeforeInsert(line, line.length + 1, 'C4')).toBe(' C4');
  });

  it('does not add a leading space at column 1', () => {
    expect(prefixSpacingBeforeInsert('pat xxx = A4', 1, 'C4')).toBe('C4');
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

describe('scale-awareness MIDI helpers', () => {
  it('normalizes scale config and accepts flats', () => {
    expect(normalizeScaleConfig({ root: 'Bb', mode: 'major' })).toEqual({ root: 'A#', mode: 'major' });
  });

  it('builds pitch classes for major mode', () => {
    const pcs = buildScalePitchClasses('C', 'major');
    expect(pcs ? Array.from(pcs).sort((a, b) => a - b) : []).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('restricts lock pitch classes for root+fifth', () => {
    const pcs = scaleLockPitchClasses('C', 'major', 'root+fifth');
    expect(pcs ? Array.from(pcs).sort((a, b) => a - b) : []).toEqual([0, 7]);
  });

  it('snaps to nearest scale pitch (tie prefers up)', () => {
    // C#4 -> nearest in C major is D4
    const snapped = snapMidiToPitchClasses(61, new Set([0, 2, 4, 5, 7, 9, 11]));
    expect(snapped).toBe(62);
  });
});

// ─── MidiStepEntryService ─────────────────────────────────────────────────────

describe('MidiStepEntryService', () => {
  let onNoteEntered: jest.Mock;
  let onAuditionStart: jest.Mock;
  let onAuditionStop: jest.Mock;
  let onIdlePreview: jest.Mock;
  let onWarning: jest.Mock;
  let service: MidiStepEntryService;

  beforeEach(() => {
    onNoteEntered = jest.fn();
    onAuditionStart = jest.fn();
    onAuditionStop = jest.fn();
    onIdlePreview = jest.fn();
    onWarning = jest.fn();
    service = new MidiStepEntryService({
      onNoteEntered,
      onAuditionStart,
      onAuditionStop,
      onIdlePreview,
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

  it('instant step entry does not audition on note-on (audition happens after insert)', () => {
    (service as any).selectedInput = { addEventListener: () => {}, removeEventListener: () => {} };
    service.setAuditionNotes(true);
    service.setUseNoteDuration(false);
    service.arm();
    expect(service.isArmed()).toBe(true);

    (service as any)._handleNoteOn(60, 100);

    expect(onAuditionStart).not.toHaveBeenCalled();
    expect(onNoteEntered).toHaveBeenCalledWith('C4', 'inherit', false);
  });

  it('hold-duration step entry auditions on note-on before insert', () => {
    (service as any).selectedInput = { addEventListener: () => {}, removeEventListener: () => {} };
    service.setAuditionNotes(true);
    service.setUseNoteDuration(true);
    service.arm();

    (service as any)._handleNoteOn(60, 100);

    expect(onAuditionStart).toHaveBeenCalledWith('C4');
    expect(onNoteEntered).not.toHaveBeenCalled();
  });

  it('disarmed note-on triggers idle preview instead of step entry', () => {
    (service as any).selectedInput = { addEventListener: () => {}, removeEventListener: () => {} };
    expect(service.isArmed()).toBe(false);

    (service as any)._handleNoteOn(60, 100);

    expect(onIdlePreview).toHaveBeenCalledWith('C4');
    expect(onNoteEntered).not.toHaveBeenCalled();
    expect(onAuditionStart).not.toHaveBeenCalled();
  });
});

describe('MIDI preview line detection', () => {
  it('resolveEffectNameFromLine extracts effect name', () => {
    expect(resolveEffectNameFromLine('effect reverb = echo:4')).toBe('reverb');
    expect(resolveEffectNameFromLine('  effect bass_fx = volSlide:-2')).toBe('bass_fx');
    expect(resolveEffectNameFromLine('inst melody type=pulse1')).toBeNull();
  });

  it('isMidiPreviewLine matches inst, effect, and pat body lines', () => {
    expect(isMidiPreviewLine('inst melody type=pulse1 duty=25', 20)).toBe(true);
    expect(isMidiPreviewLine('effect reverb = echo:4', 10)).toBe(true);
    expect(isMidiPreviewLine('pat melody = C4 D4', 15)).toBe(true);
    expect(isMidiPreviewLine('pat melody = C4 D4', 5)).toBe(false);
    expect(isMidiPreviewLine('seq main', 5)).toBe(false);
  });
});

describe('MidiStepEntryController idle preview', () => {
  function createCursorEditor(lineText: string, column: number) {
    const state = { lineText, position: { lineNumber: 1, column } };
    const model = {
      getLineContent: (_lineNumber: number) => state.lineText,
    };
    const editor = {
      getModel: () => model,
      getPosition: () => state.position,
    };
    return { editor, state };
  }

  beforeEach(() => {
    settingMidiInputEnabled.set(true);
  });

  afterEach(() => {
    settingMidiInputEnabled.set(false);
  });

  it('previews instrument on inst line when disarmed', () => {
    const lineText = 'inst melody   type=pulse1  duty=25  env=12,flat';
    const { editor } = createCursorEditor(lineText, 20);
    const onAuditionNote = jest.fn();
    const controller = new MidiStepEntryController({
      getEditor: () => editor as any,
      onAuditionNote,
    });

    (controller as any)._handleIdlePreview('A4');

    expect(onAuditionNote).toHaveBeenCalledWith('A4');
  });

  it('previews effect on effect line when disarmed', () => {
    const lineText = 'effect reverb = echo:4';
    const { editor } = createCursorEditor(lineText, 10);
    const onPreviewEffect = jest.fn();
    const controller = new MidiStepEntryController({
      getEditor: () => editor as any,
      onPreviewEffect,
    });

    (controller as any)._handleIdlePreview('C4');

    expect(onPreviewEffect).toHaveBeenCalledWith('reverb');
  });

  it('previews instrument on pat body when disarmed', () => {
    const lineText = 'pat melody = C4 D4';
    const column = lineText.indexOf('C4') + 1;
    const { editor } = createCursorEditor(lineText, column);
    const onAuditionNote = jest.fn();
    const controller = new MidiStepEntryController({
      getEditor: () => editor as any,
      onAuditionNote,
    });

    (controller as any)._handleIdlePreview('G4');

    expect(onAuditionNote).toHaveBeenCalledWith('G4');
  });

  it('previews instrument on inst line when armed instead of warning', () => {
    const lineText = 'inst melody type=pulse1 duty=25';
    const { editor } = createCursorEditor(lineText, 15);
    const onAuditionNote = jest.fn();
    const onWarning = jest.fn();
    const controller = new MidiStepEntryController({
      getEditor: () => editor as any,
      onAuditionNote,
      onWarning,
    });

    (controller as any)._insertNoteInEditor('A4', 'inherit', false);

    expect(onAuditionNote).toHaveBeenCalledWith('A4');
    expect(onWarning).not.toHaveBeenCalled();
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

  it('snaps inserted notes to scale when snap mode is enabled', () => {
    const lineText = 'pat melody = ';
    const { editor, state } = createSingleLineEditor(lineText, lineText.length + 1, lineText.length + 1);
    const controller = new MidiStepEntryController({
      getEditor: () => editor as any,
    });
    controller.setScaleSnapMode('snap');
    controller.setParsedAst({
      scale: { root: 'C', mode: 'major', enforcement: 'warn' },
      channels: [{ id: 1, lock: 'scale', seqSpecTokens: ['melody'] }],
      seqs: {},
    });
    (controller as any)._insertNoteInEditor('C#4', 'inherit', false);
    expect(state.lineText).toBe('pat melody = D4 ');
  });

  it('filters out-of-scale notes when filter mode is enabled', () => {
    const lineText = 'pat melody = ';
    const { editor, state } = createSingleLineEditor(lineText, lineText.length + 1, lineText.length + 1);
    const controller = new MidiStepEntryController({
      getEditor: () => editor as any,
    });
    controller.setScaleSnapMode('filter');
    controller.setParsedAst({
      scale: { root: 'C', mode: 'major', enforcement: 'warn' },
      channels: [{ id: 1, lock: 'root+fifth', seqSpecTokens: ['melody'] }],
      seqs: {},
    });
    (controller as any)._insertNoteInEditor('E4', 'inherit', false);
    expect(state.lineText).toBe('pat melody = ');
  });

  it('auditions after inserting into an empty pat line when enabled', () => {
    const lineText = 'pat melody = ';
    const onAuditionNote = jest.fn();
    const { editor } = createSingleLineEditor(lineText, lineText.length + 1, lineText.length + 1);
    const controller = new MidiStepEntryController({
      getEditor: () => editor as any,
      onAuditionNote,
    });
    controller.setAuditionNotes(true);
    (controller as any)._insertNoteInEditor('C4', 'inherit', false);
    expect(onAuditionNote).toHaveBeenCalledTimes(1);
    expect(onAuditionNote).toHaveBeenCalledWith('C4');
  });

  it('does not audition after insert when audition is disabled', () => {
    const lineText = 'pat melody = ';
    const onAuditionNote = jest.fn();
    const { editor } = createSingleLineEditor(lineText, lineText.length + 1, lineText.length + 1);
    const controller = new MidiStepEntryController({
      getEditor: () => editor as any,
      onAuditionNote,
    });
    controller.setAuditionNotes(false);
    (controller as any)._insertNoteInEditor('C4', 'inherit', false);
    expect(onAuditionNote).not.toHaveBeenCalled();
  });

  it('inserts a leading space when cursor follows a note without trailing space', () => {
    const lineText = 'pat xxx = A4';
    const cursorCol = lineText.length + 1;
    const { editor, state } = createSingleLineEditor(lineText, cursorCol, cursorCol);
    const controller = new MidiStepEntryController({
      getEditor: () => editor as any,
    });
    (controller as any)._insertNoteInEditor('C4', 'inherit', false);
    expect(state.lineText).toBe('pat xxx = A4 C4 ');
  });
});
