import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../../../src/parser/index';
import {
  convertMidiToBax,
  defaultConvertOptions,
  parseImportConfig,
  resolveConvertOptions,
} from '../../../src/import/midi';

const FIXTURES = join(__dirname, '../../fixtures/midi');

function loadMid(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

function expectParses(source: string) {
  const ast = parse(source);
  expect(ast).toBeTruthy();
  expect(ast.channels?.length ?? 0).toBeGreaterThan(0);
}

describe('midi import golden fixtures F01–F09', () => {
  test('F01 grid mono (gameboy) verifies', () => {
    const result = convertMidiToBax(loadMid('f01-grid-mono.mid'), defaultConvertOptions('gameboy'), 'f01');
    expect(result.summary.notesImported).toBeGreaterThan(0);
    expectParses(result.source);
    const again = convertMidiToBax(loadMid('f01-grid-mono.mid'), defaultConvertOptions('gameboy'), 'f01');
    expect(again.source).toBe(result.source);
  });

  test('F02 gb kit', () => {
    const result = convertMidiToBax(loadMid('f02-gb-kit.mid'), defaultConvertOptions('gameboy'), 'f02');
    expect(result.source).toContain('chip gameboy');
    expect(result.source).toMatch(/kick|snare|hihat/);
    expectParses(result.source);
  });

  test('F03 nes kit', () => {
    const result = convertMidiToBax(loadMid('f03-nes-kit.mid'), defaultConvertOptions('nes'), 'f03');
    expect(result.source).toContain('chip nes');
    expect(result.source).toContain('type=triangle');
    expectParses(result.source);
  });

  test('F04 gm drums → named tokens', () => {
    const result = convertMidiToBax(loadMid('f04-gm-drums.mid'), defaultConvertOptions('gameboy'), 'f04');
    expect(result.source).toMatch(/\bkick\b/);
    expect(result.source).toMatch(/\bsnare\b/);
    expect(result.source).toMatch(/\bhihat\b/);
    expectParses(result.source);
  });

  test('F05 overpoly warns and drops', () => {
    const result = convertMidiToBax(loadMid('f05-overpoly.mid'), defaultConvertOptions('gameboy'), 'f05');
    expect(result.summary.notesDropped).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.code === 'over_polyphony')).toBe(true);
    expectParses(result.source);
  });

  test('F06 inst() multiplex with config', () => {
    const cfg = parseImportConfig(
      JSON.parse(readFileSync(join(FIXTURES, 'f06-inst-switch.import.json'), 'utf8')),
    );
    const opts = resolveConvertOptions({ chip: 'gameboy', config: cfg });
    const result = convertMidiToBax(loadMid('f06-inst-switch.mid'), opts, 'f06');
    expect(result.source).toContain('inst(lead)');
    expect(result.source).toContain('inst(arp)');
    expect(result.summary.channelsPacked).toBe(1);
    expectParses(result.source);
  });

  test('F07 pattern reuse + seq *N', () => {
    const result = convertMidiToBax(loadMid('f07-reuse.mid'), defaultConvertOptions('gameboy'), 'f07');
    expect(result.summary.patternsEmitted).toBe(2);
    expect(result.summary.patternsReused).toBeGreaterThan(0);
    expect(result.source).toMatch(/\*\d+/);
    expectParses(result.source);
  });

  test('F08 nearest succeeds; strict fails', () => {
    const nearest = convertMidiToBax(loadMid('f08-offgrid.mid'), defaultConvertOptions('gameboy'), 'f08');
    expectParses(nearest.source);

    const strictOpts = resolveConvertOptions({
      chip: 'gameboy',
      quantize: 'strict',
      strict: true,
    });
    expect(() => convertMidiToBax(loadMid('f08-offgrid.mid'), strictOpts, 'f08')).toThrow(/Strict quantize/);
  });

  test('F09 format 0 multi-channel', () => {
    const result = convertMidiToBax(loadMid('f09-format0.mid'), defaultConvertOptions('gameboy'), 'f09');
    expect(result.summary.notesImported).toBe(4);
    expect(result.summary.channelsPacked).toBeGreaterThanOrEqual(2);
    expectParses(result.source);
  });
});
