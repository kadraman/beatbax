import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser/index';
import { collectDisallowedInsFileNodes } from '../src/song/ins-file';
import { resolveImportsSync } from '../src/song/importResolver';
import { parseUGE } from '../src/import/uge/uge.reader';
import {
  createNameAllocator,
  emptyExtractionResult,
  extractInstrumentsFromUGE,
  extractUgeInstrumentLibrary,
  formatSubpatternBlock,
  sanitizeIdent,
} from '../src/import/uge/ugeInstrumentsToBax';
import { buildUgeFixture } from './helpers/ugeFixtureWriter';

const REPO_ROOT = join(__dirname, '../../..');
const GENERATED_KIT = join(REPO_ROOT, 'songs/instruments/gameboy/gameboy.ins');
const GENERATED_DEMO = join(REPO_ROOT, 'songs/instruments/gameboy/gameboy-instruments-demo.bax');

describe('sanitizeIdent', () => {
  test('keeps valid identifiers and rewrites junk', () => {
    expect(sanitizeIdent('Lead', 'pulse_1')).toBe('Lead');
    expect(sanitizeIdent('cool bass!', 'pulse_1')).toBe('cool_bass');
    expect(sanitizeIdent('12bad', 'pulse_1')).toBe('bad');
    expect(sanitizeIdent('1/8 oct', 'pulse_1')).toBe('oct');
    expect(sanitizeIdent('12.5% quieter', 'pulse_1')).toBe('quieter');
    expect(sanitizeIdent('3/4', 'pulse_1')).toBe('pulse_1');
    expect(sanitizeIdent('8', 'pulse_1')).toBe('pulse_1');
    expect(sanitizeIdent('', 'pulse_1')).toBe('pulse_1');
    expect(sanitizeIdent('inst', 'pulse_1')).toBe('pulse_1');
  });
});

