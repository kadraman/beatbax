import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';

describe('parser: channel with multiple patterns after pat keyword', () => {
  test('stores pattern spec string when single pattern', () => {
    const src = `
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat melody = C4 E4 G4 C5
      channel 1 => inst lead pat melody
    `;
    const ast = parse(src);
    expect(ast.channels).toHaveLength(1);
    // Single pattern with no modifiers gets expanded immediately
    expect((ast.channels[0] as any).seqSpecTokens).toEqual(['melody']);
  });

  test('stores multiple pattern names in seqSpecTokens', () => {
    const src = `
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat intro = C4 E4
      pat verse = G4 C5
      pat chorus = E5 G5
      channel 1 => inst lead pat intro verse chorus
    `;
    const ast = parse(src);
    expect(ast.channels).toHaveLength(1);
    // Multiple patterns are stored as seqSpecTokens array
    expect((ast.channels[0] as any).seqSpecTokens).toEqual(['intro', 'verse', 'chorus']);
  });

  test('resolves multiple patterns into sequence', () => {
    const src = `
      chip gameboy
      bpm 120
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat intro = C4 E4
      pat verse = G4 C5
      channel 1 => inst lead pat intro verse
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    
    expect(song.channels).toHaveLength(1);
    const ch = song.channels[0];
    
    // Should create events from both patterns in sequence
    const noteEvents = ch.events.filter(e => e.type === 'note');
    expect(noteEvents.length).toBeGreaterThanOrEqual(4); // 2 notes from intro + 2 from verse
  });

  test('handles multiple patterns with modifiers', () => {
    const src = `
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat a = C4 E4
      pat b = G4 C5
      channel 1 => inst lead pat a:oct(1) b:rev
    `;
    const ast = parse(src);
    expect(ast.channels).toHaveLength(1);
    expect((ast.channels[0] as any).seqSpecTokens).toEqual(['a:oct(1)', 'b:rev']);
  });

  test('multiple patterns work with seq keyword too', () => {
    const src = `
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat p1 = C4 E4
      pat p2 = G4 C5
      pat p3 = E5 G5
      channel 1 => inst lead seq p1 p2 p3
    `;
    const ast = parse(src);
    expect(ast.channels).toHaveLength(1);
    expect((ast.channels[0] as any).seqSpecTokens).toEqual(['p1', 'p2', 'p3']);
  });

  test('multiple patterns with repetition syntax', () => {
    const src = `
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat intro = C4 E4
      pat verse = G4 C5
      channel 1 => inst lead pat intro verse*2
    `;
    const ast = parse(src);
    expect(ast.channels).toHaveLength(1);
    expect((ast.channels[0] as any).seqSpecTokens).toEqual(['intro', 'verse*2']);
  });

  test('multiple patterns with grouping and repetition', () => {
    const src = `
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat a = C4 E4
      pat b = G4 C5
      channel 1 => inst lead pat (a b)*2
    `;
    const ast = parse(src);
    expect(ast.channels).toHaveLength(1);
    expect((ast.channels[0] as any).seqSpecTokens).toEqual(['(a', 'b)*2']);
  });

  test('retrigger demo pattern list from demo file', () => {
    const src = `
      chip gameboy
      bpm 140
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat basic = C5:16
      pat fadeout = C5:16
      pat slow = C5:16
      pat subtle = C5:16
      channel 1 => inst lead pat basic fadeout slow subtle
    `;
    const ast = parse(src);
    expect(ast.channels).toHaveLength(1);
    expect((ast.channels[0] as any).seqSpecTokens).toEqual(['basic', 'fadeout', 'slow', 'subtle']);
  });

  test('does not break existing single pattern behavior', () => {
    const src = `
      inst sn type=noise env=gb:10,down,1
      pat drums = C5 . C5 C5
      channel 4 => inst sn pat drums
    `;
    const ast = parse(src);
    expect(ast.channels).toHaveLength(1);
    expect((ast.channels[0] as any).seqSpecTokens).toEqual(['drums']);
  });

  test('handles edge case with pattern name containing special chars', () => {
    const src = `
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat intro_v1 = C4 E4
      pat verse_2 = G4 C5
      channel 1 => inst lead pat intro_v1 verse_2
    `;
    const ast = parse(src);
    expect(ast.channels).toHaveLength(1);
    expect((ast.channels[0] as any).seqSpecTokens).toEqual(['intro_v1', 'verse_2']);
  });

  test('multiple channels with different pattern counts', () => {
    const src = `
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      inst bass type=pulse2 duty=25 env=gb:10,down,1
      pat a = C4 E4
      pat b = G4 C5
      pat c = E5 G5
      channel 1 => inst lead pat a b c
      channel 2 => inst bass pat a
    `;
    const ast = parse(src);
    expect(ast.channels).toHaveLength(2);
    expect((ast.channels[0] as any).seqSpecTokens).toEqual(['a', 'b', 'c']);
    expect((ast.channels[1] as any).seqSpecTokens).toEqual(['a']);
  });
});
