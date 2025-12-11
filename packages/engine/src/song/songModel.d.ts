/**
 * Song model and event types for resolved ISM (Intermediate Song Model).
 */
export type NoteToken = string;
export interface NoteEvent {
    type: 'note';
    token: NoteToken;
    instrument?: string;
    instProps?: Record<string, string> | undefined;
}
export interface RestEvent {
    type: 'rest';
}
export interface NamedInstrumentEvent {
    type: 'named';
    token: string;
    instrument?: string;
    instProps?: Record<string, string> | undefined;
}
export type ChannelEvent = NoteEvent | RestEvent | NamedInstrumentEvent;
export interface ChannelModel {
    id: number;
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
//# sourceMappingURL=songModel.d.ts.map