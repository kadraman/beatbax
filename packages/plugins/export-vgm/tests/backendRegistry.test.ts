/**
 * Unit tests for the VGM backend registry.
 */

import {
  normaliseAlias,
  resolveBackend,
  listRegisteredAliases,
  missingBackendError,
  listBackends,
} from '../src/backendRegistry.js';

describe('normaliseAlias', () => {
  it('converts to lowercase', () => {
    expect(normaliseAlias('SMS')).toBe('sms');
    expect(normaliseAlias('GameGear')).toBe('gamegear');
  });

  it('strips spaces', () => {
    expect(normaliseAlias('game gear')).toBe('gamegear');
    expect(normaliseAlias('AY 3 8910')).toBe('ay38910');
  });

  it('strips hyphens', () => {
    expect(normaliseAlias('AY-3-8910')).toBe('ay38910');
  });

  it('strips underscores', () => {
    expect(normaliseAlias('sn_76489')).toBe('sn76489');
  });

  it('handles empty string', () => {
    expect(normaliseAlias('')).toBe('');
  });
});

describe('resolveBackend — SMS aliases', () => {
  it('resolves "sms"', () => {
    const backend = resolveBackend('sms');
    expect(backend).toBeDefined();
    expect(backend!.chipAliases).toContain('sms');
  });

  it('resolves "gamegear"', () => {
    const backend = resolveBackend('gamegear');
    expect(backend).toBeDefined();
    expect(backend!.chipAliases).toContain('gamegear');
  });

  it('resolves "gg"', () => {
    const backend = resolveBackend('gg');
    expect(backend).toBeDefined();
  });

  it('resolves case-insensitive "SMS"', () => {
    const backend = resolveBackend('SMS');
    expect(backend).toBeDefined();
  });

  it('resolves "game gear" (with space) to SMS backend via normalisation', () => {
    // 'game gear' normalises to 'gamegear' which is a registered alias
    const backend = resolveBackend('game gear');
    expect(backend).toBeDefined();
    expect(resolveBackend('gamegear')).toBe(backend);
  });

  it('SMS and gamegear aliases return the same backend instance', () => {
    const sms = resolveBackend('sms');
    const gg = resolveBackend('gamegear');
    expect(sms).toBe(gg);
  });

  it('resolves "bbc_micro"', () => {
    const backend = resolveBackend('bbc_micro');
    expect(backend).toBeDefined();
    expect(backend!.chipAliases).toContain('bbc_micro');
  });

  it('resolves "colecovision"', () => {
    const backend = resolveBackend('colecovision');
    expect(backend).toBeDefined();
    expect(backend!.chipAliases).toContain('colecovision');
  });

  it('resolves "tandy_1000"', () => {
    const backend = resolveBackend('tandy_1000');
    expect(backend).toBeDefined();
    expect(backend!.chipAliases).toContain('tandy_1000');
  });

  it('validate accepts normalized underscore aliases', () => {
    const bbc = resolveBackend('bbc_micro');
    const tandy = resolveBackend('tandy_1000');

    const baseSong = {
      pats: {}, insts: {}, seqs: {},
      channels: [{ id: 1, events: [] }],
    };

    const bbcErrors = bbc!.validate({ ...baseSong, chip: 'bbc_micro' });
    const tandyErrors = tandy!.validate({ ...baseSong, chip: 'tandy_1000' });

    expect(bbcErrors).toEqual([]);
    expect(tandyErrors).toEqual([]);
  });
});

describe('resolveBackend — AY aliases', () => {
  it('resolves "ay"', () => {
    const backend = resolveBackend('ay');
    expect(backend).toBeDefined();
    expect(backend!.chipAliases).toContain('ay');
  });

  it('resolves "ym2149"', () => {
    const backend = resolveBackend('ym2149');
    expect(backend).toBeDefined();
  });

  it('resolves "ay38910"', () => {
    const backend = resolveBackend('ay38910');
    expect(backend).toBeDefined();
  });

  it('AY backend validate returns unsupported error', () => {
    const backend = resolveBackend('ay');
    const errors = backend!.validate({
      pats: {}, insts: {}, seqs: {},
      channels: [{ id: 1, events: [] }],
      chip: 'ay',
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/AY-3-8910/i);
  });
});

describe('resolveBackend — unknown chip', () => {
  it('returns undefined for unknown chip', () => {
    expect(resolveBackend('gameboy')).toBeUndefined();
    expect(resolveBackend('c64sid')).toBeUndefined();
    expect(resolveBackend('')).toBeUndefined();
  });
});

describe('listRegisteredAliases', () => {
  it('includes SN76489 platform aliases', () => {
    const aliases = listRegisteredAliases();
    expect(aliases).toContain('sms');
    expect(aliases).toContain('gg');
    expect(aliases).toContain('gamegear');
    expect(aliases).toContain('bbcmicro');
    expect(aliases).toContain('colecovision');
    expect(aliases).toContain('tandy1000');
  });

  it('includes ay aliases', () => {
    const aliases = listRegisteredAliases();
    expect(aliases).toContain('ay');
    expect(aliases).toContain('ym2149');
  });

  it('returns a sorted array', () => {
    const aliases = listRegisteredAliases();
    const sorted = [...aliases].sort();
    expect(aliases).toEqual(sorted);
  });
});

describe('listBackends', () => {
  it('returns unique backend instances', () => {
    const backends = listBackends();
    const unique = new Set(backends);
    expect(backends.length).toBe(unique.size);
  });

  it('includes SMS and AY backends', () => {
    const backends = listBackends();
    const allAliases = backends.flatMap(b => [...b.chipAliases]);
    expect(allAliases).toContain('sms');
    expect(allAliases).toContain('ay');
  });
});

describe('missingBackendError', () => {
  it('includes the chip name in the message', () => {
    const msg = missingBackendError('gameboy');
    expect(msg).toMatch(/gameboy/);
    expect(msg).toMatch(/no VGM backend registered/i);
  });

  it('lists available backends', () => {
    const msg = missingBackendError('unknown');
    expect(msg).toMatch(/Available backends:/i);
    expect(msg).toMatch(/sms/);
  });
});
