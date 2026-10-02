import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Midi } from '@tonejs/midi';
import { parse } from '../../../src/parser/index';
import {
  convertMidiToBax,
  defaultConvertOptions,
  emitMelodicInstLine,
  gmFamilyFromProgram,
  instrumentNameForFamilyRole,
  parseImportConfig,
  resolveConvertOptions,
} from '../../../src/import/midi';
import { parseFamilyRoleFromInstrumentName } from '../../../src/import/midi/kit';

function midiWithProgram(program: number, pitch = 67): Buffer {
  const midi = new Midi();
  midi.header.setTempo(120);
  const t = midi.addTrack();
  t.channel = 0;
  t.name = 'Voice';
  t.instrument.number = program;
  t.addNote({ midi: pitch, ticks: 0, durationTicks: 480 });
  t.addNote({ midi: pitch + 2, ticks: 480, durationTicks: 480 });
  return Buffer.from(midi.toArray());
}

describe('GM program family kit', () => {
  test('gmFamilyFromProgram maps coarse bands', () => {
    expect(gmFamilyFromProgram(0)).toBe('piano');
    expect(gmFamilyFromProgram(7)).toBe('piano');
    expect(gmFamilyFromProgram(24)).toBe('guitar');
    expect(gmFamilyFromProgram(36)).toBe('bass');
    expect(gmFamilyFromProgram(40)).toBe('strings');
    expect(gmFamilyFromProgram(42)).toBe('strings');
    expect(gmFamilyFromProgram(51)).toBe('strings');
    expect(gmFamilyFromProgram(81)).toBe('lead');
    expect(gmFamilyFromProgram(89)).toBe('pad');
    expect(gmFamilyFromProgram(60)).toBe('lead'); // brass fallback
  });

  test('instrumentNameForFamilyRole uses stable suffixes', () => {
    expect(instrumentNameForFamilyRole('strings', 'pulse1')).toBe('strings_p1_inst');
    expect(instrumentNameForFamilyRole('strings', 'pulse2')).toBe('strings_p2_inst');
    expect(instrumentNameForFamilyRole('strings', 'wave')).toBe('strings_bass_inst');
    expect(instrumentNameForFamilyRole('bass', 'wave')).toBe('bass_inst');
    expect(instrumentNameForFamilyRole('bass', 'triangle')).toBe('bass_inst');
    expect(instrumentNameForFamilyRole('piano', 'pulse1')).toBe('piano_p1_inst');
    expect(instrumentNameForFamilyRole('lead', 'noise')).toBe('hihat');
    expect(instrumentNameForFamilyRole('lead', 'dmc')).toBe('kick_dmc');
  });

  test('family and role are read from names with or without _inst', () => {
    expect(parseFamilyRoleFromInstrumentName('strings_p2_inst')).toEqual({ family: 'strings', role: 'pulse2' });
    expect(parseFamilyRoleFromInstrumentName('strings_p2')).toEqual({ family: 'strings', role: 'pulse2' });
    expect(parseFamilyRoleFromInstrumentName('bass_inst')).toEqual({ family: 'bass', role: 'wave' });
    expect(parseFamilyRoleFromInstrumentName('bass')).toEqual({ family: 'bass', role: 'wave' });
    expect(parseFamilyRoleFromInstrumentName('kick')).toBeNull();
    expect(parseFamilyRoleFromInstrumentName('lead_horn')).toBeNull();
  });

  test('GB piano is short hold; strings sustain', () => {
    const opts = defaultConvertOptions('gameboy');
    const piano = emitMelodicInstLine('gameboy', 'piano_p1_inst', 'pulse1', 'piano', opts);
    const strings = emitMelodicInstLine('gameboy', 'strings_p1_inst', 'pulse1', 'strings', opts);
    expect(piano).toMatch(/"period":2/);
    expect(strings).toMatch(/"period":0/);
  });

  test('config families overrides piano period', () => {
    const opts = resolveConvertOptions({
      chip: 'gameboy',
      config: parseImportConfig({
        families: { piano: { gb: { period: 0, level: 10 } } },
      }),
    });
    expect(opts.familyArticulations.piano.gb.period).toBe(0);
    const line = emitMelodicInstLine('gameboy', 'piano_p1', 'pulse1', 'piano', opts);
    expect(line).toMatch(/"period":0/);
    expect(line).toMatch(/"level":10/);
  });

  test('config programFamilies remaps brass band to strings', () => {
    const opts = resolveConvertOptions({
      chip: 'gameboy',
      config: parseImportConfig({
        programFamilies: { '56-63': 'strings' },
      }),
    });
    expect(gmFamilyFromProgram(60, opts.programFamilyByProgram)).toBe('strings');
    expect(gmFamilyFromProgram(0, opts.programFamilyByProgram)).toBe('piano');
  });

  test('import piano MIDI → piano_p1_inst short period', () => {
    const result = convertMidiToBax(midiWithProgram(0), defaultConvertOptions('gameboy'), 'piano');
    expect(result.source).toMatch(/inst piano_p1_inst\s+type=pulse1.*"period":2/);
    expect(result.source).toMatch(/channel 1 => inst piano_p1_inst /);
    expectParses(result.source);
  });

  test('import violin MIDI → strings_p1_inst sustain period', () => {
    const result = convertMidiToBax(midiWithProgram(40), defaultConvertOptions('gameboy'), 'violin');
    expect(result.source).toMatch(/inst strings_p1_inst\s+type=pulse1.*"period":0/);
    expect(result.source).toMatch(/channel 1 => inst strings_p1_inst /);
    expectParses(result.source);
  });

  test('GM cello (42) packs to wave bass role', () => {
    const result = convertMidiToBax(midiWithProgram(42, 48), defaultConvertOptions('gameboy'), 'cello');
    expect(result.source).toMatch(/inst strings_bass_inst\s+type=wave/);
    expect(result.source).toMatch(/channel 3 => inst strings_bass_inst /);
    expect(result.summary.channelsPacked).toBe(1);
    expectParses(result.source);
  });

  test('GM viola (41) packs to pulse2', () => {
    const result = convertMidiToBax(midiWithProgram(41, 60), defaultConvertOptions('gameboy'), 'viola');
    expect(result.source).toMatch(/inst strings_p2_inst\s+type=pulse2/);
    expect(result.source).toMatch(/channel 2 => inst strings_p2_inst /);
    expectParses(result.source);
  });

  test('stretch Canon MIDI → strings kit when present', () => {
    const path = join(__dirname, '../../../../../../songs/midi/s05-canon_per_3_violini_e_basso.mid');
    if (!existsSync(path)) return;
    const result = convertMidiToBax(
      readFileSync(path),
      defaultConvertOptions('gameboy'),
      'canon',
    );
    expect(result.source).toMatch(/inst strings_p1_inst\s+type=pulse1.*"period":0/);
    expect(result.source).toMatch(/inst strings_/);
    expect(result.source).toMatch(/volume=25/);
    expectParses(result.source);
  });
});

function expectParses(source: string) {
  const ast = parse(source);
  expect(ast).toBeTruthy();
  expect(ast.channels?.length ?? 0).toBeGreaterThan(0);
}
