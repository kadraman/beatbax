import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';
import { expandAllSequences } from '../src/sequences/expand';
import { expandRefToTokens } from '../src/expand/refExpander';

const baseSong = `
chip gameboy
inst lead type=pulse1
pat lead_core = C4 D4 E4 G4
`;

describe('chained sequence modifiers', () => {
  test('seq item rot(1):lag(1) applies both modifiers in order', () => {
    const ast = parse(`${baseSong}
seq demo_lag = lead_core:rot(1):lag(1)
channel 1 => inst lead seq demo_lag
`);
    const expanded = expandAllSequences(ast.seqs, ast.pats, ast.insts);
    expect(expanded.demo_lag).toEqual(['.', 'D4', 'E4', 'G4', 'C4']);

    expect(expandRefToTokens('lead_core:rot(1):lag(1)', expanded, ast.pats)).toEqual(
      expanded.demo_lag,
    );

    const song = resolveSong(ast);
    const ch = song.channels.find((c) => c.id === 1)!;
    expect(ch.events.slice(0, 5).map((e) => e.type)).toEqual([
      'rest',
      'note',
      'note',
      'note',
      'note',
    ]);
    expect(
      ch.events
        .filter((e) => e.type === 'note')
        .map((e) => (e as { token: string }).token),
    ).toEqual(['D4', 'E4', 'G4', 'C4']);
  });

  test('seq item rot(1):chunk(2) applies rotate then chunk', () => {
    const ast = parse(`${baseSong}
seq demo = lead_core:rot(1):chunk(2)
`);
    const expanded = expandAllSequences(ast.seqs, ast.pats, ast.insts);
    expect(expanded.demo).toEqual(['E4', 'D4', 'C4', 'G4']);
  });
});
