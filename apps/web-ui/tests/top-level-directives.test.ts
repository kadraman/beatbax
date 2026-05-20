import { isTopLevelBaxLine } from '../src/editor/top-level-directives';

describe('isTopLevelBaxLine', () => {
  test('recognizes canonical and deprecated timing directives', () => {
    expect(isTopLevelBaxLine('stepsPerBar 4')).toBe(true);
    expect(isTopLevelBaxLine('time 3')).toBe(true);
    expect(isTopLevelBaxLine('ticksPerStep 16')).toBe(true);
  });

  test('recognizes other top-level statements', () => {
    expect(isTopLevelBaxLine('chip gameboy')).toBe(true);
    expect(isTopLevelBaxLine('  bpm 120')).toBe(true);
    expect(isTopLevelBaxLine('pat melody = C4')).toBe(true);
  });

  test('does not treat pattern tokens as top-level', () => {
    expect(isTopLevelBaxLine('C4 E4 G4')).toBe(false);
    expect(isTopLevelBaxLine('  # time 4 in a comment')).toBe(false);
  });
});
