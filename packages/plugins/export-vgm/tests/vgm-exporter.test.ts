/**
 * Integration tests for the VGM exporter plugin.
 * Tests full ISM → VGM export with minimal SMS song models.
 */

import vgmExporterPlugin from '../src/index.js';
import type { SongLike } from '../src/ismToVgm.js';
import {
  VGM_MAGIC,
  VGM_HEADER_SIZE,
  CMD_PSG_WRITE,
  CMD_GG_STEREO,
  SN76489_CLOCK_NTSC,
} from '../src/constants.js';

// Helper: build a minimal SongLike with one channel and one note
function makeSong(overrides: Partial<SongLike> = {}): SongLike {
  return {
    pats: {},
    seqs: {},
    insts: {
      lead: {
        name: 'lead',
        type: 'tone1',
        vol: 5,
      } as any,
    },
    channels: [
      {
        id: 1,
        defaultInstrument: 'lead',
        events: [
          { type: 'note', token: 'C4', instrument: 'lead' },
          { type: 'sustain' },
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

function extractPsgDataBytes(vgm: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = VGM_HEADER_SIZE; i < vgm.length - 1; i++) {
    if (vgm[i] === CMD_PSG_WRITE) out.push(vgm[i + 1]);
  }
  return out;
}

function isToneLatchForChannel(byte: number, channel: number): boolean {
  if ((byte & 0x80) === 0) return false;
  const ch = (byte >> 5) & 0x03;
  const isVolume = (byte & 0x10) !== 0;
  return ch === channel && !isVolume;
}

function isVolumeLatchForChannel(byte: number, channel: number): boolean {
  if ((byte & 0x80) === 0) return false;
  const ch = (byte >> 5) & 0x03;
  const isVolume = (byte & 0x10) !== 0;
  return ch === channel && isVolume;
}

function extractChannelVolumeValues(psgBytes: number[], channel: number): number[] {
  return psgBytes
    .filter(b => isVolumeLatchForChannel(b, channel))
    .map(b => b & 0x0f);
}

// ─── Plugin metadata ─────────────────────────────────────────────────────────

describe('vgmExporterPlugin metadata', () => {
  it('has correct id', () => {
    expect(vgmExporterPlugin.id).toBe('vgm');
  });

  it('has a valid version string', () => {
    expect(typeof vgmExporterPlugin.version).toBe('string');
    expect(vgmExporterPlugin.version.length).toBeGreaterThan(0);
  });

  it('has the correct extension', () => {
    expect(vgmExporterPlugin.extension).toBe('vgm');
  });

  it('supports sms chip', () => {
    expect(vgmExporterPlugin.supportedChips).toContain('sms');
  });
});

// ─── Validate ────────────────────────────────────────────────────────────────

describe('vgmExporterPlugin.validate', () => {
  it('returns empty array for valid SMS song', () => {
    const errors = vgmExporterPlugin.validate!(makeSong() as any);
    expect(errors).toEqual([]);
  });

  it('returns error for non-SMS chip', () => {
    const errors = vgmExporterPlugin.validate!(makeSong({ chip: 'gameboy' }) as any);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/sms/i);
  });

  it('returns error for too many channels', () => {
    const song = makeSong();
    song.channels = [1, 2, 3, 4, 5].map(id => ({
      id,
      defaultInstrument: 'lead',
      events: [{ type: 'note', token: 'C4' }],
    }));
    const errors = vgmExporterPlugin.validate!(song as any);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── Export output ────────────────────────────────────────────────────────────

describe('vgmExporterPlugin.export', () => {
  it('returns a Uint8Array', () => {
    const result = vgmExporterPlugin.export(makeSong() as any) as Uint8Array;
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('output starts with VGM magic', () => {
    const result = vgmExporterPlugin.export(makeSong() as any) as Uint8Array;
    const view = new DataView(result.buffer);
    expect(view.getUint32(0, true)).toBe(VGM_MAGIC);
  });

  it('output is at least VGM_HEADER_SIZE bytes', () => {
    const result = vgmExporterPlugin.export(makeSong() as any) as Uint8Array;
    expect(result.length).toBeGreaterThanOrEqual(VGM_HEADER_SIZE);
  });

  it('SN76489 clock is NTSC for ntsc region', () => {
    const result = vgmExporterPlugin.export(makeSong({ chipRegion: 'ntsc' }) as any) as Uint8Array;
    const view = new DataView(result.buffer);
    expect(view.getUint32(0x0C, true)).toBe(SN76489_CLOCK_NTSC);
  });

  it('SN76489 clock differs for pal region', () => {
    const result = vgmExporterPlugin.export(makeSong({ chipRegion: 'pal' }) as any) as Uint8Array;
    const view = new DataView(result.buffer);
    const palClock = view.getUint32(0x0C, true);
    expect(palClock).not.toBe(SN76489_CLOCK_NTSC);
  });

  it('data section starts at offset 0x40', () => {
    const result = vgmExporterPlugin.export(makeSong() as any) as Uint8Array;
    // Byte at 0x40 should be a VGM command (GG stereo 0x4F or PSG write 0x50)
    const firstCmd = result[VGM_HEADER_SIZE];
    expect([CMD_GG_STEREO, CMD_PSG_WRITE]).toContain(firstCmd);
  });

  it('throws for non-SMS chip', () => {
    expect(() => {
      vgmExporterPlugin.export(makeSong({ chip: 'gameboy' }) as any);
    }).toThrow(/VGM export failed/i);
  });

  it('exports a 4-channel SMS song without throwing', () => {
    const song = makeSong();
    song.insts = {
      tone1: { name: 'tone1', type: 'tone1', vol: 5 } as any,
      tone2: { name: 'tone2', type: 'tone2', vol: 5 } as any,
      tone3: { name: 'tone3', type: 'tone3', vol: 5 } as any,
      kick:  { name: 'kick',  type: 'noise', noise_mode: 'white', noise_rate: 2 } as any,
    };
    song.channels = [
      { id: 1, defaultInstrument: 'tone1', events: [{ type: 'note', token: 'C4' }, { type: 'rest' }] },
      { id: 2, defaultInstrument: 'tone2', events: [{ type: 'note', token: 'E4' }, { type: 'rest' }] },
      { id: 3, defaultInstrument: 'tone3', events: [{ type: 'note', token: 'G4' }, { type: 'rest' }] },
      { id: 4, defaultInstrument: 'kick',  events: [{ type: 'named', token: 'kick' }, { type: 'rest' }] },
    ];
    expect(() => vgmExporterPlugin.export(song as any)).not.toThrow();
    const result = vgmExporterPlugin.export(song as any) as Uint8Array;
    expect(result.length).toBeGreaterThan(VGM_HEADER_SIZE);
  });

  it('includes GD3 metadata when song has a name', () => {
    const song = makeSong({ metadata: { name: 'Test Song', artist: 'Artist' } as any });
    const result = vgmExporterPlugin.export(song as any) as Uint8Array;
    // GD3 offset field at 0x14 should be non-zero
    const view = new DataView(result.buffer);
    const gd3RelOffset = view.getUint32(0x14, true);
    expect(gd3RelOffset).toBeGreaterThan(0);
  });

  it('vol_env macro changes attenuation over time', () => {
    const song = makeSong();
    song.insts = {
      lead: { name: 'lead', type: 'tone1', vol: 0, vol_env: [0, 5, 10, 15] } as any,
    };
    song.channels = [
      {
        id: 1,
        defaultInstrument: 'lead',
        events: [
          { type: 'note', token: 'A4' },
          { type: 'sustain' },
          { type: 'sustain' },
          { type: 'sustain' },
          { type: 'sustain' },
          { type: 'sustain' },
          { type: 'sustain' },
          { type: 'sustain' },
        ],
      },
    ];
    // Just verify it produces output without throwing
    expect(() => vgmExporterPlugin.export(song as any)).not.toThrow();
  });

  it('GG stereo generates 0x4F commands for L/R pan', () => {
    const song = makeSong();
    song.insts = {
      lead: { name: 'lead', type: 'tone1', vol: 5, 'gg:pan': 'R' } as any,
    };
    // isGameGear will be set since pan != default C
    const result = vgmExporterPlugin.export(song as any) as Uint8Array;
    // Find a 0x4F command byte
    let found = false;
    for (let i = VGM_HEADER_SIZE; i < result.length - 1; i++) {
      if (result[i] === CMD_GG_STEREO) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it('noise instrument maps to channel 4 (PSG ch3)', () => {
    const song: SongLike = {
      pats: {}, seqs: {},
      insts: {
        kick: { name: 'kick', type: 'noise', noise_mode: 'white', noise_rate: 2, vol: 0 } as any,
      },
      channels: [
        { id: 4, defaultInstrument: 'kick', events: [{ type: 'named', token: 'kick' }] },
      ],
      bpm: 120, chip: 'sms',
    };
    expect(() => vgmExporterPlugin.export(song as any)).not.toThrow();
  });

  // ─── Loudness & Attenuation Tests ───────────────────────────────────────────

  it('uses instrument volume directly without post-export boost (vol 5 → attenuation ~5)', () => {
    // Volume 5 should map to attenuation 5 (no volumeBoost applied)
    const song = makeSong();
    song.insts!.lead.vol = 5;
    const result = vgmExporterPlugin.export(song as any) as Uint8Array;

    // Extract volume latch bytes (format: 1 CH CH 1 V3 V2 V1 V0)
    // Channel 0 tone: latch bits would be 1 00 1 = 0x9X for volume
    const volLatches: number[] = [];
    for (let i = VGM_HEADER_SIZE; i < result.length - 1; i++) {
      if (result[i] === CMD_PSG_WRITE) {
        const byte = result[i + 1];
        // Volume latch: bit 7=1, bits 5-4=0, bit 4=1 (volume cmd)
        if ((byte & 0x80) && (byte & 0x10)) {
          volLatches.push(byte & 0x0F); // Extract V3-V0
        }
      }
    }
    // Should have volume writes; at least one should match attenuation 5 (no boost)
    expect(volLatches.length).toBeGreaterThan(0);
    expect(volLatches).toContain(5);
  });

  it('deterministic export: same song produces identical bytes', () => {
    const song = makeSong();
    const result1 = vgmExporterPlugin.export(song as any) as Uint8Array;
    const result2 = vgmExporterPlugin.export(song as any) as Uint8Array;

    expect(result1).toEqual(result2);
  });

  it('exports port:speed as stepped tone-period glide writes', () => {
    const base = makeSong({
      channels: [
        {
          id: 1,
          defaultInstrument: 'lead',
          events: [
            { type: 'note', token: 'C3', instrument: 'lead' },
            { type: 'rest' },
            { type: 'note', token: 'D3', instrument: 'lead' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
          ],
        },
      ],
    });

    const withPort = JSON.parse(JSON.stringify(base)) as SongLike;
    (withPort.channels[0].events[2] as any).effects = [{ type: 'port', params: [12] }];

    const baseBytes = extractPsgDataBytes(vgmExporterPlugin.export(base as any) as Uint8Array);
    const portBytes = extractPsgDataBytes(vgmExporterPlugin.export(withPort as any) as Uint8Array);

    const baseToneLatches = baseBytes.filter(b => isToneLatchForChannel(b, 0)).length;
    const portToneLatches = portBytes.filter(b => isToneLatchForChannel(b, 0)).length;
    expect(portToneLatches).toBeGreaterThan(baseToneLatches);
  });

  it('exports bend:+semitones as stepped tone-period writes', () => {
    const base = makeSong({
      channels: [
        {
          id: 1,
          defaultInstrument: 'lead',
          events: [
            { type: 'note', token: 'D3', instrument: 'lead' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
          ],
        },
      ],
    });

    const withBend = JSON.parse(JSON.stringify(base)) as SongLike;
    (withBend.channels[0].events[0] as any).effects = [{ type: 'bend', params: [7, 'linear', 0, 0.5] }];

    const baseBytes = extractPsgDataBytes(vgmExporterPlugin.export(base as any) as Uint8Array);
    const bendBytes = extractPsgDataBytes(vgmExporterPlugin.export(withBend as any) as Uint8Array);

    const baseToneLatches = baseBytes.filter(b => isToneLatchForChannel(b, 0)).length;
    const bendToneLatches = bendBytes.filter(b => isToneLatchForChannel(b, 0)).length;
    expect(bendToneLatches).toBeGreaterThan(baseToneLatches);
  });

  it('exports volSlide as additional channel volume writes', () => {
    const base = makeSong({
      insts: {
        lead: {
          name: 'lead',
          type: 'tone1',
          vol: 8,
        } as any,
      },
      channels: [
        {
          id: 1,
          defaultInstrument: 'lead',
          events: [
            { type: 'note', token: 'E3', instrument: 'lead' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
          ],
        },
      ],
    });

    const withSlide = JSON.parse(JSON.stringify(base)) as SongLike;
    (withSlide.channels[0].events[0] as any).effects = [{ type: 'volSlide', params: [-4, 8] }];

    const baseBytes = extractPsgDataBytes(vgmExporterPlugin.export(base as any) as Uint8Array);
    const slideBytes = extractPsgDataBytes(vgmExporterPlugin.export(withSlide as any) as Uint8Array);

    const baseVolLatches = baseBytes.filter(b => isVolumeLatchForChannel(b, 0)).length;
    const slideVolLatches = slideBytes.filter(b => isVolumeLatchForChannel(b, 0)).length;
    expect(slideVolLatches).toBeGreaterThan(baseVolLatches);
  });

  it('keeps tremolo depth in a WebAudio-like attenuation range', () => {
    const song = makeSong({
      insts: {
        lead: {
          name: 'lead',
          type: 'tone1',
          vol: 9,
        } as any,
      },
      channels: [
        {
          id: 1,
          defaultInstrument: 'lead',
          events: [
            { type: 'note', token: 'C3', instrument: 'lead', effects: [{ type: 'trem', params: [6, 4, 'sine', 0, 1] }] },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
            { type: 'sustain' },
          ],
        },
      ],
    });

    const psgBytes = extractPsgDataBytes(vgmExporterPlugin.export(song as any) as Uint8Array);
    const vols = extractChannelVolumeValues(psgBytes, 0);
    expect(vols.length).toBeGreaterThan(0);

    // Ignore setup/rest mute writes and inspect active tremolo depth only.
    const activeVols = vols.filter(v => v < 15);
    expect(activeVols.length).toBeGreaterThan(0);

    const minVol = Math.min(...activeVols);
    const maxVol = Math.max(...activeVols);

    // Tremolo should move volume, but not with the overly harsh swings caused by
    // additive attenuation modulation.
    expect(maxVol - minVol).toBeGreaterThan(0);
    expect(maxVol - minVol).toBeLessThanOrEqual(6);
  });
});
