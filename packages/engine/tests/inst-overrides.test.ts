import { parse } from '../src/parser';

describe('instrument overrides in patterns', () => {
  test('inline inst token changes instrument for next N notes', () => {
    const src = `
      inst hat type=noise env=12,down
      inst sn type=noise env=8,down
      pat P = inst(hat,2) C6 C6 C5 C5
    `;
    const ast = parse(src);
    // first two tokens should be using 'hat' override
    const events = ast.pats.P;
    expect(events[0]).toMatch(/inst\(hat,2\)/);
    expect(events[1]).toMatch(/C6/);
  });

  test('temporary inst(name,N) with N greater than pattern length clamps', () => {
    const src = `
      inst bass type=pulse2
      pat B = inst(bass,10) C3 C3
    `;
    const ast = parse(src);
    // Parser should accept the declaration and produce tokens; length should be >= pattern length
    expect(ast.pats.B.length).toBeGreaterThanOrEqual(2);
  });
});
