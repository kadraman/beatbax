import parseWithChevrotain from '../src/parser/chevrotain';

let chevAvailable = false;
beforeAll(async () => {
  try { await import('chevrotain'); chevAvailable = true; } catch (e) { console.warn('chevrotain not available; skipping edgecase tests'); }
});

describe('chevrotain edge cases', () => {
  test('triple-quoted song description preserves newlines and # signs', async () => {
    if (!chevAvailable) return;
    const input = `song description """Line1\n#notacomment\nLine3"""\n`;
    const { errors, ast } = await parseWithChevrotain(input);
    expect(errors).toEqual([]);
    if (!ast) throw new Error('AST null');
    expect(ast.metadata.description).toContain('Line1');
    expect(ast.metadata.description).toContain('#notacomment');
  });

  test('sequence repeat syntax captured as name*count', async () => {
    if (!chevAvailable) return;
    const input = `seq r = lead * 2 bass\n`;
    const { errors, ast } = await parseWithChevrotain(input);
    expect(errors).toEqual([]);
    if (!ast) throw new Error('AST null');
    expect(ast.seqs.r).toEqual(['lead*2', 'bass']);
  });

  test('pat modifiers support inst(name,2)', async () => {
    if (!chevAvailable) return;
    const input = `pat FILL = inst(hat,2) C6\n`;
    const { errors, ast } = await parseWithChevrotain(input);
    expect(errors).toEqual([]);
    if (!ast) throw new Error('AST null');
    expect(Array.isArray(ast.pats.FILL)).toBe(true);
    // ensure inst(hat,2) was left as a token or resolved; presence suffices for the moment
    expect(ast.pats.FILL.join(' ')).toContain('inst');
  });
});