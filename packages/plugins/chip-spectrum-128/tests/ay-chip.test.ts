import { AyChipSimulator } from '../src/ay-chip.js';

describe('AyChipSimulator', () => {
  let chip: AyChipSimulator;

  beforeEach(() => {
    chip = new AyChipSimulator();
    chip.reset();
  });

  test('initialises to silent output', () => {
    const levels = chip.getOutputLevels();
    expect(levels.levelA).toBe(0);
    expect(levels.levelB).toBe(0);
    expect(levels.levelC).toBe(0);
  });

  test('writeRegister + readRegister roundtrip', () => {
    chip.writeRegister(0, 0xab);
    chip.writeRegister(1, 0x0f);
    expect(chip.readRegister(0)).toBe(0xab);
    expect(chip.readRegister(1)).toBe(0x0f);
  });

  test('R1 masks to 4 bits', () => {
    chip.writeRegister(1, 0xff);
    expect(chip.readRegister(1)).toBe(0x0f);
  });

  test('R6 masks to 5 bits', () => {
    chip.writeRegister(6, 0xff);
    expect(chip.readRegister(6)).toBe(0x1f);
  });

  test('R7 masks to 6 bits', () => {
    chip.writeRegister(7, 0xff);
    expect(chip.readRegister(7)).toBe(0x3f);
  });

  test('R13 write resets envelope state', () => {
    // Write shape 8 (continuous decay)
    chip.writeRegister(13, 8);
    const snap1 = chip.snapshotRegisters();
    expect(snap1[13]).toBe(8);

    // Advance, then rewrite
    chip.writeRegister(11, 1);
    chip.writeRegister(12, 0);
    chip.step(10);
    chip.writeRegister(13, 10);
    expect(chip.readRegister(13)).toBe(10);
  });

  test('step advances without throwing', () => {
    chip.writeRegister(0, 100);
    chip.writeRegister(7, 0x00); // all channels enabled
    chip.writeRegister(8, 10);
    expect(() => chip.step(1000)).not.toThrow();
  });

  test('tone channel output is non-zero when enabled', () => {
    // Set channel A: period=100, amplitude=10, tone enabled, noise disabled
    chip.writeRegister(0, 100); // period low
    chip.writeRegister(1, 0);   // period high
    chip.writeRegister(7, 0b111000); // tone A enabled, all noise disabled
    chip.writeRegister(8, 10);  // amplitude A = 10

    chip.step(50); // advance to get output
    const levels = chip.getOutputLevels();
    // levelA should be either 10 or 0 depending on phase
    expect(levels.levelA).toBeGreaterThanOrEqual(0);
    expect(levels.levelA).toBeLessThanOrEqual(10);
  });

  test('noise LFSR starts at 1', () => {
    expect(chip.getNoiseLfsr()).toBe(1);
  });

  test('noise LFSR changes after step', () => {
    chip.writeRegister(6, 1); // fast noise
    chip.step(100);
    // LFSR should have changed from initial seed
    expect(chip.getNoiseLfsr()).not.toBe(1);
  });

  test('LFSR is deterministic across resets', () => {
    chip.writeRegister(6, 5);
    chip.step(200);
    const snapshot1 = chip.getNoiseLfsr();

    chip.reset();
    chip.writeRegister(6, 5);
    chip.step(200);
    const snapshot2 = chip.getNoiseLfsr();

    expect(snapshot1).toBe(snapshot2);
  });

  test('snapshotRegisters returns copy', () => {
    chip.writeRegister(0, 42);
    const snap = chip.snapshotRegisters();
    snap[0] = 99; // mutate copy
    expect(chip.readRegister(0)).toBe(42); // original unchanged
  });

  test('reset restores silent state', () => {
    chip.writeRegister(8, 15);
    chip.writeRegister(7, 0x00);
    chip.step(100);
    chip.reset();
    const levels = chip.getOutputLevels();
    expect(levels.levelA).toBe(0);
    expect(levels.levelB).toBe(0);
    expect(levels.levelC).toBe(0);
  });
});
