import { isParseSuccessValid } from '../src/parse/parse-validity.js';

describe('isParseSuccessValid', () => {
  it('returns true when valid is true', () => {
    expect(isParseSuccessValid({ valid: true })).toBe(true);
  });

  it('returns false when valid is false', () => {
    expect(isParseSuccessValid({ valid: false })).toBe(false);
  });

  it('defaults to true when valid is omitted (test/back-compat payloads)', () => {
    expect(isParseSuccessValid({})).toBe(true);
  });
});
