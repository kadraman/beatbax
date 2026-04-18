/**
 * Song model and event types for resolved ISM (Intermediate Song Model).
 */
import { InstMap } from '../parser/ast.js';
export type NoteToken = string;
export type Pan = {
    enum?: 'L' | 'R' | 'C';
    value?: number;
    sourceNamespace?: string;
};
export interface Effect {
    type: string;
    params: Array<string | number>;
}
export interface NoteEvent {
    type: 'note';
    token: NoteToken;
    instrument?: string;
    instProps?: Record<string, string> | undefined;
    pan?: Pan;
    effects?: Effect[];
    legato?: boolean;
    sourcePattern?: string;
    sourceSequence?: string;
    patternIndex?: number;
    barNumber?: number;
}
export interface RestEvent {
    type: 'rest';
}
export interface SustainEvent {
    type: 'sustain';
}
export interface NamedInstrumentEvent {
    type: 'named';
    token: string;
    instrument?: string;
    instProps?: Record<string, string> | undefined;
    defaultNote?: string;
    sourcePattern?: string;
    sourceSequence?: string;
    patternIndex?: number;
    barNumber?: number;
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
    chip?: string;
    volume?: number;
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
//# sourceMappingURL=songModel.d.ts.map