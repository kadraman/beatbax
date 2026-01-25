import { parseWithPeggy } from '../src/parser/peggy';
import { resolveSong } from '../src/song/resolver';
import type { NoteEvent } from '../src/song/songModel';

describe('Inline comments', () => {
  it('should ignore inline comments in channel assignments', () => {
    const code = `
      chip gameboy
      bpm 120
      
      inst test type=pulse1 duty=50 env=10,flat
      
      pat a = C4 E4
      pat b = G4 B4
      pat c = C5 E5
      
      seq seq1 = a
      seq seq2 = b
      seq seq3 = c
      
      # This channel should only play seq1, not seq2 and seq3
      channel 1 => inst test seq seq1 #seq2 seq3
    `;

    const ast = parseWithPeggy(code);
    const resolved = resolveSong(ast);

    // Channel 1 should only have 2 notes (from pattern 'a')
    const ch1 = resolved.channels.find((ch: any) => ch.id === 1);
    expect(ch1).toBeDefined();
    
    const noteEvents = ch1!.events.filter((e: any) => e.type === 'note') as NoteEvent[];
    expect(noteEvents).toHaveLength(2);
    expect(noteEvents[0].token).toBe('C4');
    expect(noteEvents[1].token).toBe('E4');
  });

  it('should handle inline comments with //', () => {
    const code = `
      chip gameboy
      bpm 120
      
      inst test type=pulse1 duty=50 env=10,flat
      
      pat a = C4 E4
      pat b = G4 B4
      
      seq seq1 = a
      seq seq2 = b
      
      channel 1 => inst test seq seq1 //seq2
    `;

    const ast = parseWithPeggy(code);
    const resolved = resolveSong(ast);

    const ch1 = resolved.channels.find((ch: any) => ch.id === 1);
    expect(ch1).toBeDefined();
    
    const noteEvents = ch1!.events.filter((e: any) => e.type === 'note') as NoteEvent[];
    expect(noteEvents).toHaveLength(2);
    expect(noteEvents[0].token).toBe('C4');
    expect(noteEvents[1].token).toBe('E4');
  });
});
