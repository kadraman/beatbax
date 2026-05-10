import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';

describe('effects parsing & inline pan', () => {
  test('parses inline pan enums and numeric forms into resolved events', () => {
    const src = `
      inst sn type=noise
      pat p = C4<pan:L> D4<pan:-1.0> E4<gb:pan:R>
      channel 1 => inst sn pat p
    `;

    const ast = parse(src as any);
    const song = resolveSong(ast);
    const ch = song.channels.find(c => c.id === 1) as any;
    expect(ch).toBeDefined();
    expect(ch.events.length).toBeGreaterThanOrEqual(3);

    const ev0 = ch.events[0] as any;
    expect(ev0.type).toBe('note');
    expect(ev0.token).toBe('C4');
    expect(ev0.pan).toBeDefined();
    expect(ev0.pan.enum).toBe('L');

    const ev1 = ch.events[1] as any;
    expect(ev1.token).toBe('D4');
    expect(ev1.pan).toBeDefined();
    expect(typeof ev1.pan.value).toBe('number');
    expect(ev1.pan.value).toBeCloseTo(-1.0);

    const ev2 = ch.events[2] as any;
    expect(ev2.token).toBe('E4');
    expect(ev2.pan).toBeDefined();
    expect(ev2.pan.enum).toBe('R');
    expect(ev2.pan.sourceNamespace).toBe('gb');
  });

  test('inline pan on chip sms emits a resolver warning', () => {
    const src = `
      chip sms
      inst lead type=tone1
      pat p = C4<pan:R>
      channel 1 => inst lead pat p
    `;

    const ast = parse(src as any);
    const warnings: string[] = [];
    resolveSong(ast, {
      onWarn: (d) => warnings.push(d.message),
    });

    expect(warnings.some((w) => w.includes("Inline pan on 'chip sms'"))).toBe(true);
    expect(warnings.some((w) => w.includes("chip gamegear"))).toBe(true);
  });
});