/**
 * AST node type definitions for BeatBax.
 */

export type PatternMap = Record<string, string[]>;
export type InstMap = Record<string, Record<string, string>>;

export interface ChannelNode {
  id: number;
  inst?: string;
  pat?: string | string[];
  speed?: number;
}

export type SeqMap = Record<string, string[]>;

export interface AST {
  pats: PatternMap;
  insts: InstMap;
  seqs: SeqMap;
  channels: ChannelNode[];
  cps?: number;           // cycles per second (TidalCycles-style)
  bpm?: number;           // backward compatibility
  stepsPerCycle?: number; // steps per cycle (default 4)
  chip?: string;
}

export default AST;
