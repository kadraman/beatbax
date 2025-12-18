/**
 * Test that the parser handles spaces around '*' operators gracefully
 * and warns about problematic pattern names.
 */

import { expandPattern } from '../src/patterns/expand.js';
import { parse } from '../src/parser/index.js';

describe('Pattern expansion with spaces around *', () => {
  test('handles no spaces: (...)* 2', () => {
    const result = expandPattern('(C5 E5)*2');
    expect(result).toEqual(['C5', 'E5', 'C5', 'E5']);
  });

  test('handles space after *: (...) *2', () => {
    const result = expandPattern('(C5 E5) *2');
    expect(result).toEqual(['C5', 'E5', 'C5', 'E5']);
  });

  test('handles space before *: (...)* 2', () => {
    const result = expandPattern('(C5 E5)* 2');
    expect(result).toEqual(['C5', 'E5', 'C5', 'E5']);
  });

  test('handles spaces on both sides: (...) * 2', () => {
    const result = expandPattern('(C5 E5) * 2');
    expect(result).toEqual(['C5', 'E5', 'C5', 'E5']);
  });

  test('handles inline token repetition with spaces: C5 * 3', () => {
    const result = expandPattern('C5 * 3');
    expect(result).toEqual(['C5', 'C5', 'C5']);
  });

  test('handles complex nested patterns with spaces', () => {
    const result = expandPattern('(. C5 . C5) * 2 (G5 E5) * 2');
    expect(result).toEqual([
      '.', 'C5', '.', 'C5',
      '.', 'C5', '.', 'C5',
      'G5', 'E5',
      'G5', 'E5'
    ]);
  });

  test('original compact format still works', () => {
    const result = expandPattern('(C5 E5 G5 C6)*4');
    expect(result).toEqual([
      'C5', 'E5', 'G5', 'C6',
      'C5', 'E5', 'G5', 'C6',
      'C5', 'E5', 'G5', 'C6',
      'C5', 'E5', 'G5', 'C6'
    ]);
  });
});

describe('Pattern name validation', () => {
  test('warns about single-letter pattern names A-G', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    const src = `
      pat E = C5 E5 G5 C6
      pat A = C4 E4
      pat G = G4 B4
    `;
    
    parse(src);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Pattern name 'E'")
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Pattern name 'A'")
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Pattern name 'G'")
    );
    
    consoleSpy.mockRestore();
  });

  test('does not warn about multi-character pattern names', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    const src = `
      pat Fill = C5 E5 G5 C6
      pat Lead = C4 E4
      pat Bass = G2 B2
    `;
    
    parse(src);
    
    expect(consoleSpy).not.toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  test('does not warn about single-letter names outside A-G', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    const src = `
      pat X = C5 E5
      pat Y = C4 E4
      pat Z = G2 B2
    `;
    
    parse(src);
    
    expect(consoleSpy).not.toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
});

describe('Full integration: spaces + pattern references', () => {
  test('parses sample.bax-style patterns with spaces correctly', () => {
    const src = `
      pat A = C5 C5 G5 G5
      pat A_alt = (. C5 . C5) * 2
      pat Fill = (C5 E5 G5 C6) * 4
      
      seq lead = A A_alt Fill A
      
      channel 1 => seq lead
    `;
    
    const ast = parse(src);
    
    // Verify patterns expanded correctly
    expect(ast.pats.A).toHaveLength(4);
    expect(ast.pats.A_alt).toHaveLength(8); // (4 tokens) * 2
    expect(ast.pats.Fill).toHaveLength(16); // (4 tokens) * 4
    
    // Verify sequence references patterns
    expect(ast.seqs.lead).toEqual(['A', 'A_alt', 'Fill', 'A']);
  });
});
