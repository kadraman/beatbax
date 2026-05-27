import { parseWithPeggy } from '../src/parser/peggy/index';

describe('parser scale awareness', () => {
  test('parses scale directive and channel lock', () => {
    const src = `
      scale Bb major
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = A#4 C5 D5
      channel 1 => inst lead seq melody lock=scale
    `;
    const result = parseWithPeggy(src);
    expect(result.hasErrors).toBe(false);
    expect((result.ast as any).scale).toEqual({ root: 'A#', mode: 'major', enforcement: 'warn' });
    expect((result.ast.channels[0] as any).lock).toBe('scale');
  });

  test('reports lock without scale declaration', () => {
    const src = `
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4 D4
      channel 1 => inst lead seq melody lock=scale
    `;
    const result = parseWithPeggy(src);
    const messages = (result.ast.diagnostics ?? []).map((d) => d.message);
    expect(messages.some((m) => m.includes('lock requires a scale declaration'))).toBe(true);
  });

  test('emits warning in warn mode for out-of-scale notes', () => {
    const src = `
      scale C major warn
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4 F#4 G4
      channel 1 => inst lead seq melody lock=scale
    `;
    const diags = parseWithPeggy(src).ast.diagnostics ?? [];
    expect(diags.some((d) => d.component === 'scale-lock' && d.level === 'warning')).toBe(true);
  });

  test('emits error in error mode for out-of-scale notes', () => {
    const src = `
      scale C major error
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4 F#4 G4
      channel 1 => inst lead seq melody lock=scale
    `;
    const diags = parseWithPeggy(src).ast.diagnostics ?? [];
    expect(diags.some((d) => d.component === 'scale-lock' && d.level === 'error')).toBe(true);
  });

  test('suppresses scale diagnostics in off mode', () => {
    const src = `
      scale C major off
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4 F#4 G4
      channel 1 => inst lead seq melody lock=scale
    `;
    const diags = parseWithPeggy(src).ast.diagnostics ?? [];
    expect(diags.some((d) => d.component === 'scale-lock' && d.message.includes('outside'))).toBe(false);
  });

  test('applies root+fifth lock', () => {
    const src = `
      scale C major warn
      inst bass type=pulse2 duty=25 env=10,down
      pat bassline = C3 E3 G3
      channel 1 => inst bass seq bassline lock=root+fifth
    `;
    const diags = parseWithPeggy(src).ast.diagnostics ?? [];
    expect(diags.some((d) => d.component === 'scale-lock' && d.message.includes('root+fifth'))).toBe(true);
  });
});
