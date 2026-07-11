import { parseWithPeggy } from '../src/parser/peggy';

describe('parser: pipe bar separator rejection', () => {
  const base = `
    chip gameboy
    bpm 120
    inst leadB type=pulse2 duty=30
  `;

  test('rejects | as a pattern token separator with a helpful message', () => {
    const src = `${base}
      pat bass_var = (C2 E2 G2 C3) * 2 | (F2 A2 C3 F3) * 2
      channel 2 => inst leadB pat bass_var
    `;
    const result = parseWithPeggy(src);
    expect(result.hasErrors).toBe(true);
    expect(result.errors[0]?.message).toMatch(/Bar separator '\|'/);
    expect(result.errors[0]?.message).toMatch(/whitespace-separated/);
  });
});
