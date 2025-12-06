import { parse } from '../src/parser';

describe('inline and channel instrument overrides', () => {
  test('inline inst tokens remain in expanded pattern tokens', () => {
    const src = `
      pat P = inst sn C6 C6 inst(hat,2) C6
    `;
    const ast = parse(src);
    // expandPattern tokenizes by whitespace; `inst sn` becomes two tokens,
    // while `inst(hat,2)` remains a single token.
    expect(ast.pats.P).toEqual(['inst', 'sn', 'C6', 'C6', 'inst(hat,2)', 'C6']);
  });

  test('channel-level pat modifier inst(name) sets channel default instrument', () => {
    const src = `
      pat A = C4 D4
      channel 2 => inst lead pat A:inst(bass)
    `;
    const ast = parse(src);
    const ch = ast.channels.find(c => c.id === 2)!;
    expect(ch.inst).toBe('bass');
    expect(ch.pat).toEqual(['C4', 'D4']);
  });

  test('channel RHS `inst name pat` sets channel instrument', () => {
    const src = `
      pat B = E4 F4
      channel 3 => inst snare pat B
    `;
    const ast = parse(src);
    const ch = ast.channels.find(c => c.id === 3)!;
    expect(ch.inst).toBe('snare');
    expect(ch.pat).toEqual(['E4', 'F4']);
  });
});
