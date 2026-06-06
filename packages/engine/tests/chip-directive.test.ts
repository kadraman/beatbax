import { parse } from '../src/parser';
import { parseWithPeggy } from '../src/parser/peggy';

describe('chip directive', () => {
  test('chip directive is parsed without error', () => {
    const src = `chip gameboy`;
    const ast = parse(src);
    expect(ast.chip).toBeDefined();
  });

  test('sms chip region qualifier is parsed', () => {
    const src = `chip sms pal`;
    const result = parseWithPeggy(src);
    expect(result.ast.chip).toBe('sms');
    expect((result.ast as any).chipRegion).toBe('pal');
  });

  test('invalid sms region emits parser diagnostic', () => {
    const src = `chip sms ntcs`;
    const result = parseWithPeggy(src);
    const messages = (result.ast.diagnostics || []).map(d => d.message);
    expect(messages.some(m => m.includes("Invalid SMS region 'ntcs'"))).toBe(true);
    expect(messages.some(m => m.includes("Did you mean 'ntsc'?"))).toBe(true);
  });

  test('famicom is accepted as an alias for nes', () => {
    const src = `chip famicom`;
    const result = parseWithPeggy(src);
    expect(result.ast.chip).toBe('famicom');
    expect(result.ast.diagnostics?.filter(d => d.level === 'error') ?? []).toHaveLength(0);
  });

  test('famicom chip region qualifier is parsed', () => {
    const src = `chip famicom pal`;
    const result = parseWithPeggy(src);
    expect(result.ast.chip).toBe('famicom');
    expect((result.ast as any).chipRegion).toBe('pal');
  });

  test('nes chip region qualifier is parsed', () => {
    const src = `chip nes pal`;
    const result = parseWithPeggy(src);
    expect(result.ast.chip).toBe('nes');
    expect((result.ast as any).chipRegion).toBe('pal');
  });

  test('nes chip region ntsc is parsed', () => {
    const src = `chip nes ntsc`;
    const result = parseWithPeggy(src);
    expect(result.ast.chip).toBe('nes');
    expect((result.ast as any).chipRegion).toBe('ntsc');
  });

  test('invalid nes region emits parser diagnostic', () => {
    const src = `chip nes ntcs`;
    const result = parseWithPeggy(src);
    const messages = (result.ast.diagnostics || []).map(d => d.message);
    expect(messages.some(m => m.includes("Invalid NES region 'ntcs'"))).toBe(true);
    expect(messages.some(m => m.includes("Did you mean 'ntsc'?"))).toBe(true);
  });

  test('chip region qualifier is rejected for non-region chips', () => {
    const src = `chip gameboy pal`;
    const result = parseWithPeggy(src);
    const messages = (result.ast.diagnostics || []).map(d => d.message);
    expect(messages.some(m => m.includes("only supported for 'chip sms', 'chip nes', and 'chip famicom'"))).toBe(true);
  });

  test('unknown chip does not cascade into Game Boy instrument validation', () => {
    const src = [
      'chip nesx',
      'inst bass type=triangle linear=true',
      'inst hihat type=noise noise_mode=periodic noise_period=8 env_period=1',
    ].join('\n');
    const result = parseWithPeggy(src);
    const messages = (result.ast.diagnostics || []).map(d => d.message);
    expect(messages.some(m => m.includes("Unknown chip 'nesx'"))).toBe(true);
    expect(messages.some(m => m.includes('unknown type'))).toBe(false);
    expect(messages.some(m => m.includes('unknown property'))).toBe(false);
  });
});
