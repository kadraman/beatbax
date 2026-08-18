import {
  buildInstrumentHoverMarkdown,
  buildSubpatternHoverMarkdown,
  formatSubPatternRow,
  formatSubPatternSource,
} from '../src/editor/subpat-format';

describe('formatSubPatternRow', () => {
  test('renders empty ticks, fx, jump, and halt', () => {
    expect(formatSubPatternRow({ empty: true })).toBe('.');
    expect(formatSubPatternRow({ empty: false, offset: null, fx: { code: 1, param: 1 } })).toBe('fx:1,1');
    expect(formatSubPatternRow({ empty: false, offset: null, jump: 4 })).toBe('jump:4');
    expect(formatSubPatternRow({ empty: false, halt: true })).toBe('halt');
  });

  test('renders signed offsets with volume', () => {
    expect(formatSubPatternRow({ empty: false, offset: 0, vol: 10 })).toBe('+0 vol:10');
    expect(formatSubPatternRow({ empty: false, offset: -2, vol: 8 })).toBe('-2 vol:8');
  });
});

describe('formatSubPatternSource', () => {
  test('emits a named multiline table', () => {
    const src = formatSubPatternSource('melody_drift', [
      { empty: true },
      { empty: true },
      { empty: false, offset: null, fx: { code: 1, param: 1 } },
      { empty: false, offset: null, jump: 4 },
    ]);
    expect(src).toBe(
      [
        'subpat melody_drift =',
        '  .',
        '  .',
        '  fx:1,1',
        '  jump:4',
      ].join('\n'),
    );
  });
});

describe('buildInstrumentHoverMarkdown', () => {
  test('keeps scalar props and formats subpatRows as source, not [object Object]', () => {
    const md = buildInstrumentHoverMarkdown('adv_lead_drift', {
      type: 'pulse1',
      duty: 50,
      gm: 81,
      subpat: 'melody_drift',
      subpatRows: [
        { empty: true },
        { empty: false, offset: null, fx: { code: 1, param: 1 } },
        { empty: false, offset: null, jump: 4 },
      ],
      loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
    });

    expect(md.propsFence).toContain('type=pulse1');
    expect(md.propsFence).toContain('subpat=melody_drift');
    expect(md.propsFence).not.toContain('subpatRows');
    expect(md.propsFence).not.toContain('[object Object]');
    expect(md.subpatFence).toContain('subpat melody_drift =');
    expect(md.subpatFence).toContain('fx:1,1');
    expect(md.subpatFence).toContain('jump:4');
  });

  test('still joins numeric arrays such as wave tables', () => {
    const md = buildInstrumentHoverMarkdown('adv_bass', {
      type: 'wave',
      wave: [9, 9, 10, 12],
    });
    expect(md.propsFence).toContain('wave=[9,9,10,12]');
    expect(md.subpatFence).toBeUndefined();
  });
});

describe('buildSubpatternHoverMarkdown', () => {
  test('titles the named table', () => {
    const md = buildSubpatternHoverMarkdown('kick_body', [
      { empty: true },
      { empty: false, halt: true },
    ]);
    expect(md.title).toContain('kick_body');
    expect(md.fence).toContain('halt');
  });
});
