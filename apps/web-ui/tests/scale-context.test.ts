import {
  channelReferencesPattern,
  formatScaleContextStatusLabel,
  resolvePatternLockBindings,
  resolvePrimaryPatternLock,
  resolveScaleContext,
} from '../src/editor/scale-context';

describe('scale-context', () => {
  const ast = {
    scale: { root: 'D', mode: 'major', enforcement: 'warn' },
    pats: { bassline: [], melody: [] },
    seqs: {
      bass_seq: ['bassline * 4'],
      main: ['melody'],
    },
    channels: [
      { id: 1, lock: 'scale', seqSpecTokens: ['main'] },
      { id: 2, lock: 'root+fifth', seqSpecTokens: ['bass_seq'] },
    ],
  };

  test('finds lock bindings for patterns referenced directly or via seq', () => {
    expect(resolvePatternLockBindings(ast, 'melody')).toEqual([{ channelId: 1, lock: 'scale' }]);
    expect(resolvePatternLockBindings(ast, 'bassline')).toEqual([{ channelId: 2, lock: 'root+fifth' }]);
    expect(resolvePrimaryPatternLock(ast, 'bassline')).toBe('root+fifth');
  });

  test('channelReferencesPattern handles seq indirection', () => {
    expect(channelReferencesPattern(ast, ast.channels[1], 'bassline')).toBe(true);
    expect(channelReferencesPattern(ast, ast.channels[0], 'bassline')).toBe(false);
  });

  test('resolveScaleContext requires scale and pat body cursor', () => {
    const patLine = 'pat bassline = D3 . A2 .';
    const inside = patLine.indexOf('D3') + 1;
    const ctx = resolveScaleContext(ast, patLine, inside);
    expect(ctx?.patternName).toBe('bassline');
    expect(ctx?.bindings[0]?.lock).toBe('root+fifth');
    expect(ctx?.allowedNames).toBe('D, A');

    expect(resolveScaleContext(ast, patLine, 1)).toBeNull();
    expect(resolveScaleContext({ ...ast, scale: undefined }, patLine, inside)).toBeNull();
  });

  test('formatScaleContextStatusLabel includes scale, lock, and allowed notes', () => {
    const ctx = resolveScaleContext(ast, 'pat bassline = D3', 20)!;
    const label = formatScaleContextStatusLabel(ctx);
    expect(label.text).toContain('D major');
    expect(label.text).toContain('root+fifth');
    expect(label.text).toContain('D, A');
    expect(label.title).toContain('Pat bassline');
  });

  test('formatScaleContextStatusLabel handles pat without lock', () => {
    const noLockAst = {
      scale: { root: 'C', mode: 'major', enforcement: 'warn' },
      seqs: {},
      channels: [{ id: 1, seqSpecTokens: ['orphan'] }],
    };
    const ctx = resolveScaleContext(noLockAst, 'pat orphan = C4', 15)!;
    const label = formatScaleContextStatusLabel(ctx);
    expect(label.text).toContain('C major');
    expect(label.text).toContain('no lock');
  });
});
