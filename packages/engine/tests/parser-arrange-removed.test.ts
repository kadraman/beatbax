import { parse, parseWithPeggy } from '../src/parser';

const VALID_KEYWORD_SNIPPET = 'channel, play, export';

describe('parser: removed arrange directive', () => {
  test('short-form arrange fails with unknown keyword and valid keywords list', () => {
    const source = [
      'chip gameboy',
      'arrange main = lead | bass | . | .',
      'pat lead = C4',
      'seq lead = lead',
      'channel 1 => inst lead seq lead',
    ].join('\n');

    expect(() => parse(source)).toThrow(/Unknown keyword 'arrange'/);
    expect(() => parse(source)).toThrow(new RegExp(VALID_KEYWORD_SNIPPET));

    const result = parseWithPeggy(source);
    expect(result.hasErrors).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/Unknown keyword 'arrange'/);
    expect(result.errors[0].message).toContain('channel');
    expect(result.errors[0].message).not.toContain('arrange,');
    expect(result.errors[0].loc?.start.line).toBe(2);
  });

  test('block-form arrange with defaults fails to parse', () => {
    const source = [
      'arrange main defaults(inst=lead) {',
      '  lead | bass | . | .',
      '}',
    ].join('\n');

    const result = parseWithPeggy(source);
    expect(result.hasErrors).toBe(true);
    expect(result.errors[0].message).toMatch(/Unknown keyword 'arrange'/);
    expect(result.errors[0].message).toMatch(/Valid keywords:/);
  });
});
