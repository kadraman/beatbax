import { describe, it, expect, beforeAll } from '@jest/globals';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  defaultDemoPath,
  defaultKitPathForInputs,
  detectInstrumentSource,
  expandExtractInputs,
  parseInstrumentKinds,
  peelKitOutputArgument,
} from '../src/extract-instrument';

const TMP = join(__dirname, '..', '..', '..', 'tmp', 'extract-instrument-unit');

describe('detectInstrumentSource', () => {
  it('maps .uge (any case) to uge', () => {
    expect(detectInstrumentSource('song.uge')).toBe('uge');
    expect(detectInstrumentSource('song.UGE')).toBe('uge');
  });

  it('treats .bax and .mid as unknown', () => {
    expect(detectInstrumentSource('song.bax')).toBe('unknown');
    expect(detectInstrumentSource('song.mid')).toBe('unknown');
  });

  it('honours --from uge on a non-.uge name', () => {
    expect(detectInstrumentSource('dumped.bin', 'uge')).toBe('uge');
    expect(detectInstrumentSource('dumped.bin', 'UGE')).toBe('uge');
  });

  it('rejects unknown --from values', () => {
    expect(detectInstrumentSource('song.uge', 'ftm')).toBe('unknown');
  });
});

describe('parseInstrumentKinds', () => {
  it('parses a subset list', () => {
    expect(parseInstrumentKinds('noise,wave')).toEqual(['noise', 'wave']);
  });

  it('rejects unknown types', () => {
    expect(() => parseInstrumentKinds('triangle')).toThrow(/unknown instrument type/);
  });
});

describe('peelKitOutputArgument', () => {
  it('uses --out and still peels a trailing .ins so it is not treated as an input', () => {
    expect(peelKitOutputArgument(['a.uge', 'b.ins'], 'kit.ins')).toEqual({
      inputs: ['a.uge'],
      kitOut: 'kit.ins',
    });
  });

  it('peels a trailing .ins argument', () => {
    expect(peelKitOutputArgument(['a.uge', 'out.ins'])).toEqual({
      inputs: ['a.uge'],
      kitOut: 'out.ins',
    });
  });

  it('keeps a lone .ins path as an input when --out is set (not a trailing output)', () => {
    expect(peelKitOutputArgument(['kit.ins'], 'out.ins')).toEqual({
      inputs: ['kit.ins'],
      kitOut: 'out.ins',
    });
  });
});

describe('expandExtractInputs', () => {
  const ugeDir = join(TMP, 'uges');
  const ugeA = join(ugeDir, 'a.uge');
  const ugeB = join(ugeDir, 'b.UGE');
  const noise = join(ugeDir, 'readme.txt');

  beforeAll(() => {
    mkdirSync(ugeDir, { recursive: true });
    writeFileSync(ugeA, 'x');
    writeFileSync(ugeB, 'x');
    writeFileSync(noise, 'nope');
  });

  it('collects *.uge from a directory and ignores other files', () => {
    const result = expandExtractInputs([ugeDir]);
    expect(result.sources.map((s) => s.label).sort()).toEqual(['a.uge', 'b.UGE']);
    expect(result.skippedUnknown).toEqual([]);
    expect(result.emptyDirs).toEqual([]);
  });

  it('skips unknown file extensions without --from', () => {
    const result = expandExtractInputs([noise]);
    expect(result.sources).toEqual([]);
    expect(result.skippedUnknown).toEqual([noise]);
  });
});

describe('default kit and demo paths', () => {
  it('names the kit next to a single file', () => {
    const uge = join(TMP, 'lead.uge');
    mkdirSync(TMP, { recursive: true });
    writeFileSync(uge, 'x');
    expect(defaultKitPathForInputs([uge])!.replace(/\\/g, '/')).toMatch(/\/lead\.ins$/);
  });

  it('derives {stem}-demo.bax next to the kit', () => {
    expect(defaultDemoPath(join(TMP, 'kit.ins')).replace(/\\/g, '/')).toMatch(/\/kit-demo\.bax$/);
  });
});
