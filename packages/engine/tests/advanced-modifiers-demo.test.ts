import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';
import { expandRefToTokens } from '../src/expand/refExpander.js';
import { expandAllSequences } from '../src/sequences/expand.js';

const demoPath = join(__dirname, '../../../songs/features/advanced_modifiers_demo.bax');

describe('advanced_modifiers_demo.bax', () => {
  const src = readFileSync(demoPath, 'utf8');
  const ast = parse(src);

  test('resolveSong applies all tier-1 modifiers on channel 1', () => {
    const song = resolveSong(ast);
    const ch1 = song.channels.find(c => c.id === 1)!;
    const notes = ch1.events.filter(e => e.type === 'note').map(e => (e as any).token);

    // demo_rot = lead_core:rot(1)  => D4 E4 G4 C4
    expect(notes.slice(0, 4)).toEqual(['D4', 'E4', 'G4', 'C4']);
    // demo_rotate = lead_core:rotate(2) => E4 G4 C4 D4
    expect(notes.slice(4, 8)).toEqual(['E4', 'G4', 'C4', 'D4']);
    // demo_pal => C4 D4 E4 G4 E4 D4 C4
    expect(notes.slice(8, 15)).toEqual(['C4', 'D4', 'E4', 'G4', 'E4', 'D4', 'C4']);
    // demo_transpose => +2 semitones on lead_core
    expect(notes.slice(-4)).toEqual(['D4', 'E4', 'F#4', 'A4']);

    const muteRestCount = ch1.events.filter(e => e.type === 'rest').length;
    expect(muteRestCount).toBeGreaterThanOrEqual(8);
  });

  test('expandRefToTokens parses clamp/arp modifiers with commas in parens', () => {
    const pats = ast.pats;
    const expanded = expandAllSequences(ast.seqs, pats, ast.insts);

    const clamped = expandRefToTokens('out_of_range:clamp(C3,C6)', expanded, pats);
    expect(clamped).toEqual(['C3', 'C4', 'C6', 'C6']);

    const arp = expandRefToTokens('arp_source:arp(4,7)', expanded, pats);
    expect(arp[0]).toMatch(/^C4<arp:4,7>$/);
  });
});
