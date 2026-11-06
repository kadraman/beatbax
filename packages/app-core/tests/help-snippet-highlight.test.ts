import {
  formatHelpSnippetHtml,
  tokenizeHelpSnippet,
  tokenizeHelpSnippetLine,
} from '../src/editor/help-snippet-highlight';

describe('tokenizeHelpSnippetLine', () => {
  test('plain code has no comment span', () => {
    expect(tokenizeHelpSnippetLine('pat melody = C5 E5')).toEqual([
      { text: 'pat melody = C5 E5', kind: 'code' },
    ]);
  });

  test('full-line comment', () => {
    expect(tokenizeHelpSnippetLine('# pan:L pan:R')).toEqual([
      { text: '# pan:L pan:R', kind: 'comment' },
    ]);
  });

  test('trailing comment after code', () => {
    expect(tokenizeHelpSnippetLine('bpm 128 # tempo')).toEqual([
      { text: 'bpm 128 ', kind: 'code' },
      { text: '# tempo', kind: 'comment' },
    ]);
  });
});

describe('tokenizeHelpSnippet', () => {
  test('splits lines and normalizes CRLF', () => {
    expect(tokenizeHelpSnippet('a\r\n# b\nc # d')).toEqual([
      [{ text: 'a', kind: 'code' }],
      [{ text: '# b', kind: 'comment' }],
      [
        { text: 'c ', kind: 'code' },
        { text: '# d', kind: 'comment' },
      ],
    ]);
  });
});

describe('formatHelpSnippetHtml', () => {
  test('escapes HTML and wraps comments', () => {
    expect(formatHelpSnippetHtml('pat x = C4 # <hi>\n# note')).toBe(
      'pat x = C4 <span class="bb-help__comment"># &lt;hi&gt;</span>\n'
      + '<span class="bb-help__comment"># note</span>',
    );
  });
});
