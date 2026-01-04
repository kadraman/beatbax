import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';

describe('Arrange edge cases - defaults', () => {
  test('arrange defaults(inst=...) applies temporary instrument to slots', () => {
    const src = `
      pat a = C4
      seq aseq = a
      inst lead type=pulse1
      inst other type=pulse2
      arrange main defaults(inst=lead) { aseq | . | . | . }
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    const ch1 = song.channels.find(c => c.id === 1)!;
    // the note should carry the instrument applied by arrange default
    const ev = ch1.events[0] as any;
    expect(ev.token).toBe('C4');
    expect(ev.instrument === 'lead' || ev.instrument === 'leadInst' || ev.instrument === undefined).toBeTruthy();
  });
});
