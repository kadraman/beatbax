import { normalizeArpOffsets, arpCycleOffsets } from '../src/util/arpOffsets';

describe('normalizeArpOffsets', () => {
  test('drops redundant leading zeros', () => {
    expect(normalizeArpOffsets([0, 4, 7])).toEqual([4, 7]);
    expect(normalizeArpOffsets([4, 7])).toEqual([4, 7]);
    expect(normalizeArpOffsets([0])).toEqual([0]);
  });

  test('arpCycleOffsets prepends root once', () => {
    expect(arpCycleOffsets([4, 7])).toEqual([0, 4, 7]);
    expect(arpCycleOffsets([0, 4, 7])).toEqual([0, 4, 7]);
  });
});
