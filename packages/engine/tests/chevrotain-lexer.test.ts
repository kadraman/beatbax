import { lex } from '../src/parser/chevrotain/lexer';

let chevAvailable = false;

beforeAll(async () => {
  try {
    await import('chevrotain');
    chevAvailable = true;
  } catch (e) {
    console.warn('chevrotain not available; skipping Chevrotain lexer tests');
  }
});

describe('chevrotain lexer', () => {
  test('skips comments and whitespace', () => {
    if (!chevAvailable) return;
    const input = `# this is a comment\nchip gameboy # inline comment\n`;
    const { tokens, errors } = lex(input);
    expect(errors).toEqual([]);
    const names = tokens.map((t: any) => t.tokenType.name);
    expect(names).toContain('Chip');
    expect(names).toContain('Id');
    // Comments should be skipped
    expect(names).not.toContain('Comment');
    // First token should be Chip
    expect(names[0]).toBe('Chip');
  });

  test('recognizes quoted string literals', () => {
    if (!chevAvailable) return;
    const input = `song name "Hello World"\n`;
    const { tokens, errors } = lex(input);
    expect(errors).toEqual([]);
    const names = tokens.map((t: any) => t.tokenType.name);
    expect(names).toContain('StringLiteral');
    const strTok = tokens.find((t: any) => t.tokenType.name === 'StringLiteral');
    expect(strTok!.image).toBe('"Hello World"');
  });

  test('parens and modifiers tokenization', () => {
    if (!chevAvailable) return;
    const input = `pat melody:oct(-1):rev = C5 inst(lead)\n`;
    const { tokens, errors } = lex(input);
    expect(errors).toEqual([]);
    const names = tokens.map((t: any) => t.tokenType.name);
    // Expect tokens: Pat, Id, Colon, Id (oct), LParen, NumberLiteral, RParen, Colon, Id (rev), Equals, Id, Inst, LParen, Id, RParen
    expect(names).toEqual(expect.arrayContaining(['Pat', 'Id', 'Colon', 'Id', 'LParen', 'NumberLiteral', 'RParen', 'Equals', 'Inst', 'LParen', 'Id', 'RParen']));
  });

  test('brackets and commas for arrays', () => {
    if (!chevAvailable) return;
    const input = `inst wave1 type=wave wave=[0,3,6,9]\n`;
    const { tokens, errors } = lex(input);
    expect(errors).toEqual([]);
    const names = tokens.map((t: any) => t.tokenType.name);
    expect(names).toEqual(expect.arrayContaining(['Inst', 'Id', 'Equals', 'Id', 'Id', 'Equals', 'LBracket', 'NumberLiteral', 'Comma', 'NumberLiteral', 'Comma', 'NumberLiteral', 'Comma', 'NumberLiteral', 'RBracket']));
  });
});