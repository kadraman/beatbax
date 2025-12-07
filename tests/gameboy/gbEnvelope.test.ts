import { parseEnvelope } from '../../src/chips/gameboy/pulse';
import { GB_CLOCK } from '../../src/chips/gameboy/periodTables';

describe('GB-style envelope parsing and scheduling', () => {
  test('parseEnvelope returns GB-mode fields for gb:12,down,2', () => {
    const e = parseEnvelope('gb:12,down,2');
    expect(e).toHaveProperty('mode', 'gb');
    expect(e).toHaveProperty('initial', 12);
    expect(e).toHaveProperty('direction', 'down');
    expect(e).toHaveProperty('period', 2);
  });

  test('parseEnvelope returns GB-mode fields for unprefixed 3-token string', () => {
    const e = parseEnvelope('7,up,1');
    expect(e.mode).toBe('gb');
    expect(e.initial).toBe(7);
    expect(e.direction).toBe('up');
    expect(e.period).toBe(1);
  });

  test('scheduling simulation: downwards steps', () => {
    const env = parseEnvelope('gb:3,down,1');
    const start = 0;
    const dur = 0.2; // 200ms
    const stepPeriod = (env.period ?? 1) * (65536 / GB_CLOCK); // mirrors playPulse precise timing
    const seq: number[] = [];
    let current = env.initial as number;
    let t = start + stepPeriod;
    // include initial volume at start
    seq.push(current);
    while (t < start + dur) {
      current = Math.max(0, current - 1);
      seq.push(current);
      if (current === 0) break;
      t += stepPeriod;
    }
    // initial 3, then 2,1,0 -> expect at least these values
    expect(seq[0]).toBe(3);
    expect(seq).toContain(2);
    expect(seq).toContain(1);
    expect(seq).toContain(0);
  });

  test('scheduling simulation: upwards steps saturate at 15', () => {
    const env = parseEnvelope('gb:14,up,2');
    const start = 0;
    const dur = 0.5; // long enough to reach cap
    const stepPeriod = (env.period ?? 1) * (65536 / GB_CLOCK);
    let current = env.initial as number;
    let t = start + stepPeriod;
    const seq: number[] = [current];
    while (t < start + dur) {
      current = Math.min(15, current + 1);
      seq.push(current);
      if (current === 15) break;
      t += stepPeriod;
    }
    expect(seq[0]).toBe(14);
    expect(seq[seq.length - 1]).toBe(15);
    expect(seq).toContain(15);
  });
});
