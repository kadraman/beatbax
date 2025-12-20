import { parse } from '../src/parser';
import { expandPattern } from '../src/patterns/expand';
import { jest } from '@jest/globals';

describe('Parser Space Tolerance', () => {
  test('expandPattern handles spaces around * for groups', () => {
    expect(expandPattern('(C4 E4 G4)*2')).toEqual(['C4', 'E4', 'G4', 'C4', 'E4', 'G4']);
    expect(expandPattern('(C4 E4 G4) * 2')).toEqual(['C4', 'E4', 'G4', 'C4', 'E4', 'G4']);
    expect(expandPattern('(C4 E4 G4)* 2')).toEqual(['C4', 'E4', 'G4', 'C4', 'E4', 'G4']);
    expect(expandPattern('(C4 E4 G4) *2')).toEqual(['C4', 'E4', 'G4', 'C4', 'E4', 'G4']);
  });

  test('expandPattern handles spaces around * for tokens', () => {
    expect(expandPattern('C4*2')).toEqual(['C4', 'C4']);
    expect(expandPattern('C4 * 2')).toEqual(['C4', 'C4']);
    expect(expandPattern('C4* 2')).toEqual(['C4', 'C4']);
    expect(expandPattern('C4 *2')).toEqual(['C4', 'C4']);
  });

  test('parse handles spaces around * in pat definitions', () => {
    const src = `
      pat A = (C4 E4 G4) * 2
      pat B = C3 * 4
    `;
    const ast = parse(src);
    expect(ast.pats.A).toEqual(['C4', 'E4', 'G4', 'C4', 'E4', 'G4']);
    expect(ast.pats.B).toEqual(['C3', 'C3', 'C3', 'C3']);
  });
});

describe('Pattern Name Validation', () => {
  let warnSpy: any;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('warns for single-letter pattern names A-G', () => {
    parse('pat A = C4');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Pattern name 'A' may be confused with a note name"));
    
    warnSpy.mockClear();
    parse('pat e = C4');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Pattern name 'e' may be confused with a note name"));
  });

  test('warns for note-like pattern names with octaves', () => {
    parse('pat C4 = C4');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Pattern name 'C4' may be confused with a note name"));

    warnSpy.mockClear();
    parse('pat Bb1 = C4');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Pattern name 'Bb1' may be confused with a note name"));

    warnSpy.mockClear();
    parse('pat G9 = C4');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Pattern name 'G9' may be confused with a note name"));
  });

  test('does not warn for other single-letter pattern names', () => {
    parse('pat X = C4');
    expect(warnSpy).not.toHaveBeenCalled();
    
    parse('pat Z = C4');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('does not warn for multi-letter pattern names', () => {
    parse('pat AA = C4');
    expect(warnSpy).not.toHaveBeenCalled();
    
    parse('pat Lead = C4');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
