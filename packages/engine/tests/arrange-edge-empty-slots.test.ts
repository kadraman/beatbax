import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';

describe('Arrange edge cases - empty slots', () => {
  test('dot and dash represent silent slots', () => {
    const src = `
      pat A = C4
      seq a = A
      arrange main = a | . | - | .
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    // channel 1 should have events, others should be empty or undefined
    const ch1 = song.channels.find(c => c.id === 1)!;
    const ch2 = song.channels.find(c => c.id === 2);
    const ch3 = song.channels.find(c => c.id === 3);
    const ch4 = song.channels.find(c => c.id === 4);
    expect(ch1).toBeDefined();
    expect((ch1.events[0] as any).token).toBe('C4');
    expect(!ch2 || ch2.events.length === 0).toBeTruthy();
    expect(!ch3 || ch3.events.length === 0).toBeTruthy();
    expect(!ch4 || ch4.events.length === 0).toBeTruthy();
  });
});
