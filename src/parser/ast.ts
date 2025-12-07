/**
 * AST node type definitions for BeatBax.
 */

export type PatternMap = Record<string, string[]>;
export type InstMap = Record<string, Record<string, string>>;

export interface ChannelNode {
  id: number;
  inst?: string;
  pat?: string | string[];
  bpm?: number;
  speed?: number;
}

export type SeqMap = Record<string, string[]>;

export interface AST {
  pats: PatternMap;
  insts: InstMap;
  seqs: SeqMap;
  channels: ChannelNode[];
  bpm?: number;
}

export default AST;
