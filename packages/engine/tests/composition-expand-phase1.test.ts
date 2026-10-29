import { parseWithPeggy } from '../src/parser/peggy/index.js';

const preamble = `chip gameboy
bpm 120
inst lead type=pulse1
pat a = C4 E4 G4
pat b = D4 F4 A4
pat c = E4 G4 B4
`;

describe('composition Phase 1: alias + cat', () => {
  it('expands cat() into flat sequence items', () => {
    const src = `${preamble}
seq s1 = a
seq s2 = b
seq song = cat(s1, s2)
channel 1 => inst lead seq song
`;
    const { ast, hasErrors } = parseWithPeggy(src);
    expect(hasErrors).toBe(false);
    expect(ast.sequenceItems?.song?.map((i) => i.name)).toEqual(['s1', 's2']);
    expect(ast.seqs.song).toEqual(['s1', 's2']);
  });

  it('applies per-operand modifiers in cat()', () => {
    const src = `${preamble}
seq s1 = a
seq s2 = b
seq song = cat(s1:oct(-1), s2)
channel 1 => inst lead seq song
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.seqs.song[0]).toContain('oct');
    expect(ast.sequenceItems?.song?.[0].transforms?.some((t) => t.kind === 'oct')).toBe(true);
  });

  it('flattens nested cat()', () => {
    const src = `${preamble}
seq s1 = a
seq s2 = b
seq s3 = c
seq song = cat(s1, cat(s2, s3))
channel 1 => inst lead seq song
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.sequenceItems?.song?.map((i) => i.name)).toEqual(['s1', 's2', 's3']);
  });

  it('errors on empty cat()', () => {
    const src = `${preamble}
seq song = cat()
channel 1 => inst lead seq song
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.diagnostics?.some((d) => /Empty cat\(\)/i.test(d.message))).toBe(true);
  });

  it('expands alias into seq RHS', () => {
    const src = `${preamble}
alias body = a b
seq hook = body
seq finale = body
channel 1 => inst lead seq hook
`;
    const { ast, hasErrors } = parseWithPeggy(src);
    expect(hasErrors).toBe(false);
    expect(ast.sequenceItems?.hook?.map((i) => i.name)).toEqual(['a', 'b']);
    expect(ast.sequenceItems?.finale?.map((i) => i.name)).toEqual(['a', 'b']);
    expect(ast.aliases?.body).toBeTruthy();
  });

  it('allows forward alias references', () => {
    const src = `${preamble}
seq hook = later_body
alias later_body = a b
channel 1 => inst lead seq hook
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.sequenceItems?.hook?.map((i) => i.name)).toEqual(['a', 'b']);
  });

  it('allows acyclic alias-to-alias', () => {
    const src = `${preamble}
alias inner = a
alias outer = inner b
seq hook = outer
channel 1 => inst lead seq hook
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.sequenceItems?.hook?.map((i) => i.name)).toEqual(['a', 'b']);
  });

  it('errors on alias cycles with a trace', () => {
    const src = `${preamble}
alias x = y
alias y = x
seq hook = x
channel 1 => inst lead seq hook
`;
    const { ast } = parseWithPeggy(src);
    const msg = ast.diagnostics?.find((d) => /Alias cycle/i.test(d.message))?.message || '';
    expect(msg).toMatch(/x/);
    expect(msg).toMatch(/y/);
  });

  it('errors on duplicate alias', () => {
    const src = `${preamble}
alias body = a
alias body = b
seq hook = body
channel 1 => inst lead seq hook
`;
    const { ast } = parseWithPeggy(src);
    expect(ast.diagnostics?.some((d) => /alias 'body' redefined/i.test(d.message))).toBe(true);
  });
});
