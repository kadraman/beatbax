/**
 * AST node type definitions for BeatBax.
 */

export interface SourceLocation {
  start: { offset: number; line: number; column: number };
  end: { offset: number; line: number; column: number };
}

export type PatternMap = Record<string, string[]>;

interface BasePatternEvent {
  raw?: string;
  loc?: SourceLocation;
}

export type PatternEvent =
  | (BasePatternEvent & { kind: 'note'; value: string; duration?: number; effects?: string[] })
  | (BasePatternEvent & { kind: 'rest'; value: '.' | '_' | '-'; duration?: number })
  | (BasePatternEvent & { kind: 'inline-inst'; name: string })
  | (BasePatternEvent & { kind: 'temp-inst'; name: string; duration?: number })
  | (BasePatternEvent & { kind: 'token'; value: string });

export interface SequenceTransform {
  kind:
    | 'oct'
    | 'rev'
    | 'slow'
    | 'fast'
    | 'inst'
    | 'pan'
    | 'transpose'
    | 'unknown';
  value?: number | string | null;
  raw?: string;
  loc?: SourceLocation;
}

export interface SequenceItem {
  name: string;
  transforms?: SequenceTransform[];
  repeat?: number;
  loc?: SourceLocation;
  raw?: string;
}

export interface InstrumentNode {
  type?: string;
  duty?: string;
  wave?: string | number[];
  // Sweep may be stored as the original string (backcompat) or as a
  // structured object produced by the parser: { time, direction, shift }
  // `env` may be a legacy CSV string (e.g. "15,down,7") or a normalized object
  // of type `EnvelopeAST`. Parsers will prefer producing `EnvelopeAST`.
  env?: string | EnvelopeAST | null;
  // Noise can be provided as CSV or as a normalized object
  noise?: string | NoiseAST | null;
  sweep?: string | SweepAST | null;
  [key: string]: any;
}

export interface EnvelopeAST {
  level: number; // 0..15
  direction: 'up' | 'down' | 'none';
  period: number; // envelope timing period (ticks)
}

export interface SweepAST {
  time: number; // 0..7
  direction: 'up' | 'down' | 'none';
  shift: number; // 0..7
}

export interface NoiseAST {
  clockShift?: number;
  widthMode?: 7 | 15;
  divisor?: number;
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

export type PatternEventMap = Record<string, PatternEvent[]>;
export type SequenceItemMap = Record<string, SequenceItem[]>;

export interface ArrangeNode {
  type?: 'arrange';
  name: string;
  arrangements: (string | null)[][]; // rows of slots, null for empty slot
  defaults?: { bpm?: number; inst?: string; speed?: number | string; [key: string]: any };
  loc?: SourceLocation;
  raw?: string;
}

export interface AST {
  pats: PatternMap;
  insts: InstMap;
  seqs: SeqMap;
  effects?: Record<string, string>;
  patternEvents?: PatternEventMap;
  sequenceItems?: SequenceItemMap;
  channels: ChannelNode[];
  arranges?: Record<string, ArrangeNode>;
  bpm?: number;
  chip?: string;
  volume?: number;
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
