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
    // tutorial_groove export uses GM 81/84/39 → lead family on pulses + bass
    expect(result.source).toMatch(/inst lead_p1\s+type=pulse1.*duty=50.*"period":3/);
    expect(result.source).toMatch(/inst lead_p2\s+type=pulse2.*"period":3/);
    expect(result.source).toMatch(/inst bass\s+type=wave volume=25/);
    expect(result.source).toMatch(/inst kick\s+type=noise.*uge_note=C-6.*pitch_env=\[0,-2,-4,-6\].*vol_env=\[15,12,8,4\]/);
    expect(result.source).toMatch(/inst snare\s+type=noise.*uge_note=C-7/);
    expect(result.source).toMatch(/inst hihat\s+type=noise.*gb:width=15.*uge_note=C-8/);
    expectParses(result.source);
  });

  test('F03 nes kit', () => {
    const result = convertMidiToBax(loadMid('f03-nes-kit.mid'), defaultConvertOptions('nes'), 'f03');
    expect(result.source).toContain('chip nes');
    expect(result.source).toContain('type=triangle');
    expect(result.source).toMatch(/inst kick\s+type=noise.*noise_period=12.*note=C5/);
    expect(result.source).toMatch(/inst snare\s+type=noise.*noise_period=7/);
    expect(result.source).toMatch(/inst ghost\s+type=noise/);
    // Ghost hits (GM 37) must stay soft ghosts, not flood as snare
    expect(result.source).toMatch(/\bghost\b/);
    expectParses(result.source);
  });

  test('F03 nes kit with dmcReinforcement config', () => {
    const cfg = parseImportConfig(
      JSON.parse(readFileSync(join(FIXTURES, 'f03-nes-kit.import.json'), 'utf8')),
    );
    const opts = resolveConvertOptions({ chip: 'nes', config: cfg });
    const result = convertMidiToBax(loadMid('f03-nes-kit.mid'), opts, 'f03-dmc');
    expect(result.source).toContain('chip nes');
    expect(result.source).toMatch(
      /inst kick\s+type=dmc.*dmc_sample="@nes\/kick"/,
    );
    expect(result.source).toMatch(
      /inst snare\s+type=dmc.*dmc_sample="@nes\/snare"/,
    );
    expect(result.source).toMatch(/channel 5 => inst kick seq dmc_seq/);
    expect(result.source).toMatch(/\bghost\b/);
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

  test('F08 nearest succeeds; strict fails only with --strict', () => {
    const nearest = convertMidiToBax(loadMid('f08-offgrid.mid'), defaultConvertOptions('gameboy'), 'f08');
    expectParses(nearest.source);

    const strictModeOnly = resolveConvertOptions({
      chip: 'gameboy',
      quantize: 'strict',
    });
    const soft = convertMidiToBax(loadMid('f08-offgrid.mid'), strictModeOnly, 'f08');
    expect(soft.diagnostics.some((d) => d.code === 'quantize_strict')).toBe(true);
    expectParses(soft.source);

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
