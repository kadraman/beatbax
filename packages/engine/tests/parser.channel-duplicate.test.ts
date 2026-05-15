import { parse } from '../src/parser';

describe('parser: duplicate channel ID detection', () => {
  test('emits error diagnostic for duplicate channel ID', () => {
    const src = `
      chip gameboy
      bpm 120
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat melody = C4 E4 G4
      channel 1 => inst lead seq melody
      channel 1 => inst lead seq melody
    `;
    const ast = parse(src);
    const errors = (ast.diagnostics ?? []).filter(d => d.level === 'error');
    expect(errors.some(e => e.message.includes('Duplicate channel 1'))).toBe(true);
  });

  test('deduplicates channels array, keeping only first occurrence', () => {
    const src = `
      chip gameboy
      bpm 120
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat melody = C4 E4 G4
      channel 1 => inst lead seq melody
      channel 1 => inst lead seq melody
    `;
    const ast = parse(src);
    // Only one channel 1 should be in the array
    const ch1 = ast.channels.filter(c => c.id === 1);
    expect(ch1).toHaveLength(1);
  });

  test('emits one error per extra duplicate (three declarations = one error)', () => {
    const src = `
      chip gameboy
      bpm 120
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      pat melody = C4 E4 G4
      channel 1 => inst lead seq melody
      channel 1 => inst lead seq melody
      channel 1 => inst lead seq melody
    `;
    const ast = parse(src);
    const dupErrors = (ast.diagnostics ?? []).filter(
      d => d.level === 'error' && d.message.includes('Duplicate channel 1')
    );
    expect(dupErrors).toHaveLength(2);
    // Still only one channel 1 in the array
    expect(ast.channels.filter(c => c.id === 1)).toHaveLength(1);
  });

  test('does not emit error when all channel IDs are unique', () => {
    const src = `
      chip gameboy
      bpm 120
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      inst bass type=pulse2 duty=25 env=gb:10,down,1
      pat melody = C4 E4 G4
      channel 1 => inst lead seq melody
      channel 2 => inst bass seq melody
    `;
    const ast = parse(src);
    const dupErrors = (ast.diagnostics ?? []).filter(
      d => d.level === 'error' && d.message.includes('Duplicate channel')
    );
    expect(dupErrors).toHaveLength(0);
    expect(ast.channels).toHaveLength(2);
  });

  test('handles duplicate across different channel IDs independently', () => {
    const src = `
      chip gameboy
      bpm 120
      inst lead type=pulse1 duty=50 env=gb:12,down,1
      inst bass type=pulse2 duty=25 env=gb:10,down,1
      pat melody = C4 E4
      channel 1 => inst lead seq melody
      channel 2 => inst bass seq melody
      channel 1 => inst lead seq melody
      channel 2 => inst bass seq melody
    `;
    const ast = parse(src);
    const dupErrors = (ast.diagnostics ?? []).filter(
      d => d.level === 'error' && d.message.includes('Duplicate channel')
    );
    // One error for channel 1 duplicate, one for channel 2 duplicate
    expect(dupErrors).toHaveLength(2);
    expect(ast.channels).toHaveLength(2);
  });
});
