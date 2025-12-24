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
