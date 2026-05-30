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

  test('validates post-transform pitches after transpose', () => {
    const src = `
      scale D dorian warn
      inst lead type=pulse1 duty=50 env=12,down
      pat melody_a = D5 E5 F5 A5 C#5 A5 G5 F5
      seq melody_seq = melody_a:transpose(+1)
      channel 1 => inst lead seq melody_seq lock=scale
    `;
    const diags = parseWithPeggy(src).ast.diagnostics ?? [];
    const outside = diags.filter((d) => d.component === 'scale-lock' && d.message.includes('outside'));
    expect(outside.some((d) => d.message.includes('C#5'))).toBe(false);
    expect(outside.some((d) => d.message.includes("pat 'melody_a'"))).toBe(true);
    expect(outside.some((d) => d.message.includes('via seq melody_seq'))).toBe(true);
    expect(outside.some((d) => d.message.includes('transpose(+1)'))).toBe(true);
    expect(outside.some((d) => d.message.includes('D5') && d.message.includes('becomes D#5'))).toBe(true);
    expect(outside.some((d) => d.loc?.start.line === 4)).toBe(true);
  });

  test('points diagnostic at source pattern note location', () => {
    const src = `
      scale C major warn
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4 F#4 G4
      channel 1 => inst lead seq melody lock=scale
    `;
    const diags = parseWithPeggy(src).ast.diagnostics ?? [];
    const fSharp = diags.find((d) => d.component === 'scale-lock' && d.message.includes('F#4'));
    expect(fSharp).toBeDefined();
    expect(fSharp?.message).toContain("pat 'melody'");
    expect(fSharp?.loc?.start.line).toBe(4);
  });

  test('clears violation when transpose moves note into scale', () => {
    const src = `
      scale C major warn
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = F#4
      seq main = melody:transpose(-1)
      channel 1 => inst lead seq main lock=scale
    `;
    const diags = parseWithPeggy(src).ast.diagnostics ?? [];
    expect(diags.some((d) => d.component === 'scale-lock' && d.message.includes('outside'))).toBe(false);
  });

  test('validates post-transform pitches after oct shift', () => {
    const src = `
      scale C major warn
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4
      seq main = melody:oct(+1)
      channel 1 => inst lead seq main lock=scale
    `;
    const diags = parseWithPeggy(src).ast.diagnostics ?? [];
    expect(diags.some((d) => d.component === 'scale-lock' && d.message.includes('C5'))).toBe(false);
  });

  test('validates channel pattern spec with inline transpose modifier', () => {
    const src = `
      scale C major warn
      inst lead type=pulse1 duty=50 env=12,down
      pat melody = C4
      channel 1 => inst lead seq melody:transpose(+1) lock=scale
    `;
    const diags = parseWithPeggy(src).ast.diagnostics ?? [];
    expect(diags.some((d) => d.component === 'scale-lock' && d.message.includes('C#4'))).toBe(true);
  });

  test('deduplicates repeated pattern playback on one channel', () => {
    const src = `
      scale D major warn
      inst bass type=pulse2 duty=25 env=10,down
      pat bassline = D3 . A2 . D3 . E3 .
      seq bass_seq = bassline * 4
      channel 2 => inst bass seq bass_seq lock=root+fifth
    `;
    const diags = parseWithPeggy(src).ast.diagnostics ?? [];
    const e3 = diags.filter((d) => d.component === 'scale-lock' && d.message.includes('E3'));
    expect(e3).toHaveLength(1);
    expect(e3[0]?.message).toContain('occurs 4 times in channel 2 playback');
    expect(e3[0]?.message).toContain("pat 'bassline'");
  });
});
