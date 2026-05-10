/**
 * VGM backend interface and shared types.
 *
 * Each VgmBackend handles one chip family (SMS/SN76489, AY-3-8910, etc.).
 * The dispatcher in index.ts resolves the correct backend by chip alias and
 * delegates all chip-specific work to it.
 */

import type { InstrumentNode } from '@beatbax/engine';
import type { Gd3Fields } from '../gd3.js';
import type { VgmHeaderParams } from '../vgmWriter.js';

// ─── Local song model types ───────────────────────────────────────────────────

export interface ChannelEventLike {
  type: string;
  token?: string;
  instrument?: string;
  instProps?: Record<string, any>;
  effects?: Array<{ type: string; params: Array<string | number> }>;
  defaultNote?: string;
  pan?: { enum?: string; value?: number; sourceNamespace?: string } | null;
}

export interface ChannelModelLike {
  id: number;
  events: ChannelEventLike[];
  defaultInstrument?: string;
  speed?: number;
}

export interface SongLike {
  pats: Record<string, string[]>;
  insts: Record<string, InstrumentNode>;
  seqs: Record<string, string[]>;
  channels: ChannelModelLike[];
  bpm?: number;
  chip?: string;
  chipRegion?: string;
  volume?: number;
  metadata?: {
    name?: string;
    artist?: string;
    description?: string;
    tags?: string[];
  };
}

// ─── VGM translate result ─────────────────────────────────────────────────────

export interface VgmTranslateResult {
  /** Raw VGM data section bytes (commands including the end marker). */
  dataBytes: Uint8Array;
  /** Total 44100 Hz sample count for the full song. */
  totalSamples: number;
  /** True when any channel used the retrig effect. */
  hasRetrig: boolean;
  /** Chip clock frequency used (NTSC or PAL variant). */
  clock: number;
  /** True when Game Gear stereo (0x4F) commands were emitted. */
  isGameGear?: boolean;
}

// ─── VGM backend interface ────────────────────────────────────────────────────

export interface VgmBackend {
  /** Chip aliases this backend handles (lowercase, no spaces). */
  readonly chipAliases: readonly string[];

  /**
   * Validate the song ISM for this chip.
   * Returns an array of error strings, or [] when the song is valid.
   */
  validate(song: SongLike): string[];

  /**
   * Translate the validated ISM to a VGM data byte stream.
   * Must only be called after validate() returns [].
   */
  translate(song: SongLike): VgmTranslateResult;

  /**
   * Build the GD3 metadata fields for this chip.
   * Called after translate() so the result can inform metadata (e.g. system name).
   */
  buildGd3Fields(song: SongLike, translateResult: VgmTranslateResult): Gd3Fields;

  /**
   * Return the VGM header clock and rate parameters for this chip.
   * Called after translate() so the result can influence clock values.
   */
  headerParams(song: SongLike, translateResult: VgmTranslateResult): VgmHeaderParams;
}
