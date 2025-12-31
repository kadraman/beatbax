import { isPanEmpty } from '../src/song/resolver';

describe('isPanEmpty helper', () => {
  test('returns true for null/undefined', () => {
    expect(isPanEmpty(undefined)).toBeTruthy();
    expect(isPanEmpty(null)).toBeTruthy();
  });

  test('returns true for object with no own enum/value properties (inherited only)', () => {
    const proto: any = { enum: 'L' };
    const pan = Object.create(proto);
    expect(isPanEmpty(pan)).toBeTruthy();
  });

  test('returns false for plain object with enum/value', () => {
    expect(isPanEmpty({ enum: 'L' })).toBeFalsy();
    expect(isPanEmpty({ value: 0 })).toBeFalsy();
  });

  test('returns false for strings/numbers', () => {
    expect(isPanEmpty('L')).toBeFalsy();
    expect(isPanEmpty(0)).toBeFalsy();
  });
});