describe('ugeInstrumentsToBax', () => {
  test('maps duty env/sweep, wave hex+volume, noise width and uge_note', () => {
    const song = parseUGE(buildUgeFixture({
      version: 6,
      duty: [{
        type: 0,
        name: 'Lead',
        duty: 1,
        initialVolume: 12,
        volumeSweepDir: 1,
        volumeSweepChange: 2,
        freqSweepTime: 4,
        sweepDir: 0,
        freqSweepShift: 3,
      }],
      wave: [{ type: 1, name: 'Pad', waveIndex: 1, waveVolume: 2 }],
      noise: [{ type: 2, name: 'Snare', noiseMode: 1, initialVolume: 10, volumeSweepChange: 1 }],
      waveNibble: 0xc,
    }));

    const names = createNameAllocator();
    const result = emptyExtractionResult();
    extractInstrumentsFromUGE(song, 'fixture.uge', names, result);

    expect(result.pulse[0].instLine).toContain('type=pulse1');
    expect(result.pulse[0].instLine).toContain('duty=25');
    expect(result.pulse[0].instLine).toContain('env=12,down,2');
    expect(result.pulse[0].instLine).toContain('sweep=4,up,3');

    expect(result.wave[0].instLine).toMatch(/wave="C{32}"/);
    expect(result.wave[0].instLine).toContain('volume=50');

    expect(result.noise[0].instLine).toContain('gb:width=7');
    expect(result.noise[0].instLine).toContain('uge_note=C-6');
  });

  test('renames clashes and synthesizes unnamed used instruments', () => {
    const a = parseUGE(buildUgeFixture({ version: 6, duty: [{ type: 0, name: 'Lead' }] }));
    const b = parseUGE(buildUgeFixture({ version: 6, duty: [{ type: 0, name: 'Lead' }] }));
    const { result } = extractUgeInstrumentLibrary([
      { label: 'one.uge', song: a },
      { label: 'two.uge', song: b },
    ]);
    expect(result.pulse.map((p) => p.name)).toEqual(['Lead', 'Lead_2']);
    expect(result.renames.some((r) => r.to === 'Lead_2')).toBe(true);
  });

  test('skips unused hUGETracker starter names', () => {
    const unused = parseUGE(buildUgeFixture({
      version: 6,
      duty: [{ type: 0, name: 'Duty 50%' }],
      wave: [{ type: 1, name: 'Custom Wave' }],
      noise: [{ type: 2, name: 'Kick' }],
    }));
    unused.orders.duty1 = [];
    unused.orders.duty2 = [];
    const names = createNameAllocator();
    const result = emptyExtractionResult();
    extractInstrumentsFromUGE(unused, 'x.uge', names, result);
    expect(result.pulse.map((p) => p.name)).not.toContain('Duty_50');
    expect(result.wave.some((w) => w.originalName === 'Custom Wave')).toBe(true);
  });

  test('skips empty unused slots and DUTY_n placeholders', () => {
    const song = parseUGE(buildUgeFixture({
      version: 6,
      duty: [
        { type: 0, name: 'Keep' },
        { type: 0, name: 'DUTY_1' },
      ],
    }));
    const names = createNameAllocator();
    const result = emptyExtractionResult();
    extractInstrumentsFromUGE(song, 'x.uge', names, result);
    expect(result.pulse.map((p) => p.name)).toEqual(['Keep']);
  });

  test('emits subpat rows from offsets, vol, and halt', () => {
    const block = formatSubpatternBlock('kick_sub', [
      { note: 36, jump: 0, effectCode: 0x0c, effectParam: 15 },
      { note: 34, jump: 2, effectCode: 0, effectParam: 0 },
    ]);
    expect(block).toContain('subpat kick_sub =');
    expect(block).toContain('+0 vol:15');
    expect(block).toContain('-2 halt');
  });

  test('kit is a valid .ins file and demo imports every name', () => {
    const song = parseUGE(buildUgeFixture({ version: 6 }));
    const { result, kit, demo } = extractUgeInstrumentLibrary([{ label: 't.uge', song }]);

    const kitAst = parse(kit);
    expect(collectDisallowedInsFileNodes(kitAst)).toEqual([]);
    expect(kitAst.insts?.Lead).toBeTruthy();

    const demoAst = parse(demo);
    const resolved = resolveImportsSync(demoAst, {
      readFile: (p) => {
        if (p.replace(/\\/g, '/').endsWith('gameboy.ins')) return kit;
        throw new Error(`unexpected read ${p}`);
      },
      fileExists: (p) => p.replace(/\\/g, '/').endsWith('gameboy.ins'),
      baseFilePath: 'songs/instruments/gameboy/gameboy-instruments-demo.bax',
    });

    for (const inst of [...result.pulse, ...result.wave, ...result.noise]) {
      expect(resolved.insts?.[inst.name]).toBeTruthy();
      expect(demo).toContain(`:inst(${inst.name})`);
    }
  });
});

describe('generated Game Boy instrument kit', () => {
  test('gameboy.ins is a valid .ins file and the demo imports every name', () => {
    expect(existsSync(GENERATED_KIT)).toBe(true);
    expect(existsSync(GENERATED_DEMO)).toBe(true);

    const kit = readFileSync(GENERATED_KIT, 'utf8');
    const demo = readFileSync(GENERATED_DEMO, 'utf8');

    const kitAst = parse(kit);
    expect(kitAst.diagnostics?.filter((d) => d.level === 'error') ?? []).toEqual([]);
    expect(collectDisallowedInsFileNodes(kitAst)).toEqual([]);

    const instNames = Object.keys(kitAst.insts || {});
    expect(instNames.length).toBeGreaterThan(0);
    for (const name of instNames) {
      expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_\-]*$/);
    }

    const demoAst = parse(demo);
    const resolved = resolveImportsSync(demoAst, { baseFilePath: GENERATED_DEMO });
    expect(resolved.imports ?? []).toEqual([]);

    for (const name of instNames) {
      expect(resolved.insts?.[name]).toBeTruthy();
      expect(demo).toContain(`:inst(${name})`);
    }
  });
});
