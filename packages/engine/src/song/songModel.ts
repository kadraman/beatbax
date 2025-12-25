/**
 * Song model and event types for resolved ISM (Intermediate Song Model).
 */
import { InstMap } from '../parser/ast.js';

export type NoteToken = string; // e.g. 'C4'

export interface NoteEvent {
  type: 'note';
  token: NoteToken;
  instrument?: string; // instrument name
  instProps?: Record<string, string> | undefined;
}

export interface RestEvent {
  type: 'rest';
}

export interface SustainEvent {
  type: 'sustain';
}

export interface NamedInstrumentEvent {
  type: 'named';
  token: string; // e.g. 'snare' - a named instrument token
  instrument?: string;
  instProps?: Record<string, string> | undefined;
}

export type ChannelEvent = NoteEvent | RestEvent | SustainEvent | NamedInstrumentEvent;

export interface ChannelModel {
  id: number;
  speed?: number;
  events: ChannelEvent[];
  defaultInstrument?: string;
}

export interface SongModel {
  pats: Record<string, string[]>;
  insts: InstMap;
  seqs: Record<string, string[]>;
  channels: ChannelModel[];
  bpm?: number;
  metadata?: SongMetadata;
  play?: any;
}

export interface SongMetadata {
  name?: string;
  artist?: string;
  description?: string;
  tags?: string[];
}

export default SongModel;
