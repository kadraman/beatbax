import parseWithChevrotain from '../src/parser/chevrotain';

let chevAvailable = false;
beforeAll(async () => {
  try {
    await import('chevrotain'); chevAvailable = true;
  } catch (e) {
    console.warn('chevrotain not available; skipping Chevrotain transformer tests');
  }
});

describe('chevrotain transformer', () => {
  test('transforms CST to AST for basic directives', async () => {
    if (!chevAvailable) return;
    const input = `chip gameboy\nbpm 128\nsong name "My Title"\nsong tags "tag1, tag2"\nexport json "song.json"\npat melody = C5 E5 G5 C6\ninst lead type=pulse1 duty=50 env=12\nseq main = melody melody\nchannel 1 => inst lead seq main\n`;
    const { errors, ast } = await parseWithChevrotain(input);
    expect(errors).toEqual([]);
    if (!ast) throw new Error('AST is null');
    expect(ast.chip).toBe('gameboy');
    expect(ast.bpm).toBe(128);
    expect(ast.metadata.name).toBe('My Title');
    expect(ast.metadata.tags).toEqual(expect.arrayContaining(['tag1', 'tag2']));
    expect(ast.metadata.exports).toBeDefined();
    expect(ast.metadata.exports[0].format).toBe('json');
    expect(ast.metadata.exports[0].dest).toBe('song.json');
    expect(ast.pats.melody).toBeDefined();
    expect(Array.isArray(ast.pats.melody)).toBe(true);
    expect(ast.insts.lead).toBeDefined();
    expect(ast.insts.lead.type).toBe('pulse1');
    expect(ast.seqs.main).toEqual(['melody', 'melody']);
    expect(ast.channels.find((c: any) => c.id === 1)).toBeTruthy();
  });
});