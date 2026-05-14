/**
 * Unit tests for the SN76489 VGM backend.
 *
 * Tests cover:
 *  - validate(): chip acceptance, channel count limits
 *  - translate(): output structure, PSG byte content, clock selection
 *  - buildGd3Fields(): system name selection (SMS / Game Gear), metadata
 *  - headerParams(): clock and rate values for NTSC / PAL
 */

import { resolveBackend } from '../src/backendRegistry.js';
import type { SongLike } from '../src/backends/types.js';
import {
  SN76489_CLOCK_NTSC,
  SN76489_CLOCK_PAL,
  CMD_PSG_WRITE,
  CMD_GG_STEREO,
  VGM_HEADER_SIZE,
} from '../src/constants.js';
import type { VgmBackend } from '../src/backends/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSong(overrides: Partial<SongLike> = {}): SongLike {
  return {
    pats: {},
    seqs: {},
    insts: {
      lead: { name: 'lead', type: 'tone1', vol: 8 } as any,
    },
    channels: [
      {
        id: 1,
        defaultInstrument: 'lead',
        events: [
          { type: 'note', token: 'C4', instrument: 'lead' },
          { type: 'sustain' },
          { type: 'rest' },
        ],
      },
    ],
    bpm: 120,
    chip: 'sms',
    chipRegion: 'ntsc',
    ...overrides,
  };
}

function getSmsBackend(): VgmBackend {
  const backend = resolveBackend('sms');
  if (!backend) throw new Error('SN76489 backend not registered');
  return backend;
}

function extractPsgBytes(dataBytes: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < dataBytes.length - 1; i++) {
    if (dataBytes[i] === CMD_PSG_WRITE) out.push(dataBytes[i + 1]);
  }
  return out;
}

// ─── validate() ──────────────────────────────────────────────────────────────

describe('sn76489VgmBackend.validate', () => {
  it('accepts a minimal SMS song with no errors', () => {
    const backend = getSmsBackend();
    expect(backend.validate(makeSong())).toEqual([]);
  });

  it('accepts gamegear chip alias', () => {
    const backend = getSmsBackend();
    expect(backend.validate(makeSong({ chip: 'gamegear' }))).toEqual([]);
  });

  it('accepts gg chip alias', () => {
    const backend = getSmsBackend();
    expect(backend.validate(makeSong({ chip: 'gg' }))).toEqual([]);
  });

  it('accepts bbc_micro chip alias', () => {
    const backend = getSmsBackend();
    expect(backend.validate(makeSong({ chip: 'bbc_micro' }))).toEqual([]);
  });

  it('rejects unknown chip', () => {
    const backend = getSmsBackend();
    const errors = backend.validate(makeSong({ chip: 'nes' }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/SN76489/i);
  });

  it('rejects song with no channels', () => {
    const backend = getSmsBackend();
    const errors = backend.validate(makeSong({ channels: [] }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/no channels/i);
  });

  it('rejects song with more than 4 channels', () => {
    const backend = getSmsBackend();
    const channels = [1, 2, 3, 4, 5].map(id => ({ id, events: [] }));
    const errors = backend.validate(makeSong({ channels }));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/4 channels/i);
  });

  it('accepts exactly 4 channels', () => {
    const backend = getSmsBackend();
    const channels = [1, 2, 3, 4].map(id => ({ id, events: [] }));
    expect(backend.validate(makeSong({ channels }))).toEqual([]);
  });
});

// ─── translate() ─────────────────────────────────────────────────────────────

describe('sn76489VgmBackend.translate', () => {
  it('returns a non-empty Uint8Array', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong());
    expect(result.dataBytes).toBeInstanceOf(Uint8Array);
    expect(result.dataBytes.length).toBeGreaterThan(0);
  });

  it('data ends with the VGM end-of-data marker (0x66)', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong());
    expect(result.dataBytes[result.dataBytes.length - 1]).toBe(0x66);
  });

  it('totalSamples is a positive integer', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong());
    expect(result.totalSamples).toBeGreaterThan(0);
    expect(Number.isInteger(result.totalSamples)).toBe(true);
  });

  it('uses NTSC clock by default', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong({ chipRegion: 'ntsc' }));
    expect(result.clock).toBe(SN76489_CLOCK_NTSC);
  });

  it('uses PAL clock when chipRegion is pal', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong({ chipRegion: 'pal' }));
    expect(result.clock).toBe(SN76489_CLOCK_PAL);
  });

  it('isGameGear is false for SMS song', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong({ chip: 'sms' }));
    expect(result.isGameGear).toBeFalsy();
  });

  it('isGameGear is true for Game Gear chip', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong({ chip: 'gg' }));
    expect(result.isGameGear).toBe(true);
  });

  it('hasRetrig is false with no retrig effect', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong());
    expect(result.hasRetrig).toBe(false);
  });

  it('emits PSG write commands (0x50) in the data stream', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong());
    const hasPsgWrite = Array.from(result.dataBytes).some(b => b === CMD_PSG_WRITE);
    expect(hasPsgWrite).toBe(true);
  });

  it('emits GG stereo command (0x4F) in the data stream', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong());
    const hasGgStereo = Array.from(result.dataBytes).some(b => b === CMD_GG_STEREO);
    expect(hasGgStereo).toBe(true);
  });

  it('translates a rest-only song without errors', () => {
    const backend = getSmsBackend();
    const song = makeSong({
      channels: [{ id: 1, events: [{ type: 'rest' }] }],
    });
    const result = backend.translate(song);
    expect(result.dataBytes.length).toBeGreaterThan(0);
  });

  it('translates an empty channel (no events) without errors', () => {
    const backend = getSmsBackend();
    const song = makeSong({
      channels: [{ id: 1, events: [] }],
    });
    const result = backend.translate(song);
    expect(result.dataBytes[result.dataBytes.length - 1]).toBe(0x66);
  });

  it('volume attenuation latch bytes use bits[4] set for volume register', () => {
    const backend = getSmsBackend();
    const result = backend.translate(makeSong());
    const psgBytes = extractPsgBytes(result.dataBytes);
    const volBytes = psgBytes.filter(b => (b & 0x90) === 0x90); // latch + vol bit
    expect(volBytes.length).toBeGreaterThan(0);
  });

  it('translate output is deterministic across two calls', () => {
    const backend = getSmsBackend();
    const song = makeSong();
    const r1 = backend.translate(song);
    const r2 = backend.translate(song);
    expect(r1.dataBytes).toEqual(r2.dataBytes);
    expect(r1.totalSamples).toBe(r2.totalSamples);
  });
});

