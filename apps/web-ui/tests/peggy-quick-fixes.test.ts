import * as monaco from 'monaco-editor';
import {
  extractQuotedLiteralsFromExpected,
  parseExpectedButFoundMessage,
  peggyExpectedFixes,
  statementRecoveryFixes,
} from '../src/editor/peggy-quick-fixes';

function mockModel(lines: string[]): monaco.editor.ITextModel {
  return {
    getValue: () => lines.join('\n'),
    getLineContent: (n: number) => lines[n - 1] ?? '',
    getLineCount: () => lines.length,
    uri: { toString: () => 'file:///t.bax' } as monaco.Uri,
    getVersionId: () => 1,
  } as monaco.editor.ITextModel;
}

function marker(line: number, col = 1): monaco.editor.IMarkerData {
  return {
    message: '',
    severity: monaco.MarkerSeverity.Error,
    startLineNumber: line,
    startColumn: col,
    endLineNumber: line,
    endColumn: col + 1,
  };
}

describe('parseExpectedButFoundMessage', () => {
  test('parses canonical Peggy message', () => {
    expect(
      parseExpectedButFoundMessage('Expected "seq" but "se" found.'),
    ).toEqual({ expectedPart: '"seq"', foundPart: '"se"' });
  });
});

describe('extractQuotedLiteralsFromExpected', () => {
  test('pulls multiple literals', () => {
    expect(extractQuotedLiteralsFromExpected('"=" or "seq"')).toEqual(['=', 'seq']);
  });
});

describe('peggyExpectedFixes', () => {
  test('replaces typo with expected literal', () => {
    const model = mockModel(['se my_seq = kick']);
    const fixes = peggyExpectedFixes(
      model,
      marker(1, 1),
      'Expected "seq" but "se" found.',
      { expectedLabels: ['seq'], found: 'se' },
    );
    expect(fixes[0].title).toBe("Replace with 'seq'");
    expect(fixes[0].edits[0].text).toBe('seq');
  });

  test('does not treat tokens containing = or trailing brackets as operators', () => {
    const model = mockModel(['chip foo>', 'pat x=y = C4']);
    const chipFixes = peggyExpectedFixes(
      model,
      marker(1, 6),
      'Expected "chip" but "foo>" found.',
      { expectedLabels: ['chip'], found: 'foo>' },
    );
    expect(chipFixes[0].title).toBe("Replace with 'chip'");
    expect(chipFixes.some((f) => f.title.startsWith('Insert'))).toBe(false);

    const patFixes = peggyExpectedFixes(
      model,
      marker(2, 6),
      'Expected "=" but "x=y" found.',
      { expectedLabels: ['='], found: 'x=y' },
    );
    expect(patFixes[0].title).toBe("Replace with '='");
    expect(patFixes.some((f) => f.title.startsWith('Insert'))).toBe(false);
  });

  test('inserts => on channel line', () => {
    const model = mockModel(['channel 1 inst lead seq main']);
    const fixes = statementRecoveryFixes(
      model,
      marker(1),
      "Channel statement is missing '=>'. Expected: channel <n> => ...",
    );
    expect(fixes[0].edits[0].text).toBe(' => ');
    expect(fixes[0].edits[0].range).toEqual({
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: 10,
      endColumn: 11,
    });
  });

  test('inserts = in pat shorthand', () => {
    const model = mockModel(['pat drums C4 E4']);
    const fixes = statementRecoveryFixes(
      model,
      marker(1),
      "Invalid statement syntax: 'pat drums C4 E4'.",
    );
    expect(fixes[0].title).toContain("Insert '='");
    expect(fixes[0].edits[0].text).toBe(' =');
  });
});
