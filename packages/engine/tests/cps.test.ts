/**
 * Tests for CPS (cycles per second) tempo system.
 * Verifies TidalCycles-style tempo handling and backward compatibility with BPM.
 */

import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';

describe('CPS (Cycles Per Second) Tempo System', () => {
  test('should parse cps directive', () => {
    const src = `
      cps 0.5
      inst kick type=noise env=gb:12,down,1
      pat A = C4 C4 C4 C4
      channel 1 => inst kick pat A
    `;
    const ast = parse(src);
    expect(ast.cps).toBe(0.5);
  });

  test('should parse cps with equals sign', () => {
    const src = `
      cps=0.667
      inst kick type=noise env=gb:12,down,1
      pat A = C4 C4 C4 C4
      channel 1 => inst kick pat A
    `;
    const ast = parse(src);
    expect(ast.cps).toBe(0.667);
  });

  test('should parse stepsPerCycle directive', () => {
    const src = `
      cps 0.5
      stepsPerCycle 16
      inst kick type=noise env=gb:12,down,1
      pat A = C4 C4 C4 C4
      channel 1 => inst kick pat A
    `;
    const ast = parse(src);
    expect(ast.stepsPerCycle).toBe(16);
  });

  test('should convert bpm to cps when only bpm is provided', () => {
    const src = `
      bpm 120
      inst kick type=noise env=gb:12,down,1
      pat A = C4 C4 C4 C4
      channel 1 => inst kick pat A
    `;
    const ast = parse(src);
    expect(ast.bpm).toBe(120);
    // BPM 120 = 120/60/4 = 0.5 cps
    expect(ast.cps).toBe(0.5);
  });

  test('should prefer cps over bpm if both are provided', () => {
    const src = `
      bpm 120
      cps 0.75
      inst kick type=noise env=gb:12,down,1
      pat A = C4 C4 C4 C4
      channel 1 => inst kick pat A
    `;
    const ast = parse(src);
    expect(ast.bpm).toBe(120);
    expect(ast.cps).toBe(0.75);
  });

  test('should preserve cps in song model AST reference', () => {
    const src = `
      cps 0.583
      stepsPerCycle 8
      inst kick type=noise env=gb:12,down,1
      pat A = C4 C4 C4 C4
      channel 1 => inst kick pat A
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    
    expect(song.ast).toBeDefined();
    expect(song.ast.cps).toBe(0.583);
    expect(song.ast.stepsPerCycle).toBe(8);
  });

  test('should handle decimal cps values', () => {
    const src = `
      cps 0.666666
      inst kick type=noise env=gb:12,down,1
      pat A = C4 C4 C4 C4
      channel 1 => inst kick pat A
    `;
    const ast = parse(src);
    expect(ast.cps).toBeCloseTo(0.666666);
  });

  test('BPM to CPS conversion reference values', () => {
    // Test known conversions
    const conversions = [
      { bpm: 120, expectedCps: 0.5 },
      { bpm: 140, expectedCps: 140 / 60 / 4 },
      { bpm: 160, expectedCps: 160 / 60 / 4 },
      { bpm: 240, expectedCps: 1.0 },
    ];

    for (const { bpm, expectedCps } of conversions) {
      const src = `
        bpm ${bpm}
        inst kick type=noise env=gb:12,down,1
        pat A = C4 C4 C4 C4
        channel 1 => inst kick pat A
      `;
      const ast = parse(src);
      expect(ast.cps).toBeCloseTo(expectedCps);
    }
  });

  test('should default to undefined when no tempo is specified', () => {
    const src = `
      inst kick type=noise env=gb:12,down,1
      pat A = C4 C4 C4 C4
      channel 1 => inst kick pat A
    `;
    const ast = parse(src);
    expect(ast.cps).toBeUndefined();
    expect(ast.bpm).toBeUndefined();
  });

  test('should reject zero or negative cps values', () => {
    const srcs = [
      'cps 0\ninst kick type=noise env=gb:12,down,1\npat A = C4\nchannel 1 => inst kick pat A',
      'cps -1\ninst kick type=noise env=gb:12,down,1\npat A = C4\nchannel 1 => inst kick pat A',
    ];

    for (const src of srcs) {
      const ast = parse(src);
      // Parser should reject invalid values
      expect(ast.cps).toBeUndefined();
    }
  });
});
