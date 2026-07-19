/**
 * Arkos Tracker 3 exporter plugin for BeatBax.
 *
 * Exports Spectrum-128 / Amstrad CPC songs to:
 * - `.aks` — full song (AT3 formatVersion 3.0 plain XML) — default
 * - `.aki` — instrument bank only — when `options.instrumentBank` is true
 *
 * Instruments are embedded in the `.aks`; the `.aki` is an optional extract for
 * reuse in other Arkos songs. Desktop/CLI song export both write `.aks` only.
 *
 * @module @beatbax/plugin-exporter-arkos
 */

import type { ExporterPlugin, ExportOptions } from '@beatbax/engine';
import { lowerToArkos } from './arkos-lowering.js';
import { serializeAks } from './arkos-serialize-aks.js';
import { serializeAki } from './arkos-serialize-aki.js';
import type { SongLike } from './arkos-types.js';
import { ARKOS_SUPPORTED_CHIPS } from './arkos-types.js';
import { validateArkosExport } from './validate-export.js';
import { version } from './version.js';

/** Local mirror of engine ExportPayload (keeps tsc happy with moduleResolution: node). */
interface ExportPayload {
  data: string | Uint8Array | ArrayBuffer;
  filename?: string;
  mimeType?: string;
}

function asSongLike(song: Parameters<ExporterPlugin['export']>[0]): SongLike {
  return song as unknown as SongLike;
}

function resolveAksPath(outputPath: string): string {
  if (/\.aks$/i.test(outputPath)) return outputPath;
  if (/\.aki$/i.test(outputPath)) return outputPath.replace(/\.aki$/i, '.aks');
  return `${outputPath}.aks`;
}

function resolveAkiPath(outputPath: string): string {
  if (/\.aki$/i.test(outputPath)) return outputPath;
  if (/\.aks$/i.test(outputPath)) return outputPath.replace(/\.aks$/i, '.aki');
  return `${outputPath}.aki`;
}

function defaultStem(song: SongLike): string {
  return (
    (song.metadata?.name || 'song')
      .toLowerCase()
      .replace(/[^\w.-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'song'
  );
}

async function writeUtf8File(path: string, contents: string): Promise<void> {
  // Dynamic import keeps this package browser-safe when outputPath is omitted.
  const fs = await import('node:fs');
  fs.writeFileSync(path, contents, 'utf8');
}

export async function exportArkos(
  song: SongLike,
  options?: ExportOptions,
): Promise<ExportPayload | void> {
  const errors = validateArkosExport(song);
  if (errors.length > 0) {
    throw new Error(`Arkos export failed: ${errors.join('; ')}`);
  }

  const model = lowerToArkos(song);
  const instrumentBank = options?.instrumentBank === true;
  const xml = instrumentBank ? serializeAki(model) : serializeAks(model);
  const ext = instrumentBank ? 'aki' : 'aks';

  if (options?.outputPath) {
    const outPath = instrumentBank
      ? resolveAkiPath(options.outputPath)
      : resolveAksPath(options.outputPath);
    await writeUtf8File(outPath, xml);
    return;
  }

  // UI ExportManager prefers the open .bax basename when present; this is only
  // a fallback for direct/API downloads.
  return {
    data: xml,
    filename: `${defaultStem(song)}.${ext}`,
    mimeType: 'application/xml',
  };
}

export const arkosExporterPlugin: ExporterPlugin = {
  id: 'arkos',
  label: 'Arkos Tracker 3',
  version,
  extension: 'aks',
  mimeType: 'application/xml',
  supportedChips: [...ARKOS_SUPPORTED_CHIPS],
  validate(song): string[] {
    return validateArkosExport(asSongLike(song));
  },
  async export(song, options): Promise<ExportPayload | void> {
    return exportArkos(asSongLike(song), options);
  },
  uiContributions: {
    toolbarLabel: 'AKS',
    // Must match a key in apps/*/utils/icons.ts (Heroicons outline set).
    toolbarIcon: 'document-text',
  },
};

export default arkosExporterPlugin;

export { lowerToArkos } from './arkos-lowering.js';
export { serializeAks } from './arkos-serialize-aks.js';
export { serializeAki } from './arkos-serialize-aki.js';
export { validateArkosExport } from './validate-export.js';
export { noteToArkos } from './arkos-notes.js';
export type { ArkosSong, SongLike } from './arkos-types.js';
