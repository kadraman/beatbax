/**
 * Tests for volume directive parsing and application
 */

import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';

describe('Volume directive', () => {
  it('should parse volume directive', () => {
    const source = `
      chip gameboy
      bpm 120
      volume 0.5
      
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4 D4 E4 F4
      seq main = melody
      channel 1 => inst lead seq main
    `;
    
    const ast = parse(source);
    expect(ast.volume).toBe(0.5);
  });

  it('should default to undefined when volume not specified', () => {
    const source = `
      chip gameboy
      bpm 120
      
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4 D4 E4 F4
      seq main = melody
      channel 1 => inst lead seq main
    `;
    
    const ast = parse(source);
    expect(ast.volume).toBeUndefined();
  });

  it('should clamp volume to 0-1 range', () => {
    const source1 = `
      chip gameboy
      volume 1.5
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4
      seq main = melody
      channel 1 => inst lead seq main
    `;
    
    const ast1 = parse(source1);
    expect(ast1.volume).toBe(1);

    const source2 = `
      chip gameboy
      volume 0.0
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4
      seq main = melody
      channel 1 => inst lead seq main
    `;
    
    const ast2 = parse(source2);
    expect(ast2.volume).toBe(0);
  });

  it('should pass volume through resolver to SongModel', () => {
    const source = `
      chip gameboy
      bpm 120
      volume 0.3
      
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4 D4 E4 F4
      seq main = melody
      channel 1 => inst lead seq main
    `;
    
    const ast = parse(source);
    const song = resolveSong(ast);
    expect(song.volume).toBe(0.3);
  });

  it('should handle float volumes correctly', () => {
    const source = `
      chip gameboy
      volume 0.25
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4
      seq main = melody
      channel 1 => inst lead seq main
    `;
    
    const ast = parse(source);
    expect(ast.volume).toBe(0.25);
  });
});
