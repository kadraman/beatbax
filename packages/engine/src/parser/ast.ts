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
  // Software macro envelopes (FamiStudio/FamiTracker style).
  // Formatted as "[v0,v1,...|loopPoint]" or a number array.
  // vol_env:   volume levels 0-15  (overrides hardware env when present)
  // duty_env:  duty indices 0-3    (0=12.5%, 1=25%, 2=50%, 3=75%)
  // arp_env:   semitone offsets    (0=root; pattern-level arp overrides completely)
  // pitch_env: pitch offsets in semitones, absolute from note root (default mode)
  vol_env?: string | number[];
  duty_env?: string | number[];
  arp_env?: string | number[];
  pitch_env?: string | number[];
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
  loc?: SourceLocation;
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

export interface ImportNode {
  source: string;
  loc?: SourceLocation;
}

export type DiagnosticLevel = 'error' | 'warning';

export interface ParseDiagnostic {
  level: DiagnosticLevel;
  component: string;
  message: string;
  loc?: SourceLocation;
}


export type ParseErrorType = 'syntax' | 'recovery';

export interface ParseError {
  message: string;
  loc?: SourceLocation;
  type: ParseErrorType;
}

export interface ParseResult {
  ast: AST;
  errors: ParseError[];
  hasErrors: boolean;
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
  imports?: ImportNode[];
  bpm?: number;
  time?: number;
  stepsPerBar?: number;
  chip?: string;
  volume?: number;
  play?: PlayNode;
  metadata?: SongMetadata;
  /** Diagnostics emitted during parsing (type errors, unknown properties, etc.) */
  diagnostics?: ParseDiagnostic[];
}

export default AST;

export interface SongMetadata {
  name?: string;
  artist?: string;
  description?: string;
  tags?: string[];
}
