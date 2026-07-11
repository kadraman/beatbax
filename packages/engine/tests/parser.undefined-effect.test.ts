import { parse } from '../src/parser';

describe('parser: undefined inline effect detection', () => {
  const base = `
    chip gameboy
    bpm 120
    inst lead type=pulse1 duty=50 env=gb:12,down,1
  `;

  test('warns when a note references an undefined named effect', () => {
    const src = `${base}
      pat melody = C5<leadVib> D5 E5
      channel 1 => inst lead pat melody
    `;
    const ast = parse(src);
    const warnings = (ast.diagnostics ?? []).filter(d => d.level === 'warning');
    expect(warnings.some(w => w.message.includes("effect 'leadVib' is not defined"))).toBe(true);
  });

  test('no warning when the named effect is defined as a preset', () => {
    const src = `${base}
      effect leadVib = vib:3,5
      pat melody = C5<leadVib> D5 E5
      channel 1 => inst lead pat melody
    `;
    const ast = parse(src);
    const warnings = (ast.diagnostics ?? []).filter(d => d.level === 'warning');
    expect(warnings.some(w => w.message.includes("effect 'leadVib'"))).toBe(false);
  });

  test('no warning for a built-in parametric inline effect', () => {
    const src = `${base}
      pat melody = C5<vib:3,5> D5 E5
      channel 1 => inst lead pat melody
    `;
    const ast = parse(src);
    const warnings = (ast.diagnostics ?? []).filter(d => d.level === 'warning');
    expect(warnings.some(w => w.message.includes('is not defined'))).toBe(false);
  });

  test('no warning for a bare built-in effect name', () => {
    const src = `${base}
      pat melody = C5<vib> D5 E5
      channel 1 => inst lead pat melody
    `;
    const ast = parse(src);
    const warnings = (ast.diagnostics ?? []).filter(d => d.level === 'warning');
    expect(warnings.some(w => w.message.includes('is not defined'))).toBe(false);
  });
});
