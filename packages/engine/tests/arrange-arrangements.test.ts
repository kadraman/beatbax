import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';

describe('Arrange parsing and expansion', () => {
  test('short form arrange -> produces per-channel streams', () => {
    const src = `
      pat L = C4
      pat B = D3
      pat W = E4
      pat D = snare
      seq lead = L
      seq bass = B
      seq wave = W
      seq drums = D
      inst leadInst type=pulse1
      inst bassInst type=pulse2
      inst waveInst type=wave
      inst sn type=noise

      arrange main = lead | bass | wave | drums
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    // Expect 4 channels
    const ch1 = song.channels.find(c => c.id === 1)!;
    const ch2 = song.channels.find(c => c.id === 2)!;
    const ch3 = song.channels.find(c => c.id === 3)!;
    const ch4 = song.channels.find(c => c.id === 4)!;
    expect(ch1).toBeDefined();
    expect(ch2).toBeDefined();
    expect(ch3).toBeDefined();
    expect(ch4).toBeDefined();
    expect((ch1.events[0] as any).token).toBe('C4');
    expect((ch2.events[0] as any).token).toBe('D3');
    expect((ch3.events[0] as any).token).toBe('E4');
    // drums token should be resolved as named instrument 'sn' or 'snare'
    const t4 = (ch4.events[0] as any).token;
    expect(['snare', 'sn']).toContain(t4);
  });

  test('multi-row arrange concatenates rows in time per-channel', () => {
    const src = `
      pat a = C4
      pat a2 = E4
      pat b = D3
      seq lead = a
      seq lead2 = a2
      seq bass = b
      inst leadInst type=pulse1
      inst bassInst type=pulse2

      arrange main { lead | bass | . | . , lead2 | bass | . | . }
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    const ch1 = song.channels.find(c => c.id === 1)!;
    const tokens = ch1.events.map((e: any) => e.token);
    expect(tokens).toEqual(['C4', 'E4']);
  });
});
