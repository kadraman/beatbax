import * as monaco from 'monaco-editor';
import {
  buildStubInsertEdit,
  closestAllowedValue,
  findMarkerForProblem,
  findStubInsertLine,
  findTokenRangeOnLine,
  getQuickFixesForProblem,
  isSymbolDefinedInSource,
  registerBeatBaxCodeActions,
  stubDefinitionLine,
  stripDiagnosticComponentPrefix,
  suggestQuickFixes,
  suggestTransformReplacement,
} from '../src/editor/code-actions';

function mockModel(lines: string[]): monaco.editor.ITextModel {
  const text = lines.join('\n');
  return {
    getValue: () => text,
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? '',
    getLineCount: () => lines.length,
    uri: { toString: () => 'file:///test.bax' } as monaco.Uri,
    getVersionId: () => 1,
  } as monaco.editor.ITextModel;
}

function editText(fix: { edits: { text: string }[] }): string {
  return fix.edits[0].text;
}

function marker(
  message: string,
  line: number,
  startColumn = 1,
  endColumn = startColumn + 1,
): monaco.editor.IMarkerData {
  return {
    message,
    severity: monaco.MarkerSeverity.Error,
    startLineNumber: line,
    startColumn,
    endLineNumber: line,
    endColumn,
  };
}

describe('stripDiagnosticComponentPrefix', () => {
  test('removes bracketed component prefix', () => {
    expect(stripDiagnosticComponentPrefix('[parser] Unknown chip')).toBe('Unknown chip');
  });
});

describe('closestAllowedValue', () => {
  test('prefers exact and prefix matches', () => {
    expect(closestAllowedValue('ntcs', ['ntsc', 'pal'])).toBe('ntsc');
    expect(closestAllowedValue('pul', ['pulse1', 'pulse2', 'wave'])).toBe('pulse1');
  });
});

describe('findTokenRangeOnLine', () => {
  test('picks occurrence nearest hint column', () => {
    const line = 'seq a = foo bar foo';
    const range = findTokenRangeOnLine(line, 1, 'foo', 17);
    expect(range?.startColumn).toBe(17);
  });
});

describe('stub definitions', () => {
  test('stubDefinitionLine respects chip', () => {
    expect(stubDefinitionLine('inst', 'bass', 'chip sms\n')).toBe('inst bass type=tone');
    expect(stubDefinitionLine('pat', 'kick')).toBe('pat kick = .');
    expect(stubDefinitionLine('seq', 'main')).toContain('seq main = main_pat');
  });

  test('findStubInsertLine places inst after existing insts', () => {
    const model = mockModel(['chip gameboy', 'inst a type=pulse1', 'pat p = C4', 'channel 1 => inst a seq p']);
    expect(findStubInsertLine(model, 'inst')).toBe(3);
    expect(findStubInsertLine(model, 'pat')).toBe(4);
    expect(findStubInsertLine(model, 'seq')).toBe(4);
  });
});

