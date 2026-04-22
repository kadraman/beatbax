import { SongModel } from '../song/songModel.js';

export interface ExportOptions {
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
}

export interface ExporterUIContribution {
  toolbarLabel?: string;
  toolbarIcon?: string;
}

export interface ExporterPlugin {
  id: string;
  label: string;
  version: string;
  extension: string;
  mimeType: string;
  supportedChips: string[];
  export(song: SongModel, options?: ExportOptions): Promise<Uint8Array | ArrayBuffer | string | void> | Uint8Array | ArrayBuffer | string | void;
  validate?(song: SongModel): string[];
  uiContributions?: ExporterUIContribution;
}
