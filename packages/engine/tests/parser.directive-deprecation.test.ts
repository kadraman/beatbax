import { parse } from '../src/parser';

describe('parser: deprecated timing directives', () => {
  const minimalSong = (directives: string) => `
    chip gameboy
    bpm 120
    ${directives}
    inst lead type=pulse1 duty=50 env=12,down
    pat melody = C4 E4 G4
    channel 1 => inst lead seq melody
    play
  `;

  test('ticksPerStep emits a warning and is ignored', () => {
    const ast = parse(minimalSong('ticksPerStep 8'));
    const warnings = (ast.diagnostics ?? []).filter(d => d.level === 'warning');
    expect(warnings.some(w => w.message.includes('ticksPerStep'))).toBe(true);
    expect(warnings.some(w => w.message.includes('no effect'))).toBe(true);
  });

  test('time emits a warning and sets stepsPerBar when stepsPerBar is absent', () => {
    const ast = parse(minimalSong('time 3'));
    const warnings = (ast.diagnostics ?? []).filter(d => d.level === 'warning');
    expect(warnings.some(w => w.message.includes('time') && w.message.includes('stepsPerBar'))).toBe(true);
    expect(ast.stepsPerBar).toBe(3);
    expect(ast.time).toBe(3);
  });

  test('stepsPerBar has no deprecation warning', () => {
    const ast = parse(minimalSong('stepsPerBar 4'));
    const warnings = (ast.diagnostics ?? []).filter(
      d => d.level === 'warning' && (d.message.includes('time') || d.message.includes('ticksPerStep')),
    );
    expect(warnings).toHaveLength(0);
    expect(ast.stepsPerBar).toBe(4);
  });

  test('stepsPerBar takes precedence over a later time directive', () => {
    const ast = parse(`
      chip gameboy
      bpm 120
      stepsPerBar 4
      time 3
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4 E4 G4
      channel 1 => inst lead seq melody
      play
    `);
    expect(ast.stepsPerBar).toBe(4);
    expect(ast.time).toBe(3);
    const warnings = (ast.diagnostics ?? []).filter(d => d.level === 'warning');
    expect(warnings.some(w => w.message.includes('time'))).toBe(true);
  });
});