describe('suggestQuickFixes', () => {
  test('unknown transform quick fix', () => {
    expect(suggestTransformReplacement('tranpese(+2)')).toBe('transpose(+2)');
    const model = mockModel([
      'seq main = lead_core:tranpese(+2)',
    ]);
    const fixes = suggestQuickFixes(
      "[parser] Unknown transform 'tranpese(+2)' on 'lead_core' in sequence 'main'. Did you mean 'transpose(+2)'? Supported transforms: oct(N).",
      model,
      marker('mod', 1, 22),
    );
    expect(fixes[0].edits[0].text).toBe('transpose(+2)');
    expect(fixes[0].edits[0].range.startColumn).toBe(22);
  });

  test('expected but found offers replacement', () => {
    const model = mockModel(['se my_seq = kick']);
    const fixes = suggestQuickFixes(
      '[parser] Expected "seq" but "se" found.',
      model,
      { ...marker('kw', 1, 1), code: '{"expectedLabels":["seq"],"found":"se"}' },
    );
    expect(fixes[0].title).toBe("Replace with 'seq'");
    expect(fixes[0].edits[0].text).toBe('seq');
  });

  test('channel missing arrow quick fix', () => {
    const model = mockModel(['channel 1 inst lead seq main']);
    const fixes = suggestQuickFixes(
      "[parser] Channel statement is missing '=>'. Expected: channel <n> => ...",
      model,
      marker('ch', 1, 1),
    );
    expect(fixes[0].edits[0].text).toBe(' => ');
  });

  test('unknown keyword did you mean seq', () => {
    const model = mockModel(['chip gameboy', 'se my_seq = kick']);
    const fixes = suggestQuickFixes(
      "[parser] Unknown keyword 'se'. Did you mean 'seq'?",
      model,
      marker('kw', 2, 1),
    );
    expect(fixes[0].title).toBe("Change 'se' to 'seq'");
    expect(editText(fixes[0])).toBe('seq');
    expect(fixes[0].edits[0].range.startColumn).toBe(1);
  });

  test('unknown keyword valid keywords list', () => {
    const model = mockModel(['pa drums = C4']);
    const fixes = suggestQuickFixes(
      "[parser] Unknown keyword 'pa'. Valid keywords: chip, bpm, inst, pat, seq, channel.",
      model,
      marker('kw', 1, 1),
    );
    expect(fixes.map((f) => editText(f))).toContain('pat');
    expect(fixes[0].title).toMatch(/pat/i);
  });

  test('unknown chip', () => {
    const model = mockModel(['chip atari']);
    const fixes = suggestQuickFixes(
      "[parser] Unknown chip 'atari'. Supported chips: gameboy, nes, sms.",
      model,
      marker("[parser] Unknown chip 'atari'.", 1, 6),
    );
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.map((f) => editText(f))).toEqual(
      expect.arrayContaining(['gameboy', 'nes', 'sms']),
    );
    expect(fixes[0].edits[0].range.startColumn).toBe(6);
  });

  test('unknown play flag', () => {
    const model = mockModel(['play loopx']);
    const fixes = suggestQuickFixes(
      "[parser] 'play' has unknown flag 'loopx'. Valid flags: auto, repeat.",
      model,
      marker('flag', 1, 6),
    );
    expect(fixes.map((f) => editText(f))).toEqual(expect.arrayContaining(['auto', 'repeat']));
  });

  test('unknown instrument type', () => {
    const model = mockModel(['inst lead type=triangle']);
    const fixes = suggestQuickFixes(
      "[parser] Instrument 'lead': unknown type 'triangle'. Valid types: pulse1, pulse2, wave, noise.",
      model,
      marker('type', 1, 16),
    );
    expect(fixes.map((f) => editText(f))).toEqual(
      expect.arrayContaining(['pulse1', 'pulse2', 'wave', 'noise']),
    );
    expect(fixes[0].edits[0].range.startColumn).toBe(16);
  });

  test('enum must be one of', () => {
    const model = mockModel(['inst n type=pulse1 duty=80']);
    const fixes = suggestQuickFixes(
      "[parser] Instrument 'n': duty must be one of: 12, 25, 50, 75. Got '80'",
      model,
      marker('duty', 1, 28),
    );
    expect(fixes.length).toBeGreaterThan(0);
    expect(['12', '25', '50', '75']).toContain(editText(fixes[0]));
  });

  test('duplicate channel removes line', () => {
    const model = mockModel(['channel 1 => inst a seq s', 'channel 1 => inst b seq s']);
    const fixes = suggestQuickFixes(
      '[parser] Duplicate channel 1: each channel ID may only be declared once.',
      model,
      marker('dup', 2, 1),
    );
    expect(fixes[0].title).toContain('Remove duplicate');
    expect(editText(fixes[0])).toBe('');
    expect(fixes[0].edits[0].range.startLineNumber).toBe(2);
  });

  test('unknown property removal', () => {
    const model = mockModel(['inst lead type=pulse1 dutyx=50']);
    const fixes = suggestQuickFixes(
      "[parser] Instrument 'lead': unknown property 'dutyx'.",
      model,
      marker('prop', 1, 1),
    );
    expect(editText(fixes[0])).toBe('');
    expect(fixes[0].title).toContain('dutyx');
  });

  test('invalid region', () => {
    const model = mockModel(['chip nes ntcs']);
    const fixes = suggestQuickFixes(
      "[parser] Invalid NES region 'ntcs'. Valid values: ntsc, pal.",
      model,
      marker('region', 1, 10),
    );
    expect(editText(fixes[0])).toBe('ntsc');
  });

  test('undefined instrument offers existing names and create stub', () => {
    const model = mockModel([
      'chip gameboy',
      'inst lead type=pulse1',
      'inst bass type=pulse2',
      'channel 1 => inst leed seq main',
      'pat main = C4',
      'seq main = main',
    ]);
    const fixes = suggestQuickFixes(
      "[parser] Channel 1: instrument 'leed' is not defined.",
      model,
      marker('inst', 4, 20),
    );
    expect(fixes.length).toBeGreaterThan(1);
    expect(fixes[0].title).toBe("Use instrument 'lead'");
    expect(editText(fixes[0])).toBe('lead');
    expect(fixes[0].edits[0].range.startColumn).toBe(19);
    expect(fixes.map((f) => f.title)).toEqual(
      expect.arrayContaining(["Use instrument 'lead'", "Create instrument 'leed'"]),
    );
    const createFix = fixes.find((f) => f.title.includes('Create instrument'));
    expect(editText(createFix!)).toBe('inst leed type=pulse1\n');
  });

  test('undefined instrument with no definitions only creates stub', () => {
    const model = mockModel([
      'chip gameboy',
      'channel 1 => inst ghost seq main',
      'pat main = C4',
      'seq main = main',
    ]);
    const fixes = suggestQuickFixes(
      "[parser] Channel 1: instrument 'ghost' is not defined.",
      model,
      marker('inst', 2, 20),
    );
    expect(fixes).toHaveLength(1);
    expect(fixes[0].title).toContain("Create instrument 'ghost'");
    expect(editText(fixes[0])).toBe('inst ghost type=pulse1\n');
  });

  test('unknown pattern token offers similar instrument name', () => {
    const model = mockModel([
      'chip gameboy',
      'inst kit type=noise',
      'pat drums = kt . kit .',
      'channel 1 => inst kit seq drums',
    ]);
    const fixes = suggestQuickFixes(
      "[parser] Pattern 'drums': unknown token 'kt' — not a valid note, rest, or defined name.",
      model,
      marker('kt', 3, 13),
    );
    expect(fixes[0].title).toBe("Use instrument 'kit'");
    expect(editText(fixes[0])).toBe('kit');
    expect(fixes[0].edits[0].range.startColumn).toBe(13);
  });

  test('undefined pattern/seq on channel offers existing names and stubs', () => {
    const model = mockModel([
      'chip gameboy',
      'inst lead type=pulse1',
      'pat main = C4',
      'seq main = main',
      'channel 1 => inst lead seq mainn',
    ]);
    const fixes = suggestQuickFixes(
      "[parser] Channel 1: sequence/pattern 'mainn' is not defined.",
      model,
      marker('seq', 5, 30),
    );
    expect(fixes[0].title).toBe("Use sequence 'main'");
    expect(editText(fixes[0])).toBe('main');
    expect(fixes.map((f) => f.title)).toEqual(
      expect.arrayContaining([
        "Use sequence 'main'",
        "Create pattern 'mainn'",
        "Create sequence 'mainn'",
      ]),
    );
    const createPat = fixes.find((f) => f.title.includes("Create pattern 'mainn'"));
    expect(editText(createPat!)).toBe('pat mainn = .\n');
  });

  test('undefined reference in sequence body offers existing pat/seq', () => {
    const model = mockModel([
      'inst lead type=pulse1',
      'pat kick = C4',
      'pat drums = C4',
      'seq main = kick drms',
      'channel 1 => inst lead seq main',
    ]);
    const fixes = suggestQuickFixes(
      "[parser] Sequence 'main': pattern/sequence 'drms' is not defined.",
      model,
      marker('drms', 4, 20),
    );
    expect(fixes[0].title).toBe("Use pattern 'drums'");
    expect(editText(fixes[0])).toBe('drums');
    expect(fixes.map((f) => f.title)).toEqual(
      expect.arrayContaining([
        "Use pattern 'drums'",
        "Create pattern 'drms'",
        "Create sequence 'drms'",
      ]),
    );
  });

  test('unknown pattern token can suggest pat or seq name', () => {
    const model = mockModel([
      'chip gameboy',
      'pat drums = C4 .',
      'pat fill = drms .',
      'channel 1 => inst lead seq fill',
    ]);
    const fixes = suggestQuickFixes(
      "[parser] Pattern 'fill': unknown token 'drms' — not a valid note, rest, or defined name.",
      model,
      marker('drms', 3, 13),
    );
    expect(fixes[0].title).toBe("Use pattern 'drums'");
    expect(editText(fixes[0])).toBe('drums');
  });

  test('skips stub when symbol already defined', () => {
    const source = 'inst ghost type=pulse1\nchannel 1 => inst ghost seq s';
    expect(isSymbolDefinedInSource(source, 'ghost', 'inst')).toBe(true);
    const model = mockModel(source.split('\n'));
    const fixes = suggestQuickFixes(
      "[parser] Channel 1: instrument 'ghost' is not defined.",
      model,
      marker('inst', 2, 20),
    );
    expect(fixes).toHaveLength(0);
  });
});

