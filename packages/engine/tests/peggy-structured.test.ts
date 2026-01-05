import { parseWithPeggy } from '../src/parser/peggy';
import { resolveSong } from '../src/song/resolver';

const sampleSource = `
chip gameboy
inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down
pat main = C4:2 inst(bass,2) .
seq chorus = main main:oct(+1):slow(2)
channel 1 => inst lead seq chorus
`;

describe('Peggy structured parsing', () => {
  // Peggy is the only supported parser now; no runtime parser selection.

  test('emits structured patternEvents and sequenceItems', () => {
    const ast = parseWithPeggy(sampleSource);

    expect(ast.patternEvents?.main?.[0]).toMatchObject({ kind: 'note', value: 'C4', duration: 2 });
    expect(ast.patternEvents?.main?.[1]).toMatchObject({ kind: 'temp-inst', name: 'bass', duration: 2 });
    expect(ast.patternEvents?.main?.[2]).toMatchObject({ kind: 'rest' });

    const transforms = ast.sequenceItems?.chorus?.[1]?.transforms;
    expect(transforms?.[0]).toMatchObject({ kind: 'oct', value: 1 });
    expect(transforms?.[1]).toMatchObject({ kind: 'slow', value: 2 });
  });

  test('resolver consumes structured data when token maps are empty', () => {
    const ast = parseWithPeggy(sampleSource);
    ast.pats = {};
    ast.seqs = {};

    const song = resolveSong(ast);

    expect(song.pats.main.slice(0, 3)).toEqual(['C4', '_', 'inst(bass,2)']);
    expect(song.seqs.chorus.slice(0, 3)).toEqual(['C4', '_', 'inst(bass,2)']);
    expect(song.channels[0].events[0]).toMatchObject({ type: 'note', token: 'C4' });
  });

  test('resolver prioritizes structured when both structured and legacy maps exist', () => {
    const ast = parseWithPeggy(sampleSource);
    // Legacy maps with different content to ensure structured wins
    ast.pats = { main: ['LEGACY'] };
    ast.seqs = { chorus: ['LEGACY_SEQ'] };

    const song = resolveSong(ast);

    // Structured materialization should override legacy entries
    expect(song.pats.main.slice(0, 3)).toEqual(['C4', '_', 'inst(bass,2)']);
    expect(song.seqs.chorus.slice(0, 3)).toEqual(['C4', '_', 'inst(bass,2)']);
  });
});
