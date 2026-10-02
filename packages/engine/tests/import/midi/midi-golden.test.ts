import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../../../src/parser/index';
import {
  convertMidiToBax,
  defaultConvertOptions,
  parseImportConfig,
  resolveConvertOptions,
} from '../../../src/import/midi';
import { readMidiBytes } from '../../../src/import/midi/reader';
import { inspectMidiBytes } from '../../../src/import/midi';
import { channelBars, expectVerifies } from './arrangement-helpers';

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
    expect(result.source).toMatch(/inst lead_p1_inst\s+type=pulse1.*duty=50.*"period":3/);
    expect(result.source).toMatch(/inst lead_p2_inst\s+type=pulse2.*"period":3/);
    expect(result.source).toMatch(/inst bass_inst\s+type=wave volume=25/);
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
    expect(result.source).toMatch(/inst kick\s+type=noise.*noise_period=12/);
    expect(result.source).toMatch(/inst snare\s+type=noise.*noise_period=7/);
    expect(result.source).toMatch(
      /inst kick_dmc\s+type=dmc.*dmc_sample="@nes\/kick"/,
    );
    expect(result.source).toMatch(
      /inst snare_dmc\s+type=dmc.*dmc_sample="@nes\/snare"/,
    );
    expect(result.source).toMatch(/channel 5 => inst kick_dmc seq dmc_s01_seq dmc_s02_seq/);
    expect(result.source).toMatch(/\bkick_dmc\b/);
    expect(result.source).toMatch(/\bsnare_dmc\b/);
    // Noise channel still uses plain kick/snare tokens bound to type=noise defs
    expect(result.source).toMatch(/channel 4 => inst /);
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
    const bytes = loadMid('f09-format0.mid');
    const parsed = readMidiBytes(bytes);
    const midiChannels = [...new Set(parsed.notes.map((n) => n.midiChannel))];
    expect(midiChannels.length).toBeGreaterThanOrEqual(2);

    const result = convertMidiToBax(bytes, defaultConvertOptions('gameboy'), 'f09');
    expect(result.summary.notesImported).toBe(4);
    expect(result.summary.channelsPacked).toBeGreaterThanOrEqual(2);
    expectParses(result.source);
  });
});

describe('midi import golden fixtures F10–F14 (feature 089)', () => {
  function convertFixture(name: string, chip: 'gameboy' | 'nes' = 'gameboy', annotate = false) {
    const cfg = parseImportConfig(JSON.parse(readFileSync(join(FIXTURES, `${name}.import.json`), 'utf8')));
    const opts = resolveConvertOptions({ chip, config: cfg, annotate });
    const result = convertMidiToBax(loadMid(`${name}.mid`), opts, name);
    const again = convertMidiToBax(loadMid(`${name}.mid`), opts, name);
    expect(again.source).toBe(result.source);
    return result;
  }
  const codesOf = (r: { diagnostics: { code: string }[] }) => r.diagnostics.map((d) => d.code);

  test.each(['gameboy', 'nes'] as const)('F10 ranged lanes + gap fill (%s)', (chip) => {
    const result = convertFixture('f10-lanes', chip);
    const lead = channelBars(result.source, 1);
    expect(lead[0]).toBe(
      'inst(synth) G5:2 inst(guitar) E4:2 inst(synth) G5:2 inst(guitar) E4:2 ' +
        'inst(synth) G5:2 inst(guitar) E4:2 inst(synth) G5:2 inst(guitar) E4:2',
    );
    // Last synth note (3 eighths) is clipped at the toBar 2 boundary and blocks the guitar offbeat.
    expect(lead[1]).toMatch(/inst\(synth\) G5:4$/);
    expect(lead[2]).toBe('inst(vocal) C5:4 D5:4 E5:4 F#5:4');
    expect(lead[3]).toBe('C5:4 D5:4 E5:4 F#5:4');
    expect(channelBars(result.source, 3)).toEqual(['E2:16', 'E2:16', 'E2:16', 'E2:16']);
    const codes = codesOf(result);
    expect(codes).not.toContain('over_polyphony');
    expect(codes).not.toContain('chord_flatten');
    expect(codes).not.toContain('mono_conflict');
    expect(codes.filter((c) => c === 'lane_overlap')).toHaveLength(1);
    expect(codes).toContain('unmapped_dropped');
    expect(result.summary.notesDropped).toBe(9);
    expect(result.summary.mappingStats!.map((s) => s.kept)).toEqual([8, 8, 7, 4]);
    expectVerifies(result.source);
  });

  test('F11 mono policies + transpose', () => {
    const result = convertFixture('f11-mono');
    expect(channelBars(result.source, 1)).toEqual(['G4:4 G4:4 G4:4 G4:4', 'C5:12 F4:4']);
    expect(channelBars(result.source, 3)[0]).toBe('C2:4 C2:4 C2:4 C2:4');
    expect(channelBars(result.source, 2)[1]).toBe('C5:2 D5:2 E5:8 .:4');
    const codes = codesOf(result);
    expect(codes).not.toContain('chord_flatten');
    expect(codes).not.toContain('mono_conflict');
    expect(codes.filter((c) => c === 'mono_reduce')).toHaveLength(2);
    expect(result.summary.notesDropped).toBe(13);
    expectVerifies(result.source);
  });

  test('F12 tempo map + window + nudge', () => {
    const result = convertFixture('f12-tempo-window');
    expect(result.source).toMatch(/^bpm 96$/m);
    const bars = channelBars(result.source, 1);
    expect(bars).toHaveLength(3);
    expect(bars[0]).toBe('C4:2 .:2 C#4:2 .:2 D4:2 .:2 D#4:2 .:2');
    expect(result.summary.bpm).toBe(96);
    expect(result.summary.barsGenerated).toBe(3);
    expect(codesOf(result)).toContain('tempo_map_ignored');
    expectVerifies(result.source);
  });

  test('F13 triplet grid plays at the source tempo', () => {
    const result = convertFixture('f13-triplet');
    expect(result.source).toMatch(/^bpm 101$/m);
    expect(channelBars(result.source, 1)).toEqual([
      'G4 E4 C4 G4 E4 C4 G4 E4 C4 G4 E4 C4',
      'G4 E4 C4 G4 E4 C4 G4 E4 C4 G4 E4 C4',
    ]);
    expectVerifies(result.source);
  });

  test('F14 duplicate + unmapped drop + drum exclude', () => {
    const result = convertFixture('f14-dup-unmapped');
    expect(channelBars(result.source, 4)[0]).toBe('kick .:3 snare .:3 kick .:3 snare .:3');
    expect(result.source).not.toMatch(/^channel 2 =>/m);
    const unmapped = result.diagnostics.find((d) => d.code === 'unmapped_dropped');
    expect(unmapped?.message).toMatch(/T1 ch2 \(8 note\(s\)\), T2 ch3 \(2 note\(s\)\)/);
    expect(result.summary.notesDropped).toBe(0);
    expect(result.summary.mappingStats![1]).toMatchObject({ filtered: 8, kept: 8 });

    const report = inspectMidiBytes(loadMid('f14-dup-unmapped.mid'));
    expect(report.tracks.find((t) => t.id === 'T1')?.duplicateOf).toBe('T0');
    expect(report.tracks.filter((t) => t.duplicateOf)).toHaveLength(1);
    expectVerifies(result.source);
  });
});
