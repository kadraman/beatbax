import exportUGE from '../src/export/ugeWriter';

describe('UGE export', () => {
  test('exportUGE default export exists', () => {
    expect(typeof exportUGE).toBe('function');
  });
});
