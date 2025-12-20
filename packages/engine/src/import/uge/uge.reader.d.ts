export declare function parseUGE(data: Buffer): any;
export declare function readUGEFile(path: string): any;
export declare function midiNoteToUGE(midi: number): number;
export declare function ugeNoteToString(uge: number): string;
export declare function getUGESummary(song: any): string;
export declare enum InstrumentType {
    DUTY = 0,
    WAVE = 1,
    NOISE = 2
}
export declare enum ChannelType {
    PULSE1 = 0,
    PULSE2 = 1,
    WAVE = 2,
    NOISE = 3
}
export type SubPatternCell = any;
export type DutyInstrument = any;
export type WaveInstrument = any;
export type NoiseInstrument = any;
export type Instrument = any;
export type PatternCell = any;
export type Pattern = any;
export type UGESong = any;
declare const _default: {};
export default _default;
//# sourceMappingURL=uge.reader.d.ts.map