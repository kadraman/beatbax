import * as uge from '../src/import/uge/uge.reader';

describe('UGE reader (smoke)', () => {
  test('reader exports parse functions', () => {
    expect(typeof uge.parseUGE === 'function' || typeof uge.readUGEFile === 'function').toBeTruthy();
  });
});
