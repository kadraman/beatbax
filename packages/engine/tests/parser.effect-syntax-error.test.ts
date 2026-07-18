import { parseWithPeggy } from '../src/parser/peggy';

describe('parser: effect line syntax errors', () => {
  const base = `
    chip gameboy
    bpm 120
    inst lead type=pulse1 duty=50
    pat p = C5
    channel 1 => inst lead pat p
  `;

  test('does not misreport a syntax error on an effect line as an unknown keyword', () => {
    const src = `${base}
      effect leadVib vib:3,5
    `;
    const result = parseWithPeggy(src);
    expect(result.hasErrors).toBe(true);
    expect(result.errors[0]?.message).not.toMatch(/Unknown keyword 'effect'/);
    expect(result.errors[0]?.message).toMatch(/effect/);
  });

  test('unknown keyword message is generated from VALID_KEYWORDS', () => {
    const src = `${base}
      arrange main = lead
    `;
    const result = parseWithPeggy(src);
    expect(result.hasErrors).toBe(true);
    expect(result.errors[0]?.message).toMatch(/Unknown keyword 'arrange'/);
    expect(result.errors[0]?.message).toContain('effect');
    expect(result.errors[0]?.message).toContain('inst');
  });

  test('end-of-line unknown keyword fallback uses VALID_KEYWORDS list', () => {
    const src = `${base}
      not-a-keyword =
    `;
    const result = parseWithPeggy(src);
    expect(result.hasErrors).toBe(true);
    expect(result.errors[0]?.message).toMatch(/Unknown keyword 'not-a-keyword'/);
    expect(result.errors[0]?.message).toBe(
      "Unknown keyword 'not-a-keyword'. Valid keywords: chip, bpm, volume, time, stepsPerBar, ticksPerStep, scale, song, import, inst, effect, subpat, pat, seq, channel, play, export.",
    );
  });
});
