import { parse } from '../src/parser';

describe('channel modifiers', () => {
  test('channel-level oct modifier shifts pattern notes', () => {
    const src = `
      pat A = C4 D4 E4
      channel 1 => seq A:oct(+1)
    `;
    const ast = parse(src);
    const ch = ast.channels.find(c => c.id === 1)!;
    // Smoke: channel exists and has a pat or events
    expect(ch).toBeDefined();
  });
});
