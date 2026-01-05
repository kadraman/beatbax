import { tokenize, TokenType } from '../src/parser/tokenizer';

describe.skip('tokenizer (legacy) - skipped after Peggy migration', () => {
  test('parses notes (C5, G#3, Bb4)', () => {
    const src = 'C5 G#3 Bb4';
    const toks = tokenize(src);
    const noteTokens = toks.filter(t => t.type === TokenType.NOTE).map(t => t.value);
    expect(noteTokens).toEqual(['C5', 'G#3', 'BB4']);
    expect(toks[toks.length - 1].type).toBe(TokenType.EOF);
  });

  test('parses pattern string literal', () => {
    const src = 'pat A = "x . x x"';
    const toks = tokenize(src);
    // expect IDENT 'pat', IDENT 'A', EQUAL, STRING
    expect(toks[0].type).toBe(TokenType.IDENT);
    expect(toks[0].value).toBe('pat');
    expect(toks[1].type).toBe(TokenType.IDENT);
    expect(toks[1].value).toBe('A');
    expect(toks[2].type).toBe(TokenType.EQUAL);
    expect(toks[3].type).toBe(TokenType.STRING);
    expect(toks[3].value).toBe('x . x x');
  });

  test('parses bracketed numeric arrays', () => {
    const src = 'wave = [0, 3,6,9]';
    const toks = tokenize(src);
    // expect IDENT 'wave', EQUAL, LBRACKET, NUMBER, COMMA, NUMBER, COMMA, NUMBER, COMMA, NUMBER, RBRACKET
    const types = toks.map(t => t.type).filter(t => t !== TokenType.EOF);
    expect(types).toEqual([
      TokenType.IDENT,
      TokenType.EQUAL,
      TokenType.LBRACKET,
      TokenType.NUMBER,
      TokenType.COMMA,
      TokenType.NUMBER,
      TokenType.COMMA,
      TokenType.NUMBER,
      TokenType.COMMA,
      TokenType.NUMBER,
      TokenType.RBRACKET,
    ]);

    const numbers = toks.filter(t => t.type === TokenType.NUMBER).map(t => t.value);
    expect(numbers).toEqual(['0', '3', '6', '9']);
  });
});
