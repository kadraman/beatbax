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
    // demo_transpose => +2 semitones on lead_core (at absolute note index 33)
    // preceding note counts: rot(4)+rotate(4)+pal(7)+palindrome(7)+arp(3)+clamp(4)+fold(4) = 33
    expect(notes.slice(33, 37)).toEqual(['D4', 'E4', 'F#4', 'A4']);

    const muteRestCount = ch1.events.filter(e => e.type === 'rest').length;
    expect(muteRestCount).toBeGreaterThanOrEqual(8);
  });

  test('resolveSong applies tier-2 invert modifier correctly', () => {
    const song = resolveSong(ast);
    const ch1 = song.channels.find(c => c.id === 1)!;
    const notes = ch1.events.filter(e => e.type === 'note').map(e => (e as any).token);

    // demo_invert = lead_core:invert, pivot C4 (60)
    // D4(62)→A#3(58), E4(64)→G#3(56), G4(67)→F3(53)
    // note indices after demo_transpose (37): demo_invert at [37,41)
    expect(notes.slice(37, 41)).toEqual(['C4', 'A#3', 'G#3', 'F3']);
  });

  test('expandRefToTokens parses clamp/arp modifiers with commas in parens', () => {
    const pats = ast.pats;
    const expanded = expandAllSequences(ast.seqs, pats, ast.insts);

    const clamped = expandRefToTokens('out_of_range:clamp(C3,C6)', expanded, pats);
    expect(clamped).toEqual(['C3', 'C4', 'C6', 'C6']);

    const arp = expandRefToTokens('arp_source:arp(4,7)', expanded, pats);
    expect(arp[0]).toMatch(/^C4<arp:4,7>$/);
  });

  test('expandRefToTokens handles tier-2 modifiers in seq references', () => {
    const pats = ast.pats;
    const expanded = expandAllSequences(ast.seqs, pats, ast.insts);

    // every(2,oct(+1)) on lead_core
    const everyResult = expandRefToTokens('lead_core:every(2,oct(+1))', expanded, pats);
    expect(everyResult).toEqual(['C4', 'D5', 'E4', 'G5']);

    // off(2) prepends two rests
    const offResult = expandRefToTokens('lead_core:off(2)', expanded, pats);
    expect(offResult).toEqual(['.', '.', 'C4', 'D4', 'E4', 'G4']);

    // pick(1,3) keeps first and third tokens
    const pickResult = expandRefToTokens('lead_core:pick(1,3)', expanded, pats);
    expect(pickResult).toEqual(['C4', 'E4']);

    // invert around C4 pivot
    const invertResult = expandRefToTokens('lead_core:invert', expanded, pats);
    expect(invertResult).toEqual(['C4', 'A#3', 'G#3', 'F3']);
  });
});
