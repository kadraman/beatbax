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
    expect(messages.some(m => m.includes("only supported for 'chip sms', 'chip nes', and AY-family chips"))).toBe(true);
  });

  test('ay chip region qualifier is parsed', () => {
    const src = `chip ay msx`;
    const result = parseWithPeggy(src);
    expect(result.ast.chip).toBe('ay');
    expect((result.ast as any).chipRegion).toBe('msx');
  });

  test('invalid ay region emits parser diagnostic', () => {
    const src = `chip ay ntsc`;
    const result = parseWithPeggy(src);
    const messages = (result.ast.diagnostics || []).map(d => d.message);
    expect(messages.some(m => m.includes("Invalid AY region 'ntsc'"))).toBe(true);
  });
});
