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

  function expanded() {
    return expandAllSequences(ast.seqs, ast.pats, ast.insts);
  }

  test('reference demo_* sequences expand as documented', () => {
    const ex = expanded();

    expect(ex.demo_rot).toEqual(['D4', 'E4', 'G4', 'C4']);
    expect(ex.demo_rotate).toEqual(['E4', 'G4', 'C4', 'D4']);
    expect(ex.demo_pal).toEqual(['C4', 'D4', 'E4', 'G4', 'E4', 'D4', 'C4']);
    expect(ex.demo_palindrome).toEqual(ex.demo_pal);
    expect(ex.demo_transpose).toEqual(['D4', 'E4', 'F#4', 'A4']);
    expect(ex.demo_clamp).toEqual(['C3', 'C4', 'C6', 'C6']);
    expect(ex.demo_invert).toEqual(['C4', 'A#3', 'G#3', 'F3']);
    expect(ex.demo_lag).toEqual(['.', 'D4', 'E4', 'G4', 'C4']);
    expect(ex.demo_chunk_rot).toEqual(['E4', 'D4', 'C4', 'G4']);
    expect(ex.demo_pick).toEqual(['C4', 'E4']);
    expect(ex.demo_off).toEqual(['.', '.', 'C4', 'D4', 'E4', 'G4']);
  });

  test('arrangement sequences use modifiers musically', () => {
    const ex = expanded();

    expect(ex.intro).toEqual(['.', 'C4', 'D4', 'E4', 'G4']);
    expect(ex.verse_b).toEqual(['D4', 'E4', 'G4', 'C4']);
    expect(ex.chorus_pal).toEqual(ex.demo_pal);
    expect(ex.bridge_invert).toEqual(ex.demo_invert);
    expect(ex.fill_pick).toEqual(['D4', 'G4']);
    expect(ex.outro).toEqual(['G4', 'E4', 'D4', 'C4']);
  });

  test('resolveSong plays full arrangement on four channels', () => {
    const song = resolveSong(ast);
    expect(song.channels.filter(c => c.id >= 1 && c.id <= 4)).toHaveLength(4);

    const lead = song.channels.find(c => c.id === 1)!;
    expect(lead.events.length).toBeGreaterThan(40);

    const notes = lead.events.filter(e => e.type === 'note').map(e => (e as { token: string }).token);
    expect(notes[0]).toBe('C4');
    expect(notes.slice(0, 8)).toEqual(['C4', 'D4', 'E4', 'G4', 'C4', 'D4', 'E4', 'G4']);
  });

  test('expandRefToTokens parses clamp/arp modifiers with commas in parens', () => {
    const pats = ast.pats;
    const ex = expanded();

    const clamped = expandRefToTokens('out_of_range:clamp(C3,C6)', ex, pats);
    expect(clamped).toEqual(['C3', 'C4', 'C6', 'C6']);

    const arp = expandRefToTokens('arp_source:arp(4,7)', ex, pats);
    expect(arp[0]).toMatch(/^C4<arp:4,7>$/);
  });

  test('expandRefToTokens handles tier-2 modifiers in seq references', () => {
    const pats = ast.pats;
    const ex = expanded();

    expect(expandRefToTokens('lead_core:every(2,oct(+1))', ex, pats)).toEqual(['C4', 'D5', 'E4', 'G5']);
    expect(expandRefToTokens('lead_core:off(2)', ex, pats)).toEqual(['.', '.', 'C4', 'D4', 'E4', 'G4']);
    expect(expandRefToTokens('lead_core:pick(1,3)', ex, pats)).toEqual(['C4', 'E4']);
    expect(expandRefToTokens('lead_core:invert', ex, pats)).toEqual(['C4', 'A#3', 'G#3', 'F3']);
  });
});
