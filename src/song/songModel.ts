/**
 * Song model and event types for resolved ISM (Intermediate Song Model).
 */

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

export interface NamedInstrumentEvent {
  type: 'named';
  token: string; // e.g. 'snare' - a named instrument token
  instrument?: string;
  instProps?: Record<string, string> | undefined;
}

export type ChannelEvent = NoteEvent | RestEvent | NamedInstrumentEvent;

export interface ChannelModel {
  id: number;
  bpm?: number;
  speed?: number;
  events: ChannelEvent[];
  defaultInstrument?: string;
}

export interface SongModel {
  pats: Record<string, string[]>;
  insts: Record<string, Record<string, string>>;
  seqs: Record<string, string[]>;
  channels: ChannelModel[];
}

export default SongModel;
