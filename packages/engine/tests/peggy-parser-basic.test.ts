import { parseLegacy, parse } from '../src/parser';
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
  test('parses a simple program equivalently to legacy parser', () => {
    const legacyAst = parseLegacy(sampleSource);
    const peggyAst = parseWithPeggy(sampleSource);

    expect(peggyAst).toEqual(legacyAst);
  });

  test('env flag switches parse implementation', () => {
    process.env.BEATBAX_PARSER = 'peggy';
    const flaggedAst = parse(sampleSource);
    process.env.BEATBAX_PARSER = undefined;

    expect(flaggedAst).toEqual(parseWithPeggy(sampleSource));
  });
});
