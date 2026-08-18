import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { buildUGE } from '../src/export/ugeWriter';
import { readUGEFile } from '../src/import/uge/uge.reader';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildVibratoTickProgram,
  classifyVibratoShape,
  parseVibratoSpec,
  planPatternVibratoRows,
  ugeTicksPerRow,
} from '../src/export/ugeVibrato';

function exportSong(src: string, file: string) {
  const song = resolveSong(parse(src) as any);
  const bytes = buildUGE(song);
  writeFileSync(file, bytes);
  return readUGEFile(file);
}

function firstDutyPattern(uge: ReturnType<typeof readUGEFile>) {
  const patternIndex = uge.orders.duty1[0];
  return uge.patterns.find((p) => p.index === patternIndex)!;
}

describe('ugeVibrato planner', () => {
  test('classifies common waveform names', () => {
    expect(classifyVibratoShape('sine')).toBe('triangle');
    expect(classifyVibratoShape('square')).toBe('square');
    expect(classifyVibratoShape('saw')).toBe('sawup');
    expect(classifyVibratoShape('ramp')).toBe('sawdown');
  });

  test('builds a looping bipolar 1xx/2xx cycle', () => {
    const spec = parseVibratoSpec({ type: 'vib', params: [5, 4, 'sine'] })!;
    const program = buildVibratoTickProgram(spec, 8);
    expect(program.enabled).toBe(true);
    const codes = program.rows
      .map((r) => r.effect?.code)
      .filter((c): c is number => c === 1 || c === 2);
    expect(codes.some((c) => c === 1)).toBe(true);
    expect(codes.some((c) => c === 2)).toBe(true);
    const last = program.rows[program.rows.length - 1];
    expect(last.jump).toBe(1);
    expect(last.halt).toBe(false);
  });

  test('honours delay rows as empty ticks and duration as halt', () => {
    const spec = parseVibratoSpec({ type: 'vib', params: [5, 4, 'sine', 2, 1] })!;
    const program = buildVibratoTickProgram(spec, 4);
    expect(spec.delayRows).toBe(1);
    expect(spec.durationRows).toBe(2);
    expect(program.rows.slice(0, 4).every((r) => !r.effect)).toBe(true);
    expect(program.rows[program.rows.length - 1].halt).toBe(true);
  });

  test('pattern fallback alternates 1xx/2xx and skips delay rows', () => {
    const spec = parseVibratoSpec({ type: 'vib', params: [5, 4, 'sine', , 1] })!;
    const cells = planPatternVibratoRows(spec, 6, 7);
    expect(cells[0]).toBeNull();
    expect(cells[1]?.code).toBe(1);
    expect(cells.some((c) => c?.code === 2)).toBe(true);
  });

  test('ugeTicksPerRow matches the UGE tempo formula', () => {
    expect(ugeTicksPerRow(112)).toBe(8);
    expect(ugeTicksPerRow(128)).toBe(7);
  });
});

describe('UGE vibrato export', () => {
  const files: string[] = [];
  afterEach(() => {
    for (const f of files) {
      if (existsSync(f)) unlinkSync(f);
    }
    files.length = 0;
  });

  test('named vib preset becomes a 1xx/2xx instrument subpattern, not 4xy', () => {
    const file = join(tmpdir(), `beatbax_vib_clone_${Date.now()}.uge`);
    files.push(file);
    const uge = exportSong(`
      chip gameboy
      bpm 112
      inst lead type=pulse1 duty=50 env={"level":13,"direction":"flat","period":0,"format":"gb"}
      effect drift = vib:5,4,sine
      pat p = C4<drift>:8
      channel 1 => inst lead pat p
    `, file);

    const clone = uge.dutyInstruments.find((d) => d.name === 'lead vib');
    expect(clone).toBeDefined();
    expect(clone!.subpatternEnabled).toBe(true);
    const fxRows = (clone!.rows || []).filter((r) => r.effectCode === 1 || r.effectCode === 2);
    expect(fxRows.length).toBeGreaterThan(3);
    expect(fxRows.some((r) => r.effectCode === 1)).toBe(true);
    expect(fxRows.some((r) => r.effectCode === 2)).toBe(true);

    const pat = firstDutyPattern(uge);
    expect(pat.rows[0].note).not.toBe(90);
    expect(pat.rows[0].effectCode).not.toBe(4);
    expect(pat.rows[0].instrument).toBe(2);
    expect(pat.rows.slice(0, 8).every((r) => r.effectCode !== 4)).toBe(true);
  });

  test('inline vib:3,5 also clones instead of writing 4xy', () => {
    const file = join(tmpdir(), `beatbax_vib_inline_${Date.now()}.uge`);
    files.push(file);
    const uge = exportSong(`
      inst lead type=pulse1
      pat p = C4<vib:3,5>:4
      channel 1 => inst lead pat p
    `, file);

    const clone = uge.dutyInstruments.find((d) => d.name.includes('vib'));
    expect(clone?.subpatternEnabled).toBe(true);
    const pat = firstDutyPattern(uge);
    expect(pat.rows[0].effectCode).not.toBe(4);
  });

  test('vib on an instrument that already has a program falls back to pattern 1xx/2xx', () => {
    const file = join(tmpdir(), `beatbax_vib_fallback_${Date.now()}.uge`);
    files.push(file);
    const warnings: string[] = [];
    const song = resolveSong(parse(`
      inst lead type=pulse1 pitch_env=[0,1,0,-1|0]
      pat p = C4<vib:5,4,sine>:8
      channel 1 => inst lead pat p
    `) as any);
    const bytes = buildUGE(song, { onWarn: (m) => warnings.push(m) });
    writeFileSync(file, bytes);
    const uge = readUGEFile(file);

    expect(warnings.some((w) => w.includes('already has a tick program'))).toBe(true);
    expect(uge.dutyInstruments.some((d) => d.name === 'lead vib')).toBe(false);

    const pat = firstDutyPattern(uge);
    const codes = pat.rows.slice(0, 8).map((r) => r.effectCode);
    expect(codes.some((c) => c === 1 || c === 2)).toBe(true);
    expect(codes.every((c) => c !== 4)).toBe(true);
  });
});
