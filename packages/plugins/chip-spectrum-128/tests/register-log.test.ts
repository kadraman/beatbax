import { RegisterLog } from '../src/register-log.js';
import type { RegisterFrame } from '../src/register-arbitrator.js';

function makeFrame(tick: number, regs: number[]): RegisterFrame {
  const r = new Uint8Array(16);
  regs.forEach((v, i) => { r[i] = v; });
  return { tick, regs: r };
}

describe('RegisterLog', () => {
  let log: RegisterLog;

  beforeEach(() => {
    log = new RegisterLog();
  });

  test('starts empty', () => {
    expect(log.length).toBe(0);
    expect(log.getEntries()).toHaveLength(0);
  });

  test('append increases length', () => {
    log.append(makeFrame(0, []));
    log.append(makeFrame(1, []));
    expect(log.length).toBe(2);
  });

  test('entries are stored in order', () => {
    log.append(makeFrame(0, [10, 20, 30]));
    log.append(makeFrame(1, [40, 50, 60]));
    const entries = log.getEntries();
    expect(entries[0].tick).toBe(0);
    expect(entries[0].regs[0]).toBe(10);
    expect(entries[1].tick).toBe(1);
    expect(entries[1].regs[0]).toBe(40);
  });

  test('append makes defensive copy of regs', () => {
    const frame = makeFrame(0, [7, 8, 9]);
    log.append(frame);
    frame.regs[0] = 99; // mutate original
    expect(log.getEntries()[0].regs[0]).toBe(7); // copy unchanged
  });

  test('toBytes serializes 16 bytes per tick', () => {
    log.append(makeFrame(0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0]));
    log.append(makeFrame(1, [0, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]));
    const bytes = log.toBytes();
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(1);
    expect(bytes[15]).toBe(0);
    expect(bytes[16]).toBe(0);
    expect(bytes[31]).toBe(1);
  });

  test('toBytes is deterministic', () => {
    const frame = makeFrame(0, [42, 0, 0, 0, 0, 0, 0, 8, 10, 8, 5, 0, 0, 0, 0, 0]);
    log.append(frame);
    const bytes1 = log.toBytes();
    const bytes2 = log.toBytes();
    expect(bytes1).toEqual(bytes2);
  });

  test('clear resets log', () => {
    log.append(makeFrame(0, []));
    log.clear();
    expect(log.length).toBe(0);
    expect(log.getEntries()).toHaveLength(0);
  });

  test('toBytes returns empty buffer when log is empty', () => {
    expect(log.toBytes().length).toBe(0);
  });
});