// ─── buildGd3Fields() ────────────────────────────────────────────────────────

describe('sn76489VgmBackend.buildGd3Fields', () => {
  it('returns Sega Master System as system name for SMS chip', () => {
    const backend = getSmsBackend();
    const song = makeSong({ chip: 'sms', metadata: { name: 'Test', artist: 'Artist' } });
    const result = backend.translate(song);
    const gd3 = backend.buildGd3Fields(song, result);
    expect(gd3.systemNameEn).toBe('Sega Master System');
  });

  it('returns Sega Game Gear as system name for GG chip', () => {
    const backend = getSmsBackend();
    const song = makeSong({ chip: 'gg' });
    const result = backend.translate(song);
    const gd3 = backend.buildGd3Fields(song, result);
    expect(gd3.systemNameEn).toBe('Sega Game Gear');
  });

  it('populates trackTitleEn from metadata.name', () => {
    const backend = getSmsBackend();
    const song = makeSong({ metadata: { name: 'My Track' } });
    const result = backend.translate(song);
    const gd3 = backend.buildGd3Fields(song, result);
    expect(gd3.trackTitleEn).toBe('My Track');
  });

  it('populates authorEn from metadata.artist', () => {
    const backend = getSmsBackend();
    const song = makeSong({ metadata: { artist: 'Composer' } });
    const result = backend.translate(song);
    const gd3 = backend.buildGd3Fields(song, result);
    expect(gd3.authorEn).toBe('Composer');
  });

  it('creator field contains BeatBax VGM Exporter', () => {
    const backend = getSmsBackend();
    const song = makeSong();
    const result = backend.translate(song);
    const gd3 = backend.buildGd3Fields(song, result);
    expect(gd3.creator).toMatch(/BeatBax VGM Exporter/);
  });

  it('returns empty strings for missing metadata', () => {
    const backend = getSmsBackend();
    const song = makeSong({ metadata: undefined });
    const result = backend.translate(song);
    const gd3 = backend.buildGd3Fields(song, result);
    expect(gd3.trackTitleEn).toBe('');
    expect(gd3.authorEn).toBe('');
  });
});

// ─── headerParams() ──────────────────────────────────────────────────────────

describe('sn76489VgmBackend.headerParams', () => {
  it('sets sn76489Clock to the NTSC clock for ntsc region', () => {
    const backend = getSmsBackend();
    const song = makeSong({ chipRegion: 'ntsc' });
    const result = backend.translate(song);
    const params = backend.headerParams(song, result);
    expect(params.sn76489Clock).toBe(SN76489_CLOCK_NTSC);
  });

  it('sets sn76489Clock to the PAL clock for pal region', () => {
    const backend = getSmsBackend();
    const song = makeSong({ chipRegion: 'pal' });
    const result = backend.translate(song);
    const params = backend.headerParams(song, result);
    expect(params.sn76489Clock).toBe(SN76489_CLOCK_PAL);
  });

  it('sets rate to 60 for NTSC', () => {
    const backend = getSmsBackend();
    const song = makeSong({ chipRegion: 'ntsc' });
    const result = backend.translate(song);
    const params = backend.headerParams(song, result);
    expect(params.rate).toBe(60);
  });

  it('sets rate to 50 for PAL', () => {
    const backend = getSmsBackend();
    const song = makeSong({ chipRegion: 'pal' });
    const result = backend.translate(song);
    const params = backend.headerParams(song, result);
    expect(params.rate).toBe(50);
  });

  it('defaults to NTSC rate when chipRegion is unspecified', () => {
    const backend = getSmsBackend();
    const song = makeSong({ chipRegion: undefined });
    const result = backend.translate(song);
    const params = backend.headerParams(song, result);
    expect(params.rate).toBe(60);
  });
});

// ─── chipAliases ─────────────────────────────────────────────────────────────

describe('sn76489VgmBackend.chipAliases', () => {
  it('includes standard SMS aliases', () => {
    const backend = getSmsBackend();
    expect(backend.chipAliases).toContain('sms');
    expect(backend.chipAliases).toContain('gamegear');
    expect(backend.chipAliases).toContain('gg');
  });

  it('includes extended platform aliases', () => {
    const backend = getSmsBackend();
    expect(backend.chipAliases).toContain('bbc_micro');
    expect(backend.chipAliases).toContain('colecovision');
    expect(backend.chipAliases).toContain('tandy_1000');
  });
});
