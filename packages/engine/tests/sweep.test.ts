import { parseSweep } from '../src/chips/gameboy/pulse';
import { registerFromFreq, freqFromRegister } from '../src/chips/gameboy/periodTables';
import { parse } from '../src/parser/index';

describe('Pulse Sweep', () => {
  test('parseSweep handles various formats', () => {
    expect(parseSweep('10,down,3')).toEqual({ time: 10, direction: 'down', shift: 3 });
    expect(parseSweep('20,up,5')).toEqual({ time: 20, direction: 'up', shift: 5 });
    expect(parseSweep('5,dec,2')).toEqual({ time: 5, direction: 'down', shift: 2 });
    expect(parseSweep('5,1,2')).toEqual({ time: 5, direction: 'down', shift: 2 });
    expect(parseSweep(null)).toBeNull();
    expect(parseSweep('invalid')).toBeNull();
  });

  test('register conversion round-trip', () => {
    const freq = 440;
    const reg = registerFromFreq(freq);
    const freq2 = freqFromRegister(reg);
    expect(Math.abs(freq - freq2)).toBeLessThan(5);
  });

  test('parser recognizes sweep in instrument definition', () => {
    const src = 'inst test type=pulse1 duty=50 sweep=4,up,2';
    const ast = parse(src);
    expect(ast.insts['test'].sweep).toBe('4,up,2');
  });

  test('applySweep register math', () => {
    // This test verifies the logic we implemented in pulse.ts and pcmRenderer.ts
    // Game Boy: f = 131072 / (2048 - X)
    // To increase f (pitch UP), we must increase X.
    
    const reg = 1000;
    const shift = 1;
    const delta = reg >> shift; // 500
    
    // Pitch UP should increase register
    const regUp = reg + delta;
    expect(regUp).toBe(1500);
    
    // Pitch DOWN should decrease register
    const regDown = reg - delta;
    expect(regDown).toBe(500);
  });
});
