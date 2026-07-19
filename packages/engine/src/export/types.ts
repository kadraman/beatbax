import { SongModel } from '../song/songModel.js';

/**
 * Structured exporter return value. Preferred future shape for `ExporterPlugin.export()`.
 * Raw `string`, `Uint8Array`, and `ArrayBuffer` returns remain supported during migration.
 */
export interface ExportPayload {
  data: string | Uint8Array | ArrayBuffer;
  filename?: string;
  mimeType?: string;
}

export interface ExportOptions {
  /**
   * Target filesystem path for Node.js / CLI adapters.
   * UI callers should omit this and consume the returned payload instead.
   */
  outputPath?: string;
  sourcePath?: string;
  duration?: number;
  channels?: number[];
  bitDepth?: 16 | 24 | 32;
  normalize?: boolean;
  sampleRate?: number;
  strictGb?: boolean;
  debug?: boolean;
  verbose?: boolean;
  /** Optional callback provided by chip plugins to resolve sampled asset refs (e.g. NES DMC). */
  resolveSampleAsset?: (ref: string) => Promise<ArrayBuffer>;
  /** Optional warning sink used by exporters to surface non-fatal export diagnostics to callers. */
  onWarn?: (message: string) => void;
  /**
   * Arkos exporter: when true, export the instrument bank (`.aki`) instead of the
   * full song (`.aks`). Default song export does not write a companion bank —
   * instruments are already embedded in the `.aks`.
   */
  instrumentBank?: boolean;
}

export interface ExporterUIContribution {
  toolbarLabel?: string;
  toolbarIcon?: string;
}

/**
 * BeatBax exporter plugin contract.
 *
 * Payload-first behavior:
 * - When `options.outputPath` is omitted, `export()` should return downloadable data
 *   (`ExportPayload`, `string`, `Uint8Array`, or `ArrayBuffer`).
 * - When `options.outputPath` is provided, CLI/Node adapters may either write the file
 *   directly or return a payload for the caller to persist.
 * - Returning `void`/`undefined` is valid only when the exporter already wrote to
 *   `options.outputPath`.
 */
export interface ExporterPlugin {
  id: string;
  label: string;
  version: string;
  extension: string;
  mimeType: string;
  supportedChips: string[];
  export(
    song: SongModel,
    options?: ExportOptions,
  ):
    | Promise<ExportPayload | Uint8Array | ArrayBuffer | string | void>
    | ExportPayload
    | Uint8Array
    | ArrayBuffer
    | string
    | void;
  validate?(song: SongModel): string[];
  uiContributions?: ExporterUIContribution;
}
