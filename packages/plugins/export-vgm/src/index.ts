/**
 * VGM (Video Game Music) exporter plugin for BeatBax — multi-chip dispatcher.
 *
 * Exports songs to the VGM 1.61 format. Supports multiple chip backends:
 *  - SMS / Game Gear (SN76489 PSG) — fully implemented
 *  - AY-3-8910 / YM2149             — stub (planned)
 *
 * The exporter id stays "vgm" regardless of chip. Adding a new chip backend
 * does not require changes to this file.
 *
 * Integration:
 *  This plugin is declared in `@beatbax/plugin-chip-sms` via `exporterPlugins`.
 *  Installing the SMS plugin is sufficient to make `beatbax export vgm` available.
 *
 * @module @beatbax/plugin-exporter-vgm
 */

import type { ExporterPlugin, ExportOptions } from '@beatbax/engine';
import { version } from './version.js';
import type { SongLike } from './backends/types.js';
import { buildGd3 } from './gd3.js';
import { assembleVgm } from './vgmWriter.js';
import {
  resolveBackend,
  listRegisteredAliases,
  missingBackendError,
} from './backendRegistry.js';

// ─── Validation ───────────────────────────────────────────────────────────────

function validateForVgm(song: SongLike): string[] {
  const chip = song.chip ?? '';
  const backend = resolveBackend(chip);
  if (!backend) {
    return [missingBackendError(chip)];
  }
  return backend.validate(song);
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportVgm(song: SongLike, options?: ExportOptions): Uint8Array {
  const warn = options?.onWarn ?? (() => {});

  const chip = song.chip ?? '';
  const backend = resolveBackend(chip);
  if (!backend) {
    throw new Error(missingBackendError(chip));
  }

  const errors = backend.validate(song);
  if (errors.length > 0) {
    throw new Error(`VGM export failed: ${errors.join('; ')}`);
  }

  // Translate ISM to VGM data
  const result = backend.translate(song);

  // Build GD3 tag
  const gd3Fields = backend.buildGd3Fields(song, result);
  const gd3Block = buildGd3(gd3Fields);

  // Build header parameters
  const headerParams = backend.headerParams(song, result);

  let vgmFile = assembleVgm(headerParams, result.dataBytes, gd3Block, result.totalSamples);

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

  if (result.hasRetrig) {
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

  get supportedChips(): string[] {
    return listRegisteredAliases();
  },

  validate(song): string[] {
    return validateForVgm(song as unknown as SongLike);
  },

  export(song, options): Uint8Array {
    return exportVgm(song as unknown as SongLike, options);
  },
};

export default vgmExporterPlugin;
export { exportVgm, validateForVgm };
export type { SongLike } from './backends/types.js';
