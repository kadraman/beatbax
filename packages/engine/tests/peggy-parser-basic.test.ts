import { parse } from '../src/parser';
import { parseWithPeggy } from '../src/parser/peggy';

const sampleSource = `
chip gameboy
bpm 150
song name "Test Song"
inst lead  type=pulse1 duty=50 env=12,down
pat main   = C4 D4
seq chorus = main main:oct(+1)
channel 1 => inst lead seq chorus
play auto repeat
`;

describe('peggy parser parity', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.BEATBAX_PARSER;
  });

  afterEach(() => {
    process.env.BEATBAX_PARSER = originalEnv;
  });

  test('parse() delegates to Peggy parser', () => {
    const peggyAst = parseWithPeggy(sampleSource);
    const topAst = parse(sampleSource);
    // Structured fields are additive; ensure top-level parse uses Peggy implementation
    expect(topAst).toEqual(peggyAst);
  });
});
