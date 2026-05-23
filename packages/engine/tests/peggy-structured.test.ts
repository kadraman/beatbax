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
    const ast = parseWithPeggy(sampleSource).ast;

    expect(ast.patternEvents?.main?.[0]).toMatchObject({ kind: 'note', value: 'C4', duration: 2 });
    expect(ast.patternEvents?.main?.[1]).toMatchObject({ kind: 'temp-inst', name: 'bass', duration: 2 });
    expect(ast.patternEvents?.main?.[2]).toMatchObject({ kind: 'rest' });

    const transforms = ast.sequenceItems?.chorus?.[1]?.transforms;
    expect(transforms?.[0]).toMatchObject({ kind: 'oct', value: 1 });
    expect(transforms?.[1]).toMatchObject({ kind: 'slow', value: 2 });
  });

  test('unknown sequence transform emits parser diagnostic with suggestion', () => {
    const src = `
chip gameboy
inst lead type=pulse1
pat lead_core = C4
seq main = lead_core:tranpese(+2)
channel 1 => inst lead seq main
`;
    const { ast } = parseWithPeggy(src);
    const unknown = ast.diagnostics?.find((d) => d.message.includes('tranpese'));
    expect(unknown).toBeDefined();
    expect(unknown?.level).toBe('warning');
    expect(unknown?.message).toContain("Did you mean 'transpose(+2)'");
    expect(unknown?.loc?.start?.line).toBe(5);
    expect(unknown?.loc?.start?.column).toBeGreaterThan(1);
  });

  test('unknown transform on channel seq spec is located on the channel line', () => {
    const src = `
chip gameboy
inst lead type=pulse1
pat main = C4
channel 1 => inst lead seq main:tranpese(+2)
`;
    const { ast } = parseWithPeggy(src);
    const unknown = ast.diagnostics?.find(
      (d) => d.message.includes('tranpese') && d.message.includes('channel'),
    );
    expect(unknown).toBeDefined();
    expect(unknown?.loc?.start?.line).toBe(5);
    expect(unknown?.loc?.start?.column).toBeGreaterThan(20);
  });

  test('parses tier-1 transform kinds into structured sequenceItems', () => {
    const src = `
chip gameboy
pat p = C4 D4 E4
seq advanced = p:rotate(1):palindrome p:arp(4,7) p:clamp(C3,C6) p:fold(C3,C6) p:mute p:transpose(+2)
`;
    const ast = parseWithPeggy(src).ast;
    const items = ast.sequenceItems?.advanced ?? [];
    expect(items[0]?.transforms?.map(t => t.kind)).toEqual(['rotate', 'palindrome']);
    expect(items[1]?.transforms?.map(t => t.kind)).toEqual(['arp']);
    expect(items[2]?.transforms?.map(t => t.kind)).toEqual(['clamp']);
    expect(items[3]?.transforms?.map(t => t.kind)).toEqual(['fold']);
    expect(items[4]?.transforms?.map(t => t.kind)).toEqual(['mute']);
    expect(items[5]?.transforms?.[0]).toMatchObject({ kind: 'transpose', value: 2 });
  });

  test('resolver consumes structured data when token maps are empty', () => {
    const ast = parseWithPeggy(sampleSource).ast;
    ast.pats = {};
    ast.seqs = {};

    const song = resolveSong(ast);

    expect(song.pats.main.slice(0, 3)).toEqual(['C4', '_', 'inst(bass,2)']);
    expect(song.seqs.chorus.slice(0, 3)).toEqual(['C4', '_', 'inst(bass,2)']);
    expect(song.channels[0].events[0]).toMatchObject({ type: 'note', token: 'C4' });
  });

  test('resolver prioritizes structured when both structured and legacy maps exist', () => {
    const ast = parseWithPeggy(sampleSource).ast;
    // Legacy maps with different content to ensure structured wins
    ast.pats = { main: ['LEGACY'] };
    ast.seqs = { chorus: ['LEGACY_SEQ'] };

    const song = resolveSong(ast);

    // Structured materialization should override legacy entries
    expect(song.pats.main.slice(0, 3)).toEqual(['C4', '_', 'inst(bass,2)']);
    expect(song.seqs.chorus.slice(0, 3)).toEqual(['C4', '_', 'inst(bass,2)']);
  });
});
