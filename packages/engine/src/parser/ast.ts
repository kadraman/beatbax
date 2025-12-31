/**
 * AST node type definitions for BeatBax.
 */

export type PatternMap = Record<string, string[]>;

export interface InstrumentNode {
  type?: string;
  duty?: string;
  env?: string;
  wave?: string | number[];
  // Sweep may be stored as the original string (backcompat) or as a
  // structured object produced by the parser: { time, direction, shift }
  sweep?: string | { time: number; direction: 'up' | 'down'; shift: number } | null;
  [key: string]: any;
}

// Strongly-typed helper for Wave instruments
export interface WaveInstrumentProps extends InstrumentNode {
  type: 'wave';
  wave: string | number[]; // 16 x 4-bit samples
  /** Wave channel volume control: one of 0, 25, 50, 100 (default: 100) */
  volume?: 0 | 25 | 50 | 100;
}

export type InstMap = Record<string, InstrumentNode>;

export interface ChannelNode {
  id: number;
  inst?: string;
  pat?: string | string[];
  speed?: number;
}

export interface PlayNode {
  auto?: boolean;
  repeat?: boolean;
  flags?: string[];
}

export type SeqMap = Record<string, string[]>;

export interface AST {
  pats: PatternMap;
  insts: InstMap;
  seqs: SeqMap;
  channels: ChannelNode[];
  bpm?: number;
  chip?: string;
  play?: PlayNode;
  metadata?: SongMetadata;
}

export default AST;

export interface SongMetadata {
  name?: string;
  artist?: string;
  description?: string;
  tags?: string[];
}
