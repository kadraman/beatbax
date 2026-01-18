import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';

describe('arpeggio effect parsing', () => {
  test('parses inline arpeggio effect with 2 offsets', () => {
    const src = `
      inst lead type=pulse1
      pat p = C4<arp:3,7>
      channel 1 => inst lead pat p
    `;

    const ast = parse(src as any);
    const song = resolveSong(ast);
    const ch = song.channels.find(c => c.id === 1) as any;
    expect(ch).toBeDefined();
    expect(ch.events.length).toBeGreaterThanOrEqual(1);

    const ev0 = ch.events[0] as any;
    expect(ev0.type).toBe('note');
    expect(ev0.token).toBe('C4');
    expect(ev0.effects).toBeDefined();
    expect(Array.isArray(ev0.effects)).toBe(true);
    
    const arpFx = ev0.effects.find((fx: any) => fx.type === 'arp');
    expect(arpFx).toBeDefined();
    expect(arpFx.params).toEqual([3, 7]);
  });

  test('parses inline arpeggio effect with 3 offsets (minor triad)', () => {
    const src = `
      inst lead type=pulse1
      pat p = C4<arp:0,3,7>
      channel 1 => inst lead pat p
    `;

    const ast = parse(src as any);
    const song = resolveSong(ast);
    const ch = song.channels.find(c => c.id === 1) as any;
    expect(ch).toBeDefined();

    const ev0 = ch.events[0] as any;
    expect(ev0.type).toBe('note');
    const arpFx = ev0.effects.find((fx: any) => fx.type === 'arp');
    expect(arpFx).toBeDefined();
    expect(arpFx.params).toEqual([0, 3, 7]);
  });

  test('parses inline arpeggio effect with 4 offsets (7th chord)', () => {
    const src = `
      inst lead type=pulse1
      pat p = C4<arp:0,4,7,11>
      channel 1 => inst lead pat p
    `;

    const ast = parse(src as any);
    const song = resolveSong(ast);
    const ch = song.channels.find(c => c.id === 1) as any;
    expect(ch).toBeDefined();

    const ev0 = ch.events[0] as any;
    expect(ev0.type).toBe('note');
    const arpFx = ev0.effects.find((fx: any) => fx.type === 'arp');
    expect(arpFx).toBeDefined();
    expect(arpFx.params).toEqual([0, 4, 7, 11]);
  });

  test('parses arpeggio effect preset', () => {
    const src = `
      inst lead type=pulse1
      effect arpMinor = arp:3,7
      pat p = C4<arpMinor>
      channel 1 => inst lead pat p
    `;

    const ast = parse(src as any);
    expect(ast.effects).toBeDefined();
    if (ast.effects) {
      expect(ast.effects['arpMinor']).toBe('arp:3,7');
    }

    const song = resolveSong(ast);
    const ch = song.channels.find(c => c.id === 1) as any;
    expect(ch).toBeDefined();

    const ev0 = ch.events[0] as any;
    expect(ev0.type).toBe('note');
    expect(ev0.effects).toBeDefined();
    const arpFx = ev0.effects?.find((fx: any) => fx.type === 'arp');
    expect(arpFx).toBeDefined();
    expect(arpFx.params).toEqual([3, 7]);
  });

  test('parses arpeggio as pattern-level modifier', () => {
    const src = `
      inst lead type=pulse1
      effect arpMajor = arp:4,7
      pat melody = C4 E4 G4
      seq s = melody:arpMajor
      channel 1 => inst lead seq s
    `;

    const ast = parse(src as any);
    const song = resolveSong(ast);
    const ch = song.channels.find(c => c.id === 1) as any;
    expect(ch).toBeDefined();
    expect(ch.events.length).toBeGreaterThanOrEqual(3);

    // All three notes should have arpeggio effect applied
    for (let i = 0; i < 3; i++) {
      const ev = ch.events[i] as any;
      expect(ev.type).toBe('note');
      const arpFx = ev.effects?.find((fx: any) => fx.type === 'arp');
      expect(arpFx).toBeDefined();
      expect(arpFx.params).toEqual([4, 7]);
    }
  });
});