describe('buildStubInsertEdit', () => {
  test('appends at end of file when no channel section', () => {
    const model = mockModel(['chip gameboy']);
    const edit = buildStubInsertEdit(model, 2, 'inst x type=pulse1');
    expect(edit.text).toBe('\ninst x type=pulse1\n');
    expect(edit.range.startLineNumber).toBe(1);
  });
});

describe('findMarkerForProblem / getQuickFixesForProblem', () => {
  test('finds marker by line and message', () => {
    const model = mockModel(['chip gameboy']);
    const markers = [
      marker('[parser] Unknown chip "nes". Supported chips: gameboy.', 1, 6, 10),
    ];
    (monaco.editor.getModelMarkers as jest.Mock).mockReturnValueOnce(markers);

    const found = findMarkerForProblem(
      model,
      'Unknown chip "nes". Supported chips: gameboy.',
      { start: { line: 1, column: 6 } },
    );
    expect(found?.message).toBe(markers[0].message);
  });

  test('getQuickFixesForProblem matches editor suggestQuickFixes', () => {
    const model = mockModel(['chip nes']);
    const msg = 'Unknown chip \'nes\'. Supported chips: gameboy.';
    const m = marker(`[parser] ${msg}`, 1, 6, 10);
    (monaco.editor.getModelMarkers as jest.Mock).mockReturnValueOnce([m]);

    const fromProblem = getQuickFixesForProblem(model, msg, { start: { line: 1, column: 6 } });
    const fromEditor = suggestQuickFixes(m.message!, model, m);
    expect(fromProblem.map((f) => f.title)).toEqual(fromEditor.map((f) => f.title));
  });
});

describe('registerBeatBaxCodeActions', () => {
  test('registers provider', () => {
    registerBeatBaxCodeActions();
    expect(monaco.languages.registerCodeActionProvider).toHaveBeenCalledWith(
      'beatbax',
      expect.objectContaining({ provideCodeActions: expect.any(Function) }),
    );
  });
});
