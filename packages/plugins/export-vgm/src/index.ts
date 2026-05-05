/**
 * VGM (Video Game Music) exporter plugin for BeatBax.
 *
 * Exports SMS/Game Gear songs to the VGM 1.61 format for the SN76489 PSG.
 * Only supports chip=sms songs; will throw for other chip types.
 *
 * Features:
 *  - Full PSG register simulation (tone + noise channels)
 *  - vol_env, arp_env, pitch_env, noise_rate_env macros
 *  - Effects: vib, port, arp, trem, cut, retrig, bend, pitch_env (inline)
 *  - Game Gear stereo (0x4F command)
 *  - GD3 metadata tag
 *  - NTSC (3.579545 MHz) and PAL (3.546895 MHz) clock support
 *
 * Integration:
 *  This plugin is declared in `@beatbax/plugin-chip-sms` via `exporterPlugins`.
 *  Installing the SMS plugin is sufficient to make `beatbax export vgm` available.
 *
 * @module @beatbax/plugin-exporter-vgm
 */

import type { ExporterPlugin, ExportOptions } from '@beatbax/engine';
import { version } from './version.js';
import { ismToVgm, type SongLike } from './ismToVgm.js';
import { buildGd3, type Gd3Fields } from './gd3.js';
import { assembleVgm, type VgmHeaderParams } from './vgmWriter.js';

// ─── Chip support ─────────────────────────────────────────────────────────────

const SUPPORTED_CHIPS = new Set(['sms', 'gamegear', 'game gear', 'gg']);

function normChip(chip: string): string {
  return chip.toLowerCase().replace(/[\s_-]/g, '');
}

function isSupportedChip(chip: string): boolean {
  const n = normChip(chip);
  return SUPPORTED_CHIPS.has(n) || n.includes('sms') || n.includes('gamegear');
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateForVgm(song: SongLike): string[] {
  const errors: string[] = [];

  if (!song.chip || !isSupportedChip(song.chip)) {
    errors.push(
      `VGM exporter only supports chip=sms (SN76489 PSG). Found chip=${JSON.stringify(song.chip)}.`
    );
  }

  if (song.channels.length === 0) {
    errors.push('Song has no channels.');
  }

  if (song.channels.length > 4) {
    errors.push(
      `SMS has 4 PSG channels but ${song.channels.length} channels are defined.`
    );
  }

  return errors;
}

// ─── GD3 helpers ─────────────────────────────────────────────────────────────

function buildGd3Fields(song: SongLike, hasRetrig: boolean, isGG: boolean): Gd3Fields {
  const meta = song.metadata ?? {};
  const name   = meta.name   ?? '';
  const artist = meta.artist ?? '';
  const noteParts: string[] = [];
  if (meta.description) noteParts.push(meta.description);
  if (hasRetrig) noteParts.push('[BeatBax] retrig effect used: SN76489 phase reset on period rewrite is emulation-dependent. Behaviour may differ between VGM players and real hardware.');

  const systemName = isGG ? 'Sega Game Gear' : 'Sega Master System';

  return {
    trackTitleEn: String(name),
    gameNameEn:   String(name),
    systemNameEn: systemName,
    authorEn:     String(artist),
    date:         '',
    creator:      `BeatBax VGM Exporter v${version}`,
    notes:        noteParts.join(' '),
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Export the song ISM to a VGM binary buffer.
 */
function exportVgm(song: SongLike, options?: ExportOptions): Uint8Array {
  const warn = options?.onWarn ?? (() => {});

  const errors = validateForVgm(song);
  if (errors.length > 0) {
    throw new Error(`VGM export failed: ${errors.join('; ')}`);
  }

  // Translate ISM to VGM data
  const { dataBytes, totalSamples, hasRetrig, clock, isGameGear } = ismToVgm(song);

  // Build GD3 tag
  const gd3Fields = buildGd3Fields(song, hasRetrig, isGameGear);
  const gd3Block = buildGd3(gd3Fields);

  // Determine rate (60 NTSC / 50 PAL)
  const region = String(song.chipRegion ?? '').toLowerCase();
  const rate = region === 'pal' ? 50 : 60;

  const headerParams: VgmHeaderParams = {
    sn76489Clock: clock,
    rate,
  };

  let vgmFile = assembleVgm(headerParams, dataBytes, gd3Block, totalSamples);

  // Add VGM magic number header if missing (required by VGM players)
  if (vgmFile.length < 4 ||
      vgmFile[0] !== 0x56 ||
      vgmFile[1] !== 0x67 ||
      vgmFile[2] !== 0x6d ||
      vgmFile[3] !== 0x20) {
    const header = new Uint8Array([0x56, 0x67, 0x6d, 0x20]);
    const newFile = new Uint8Array(vgmFile.length + header.length);
    newFile.set(header);
    newFile.set(vgmFile, header.length);
    vgmFile = newFile;
  }

  if (hasRetrig) {
    warn('Song uses the retrig effect. VGM export does not fully replicate retrig timing; exported file may sound slightly different from playback.');
  }

  return vgmFile;
}

// ─── Plugin definition ────────────────────────────────────────────────────────

const vgmExporterPlugin: ExporterPlugin = {
  id: 'vgm',
  label: 'VGM (Video Game Music)',
  version,
  extension: 'vgm',
  mimeType: 'audio/x-vgm',
  supportedChips: [...SUPPORTED_CHIPS],

  validate(song): string[] {
    return validateForVgm(song as unknown as SongLike);
  },

  export(song, options): Uint8Array {
    return exportVgm(song as unknown as SongLike, options);
  },
};

export default vgmExporterPlugin;
export { exportVgm, validateForVgm };
