/**
 * UGE Reader - Parses hUGETracker .uge files (v5/v6)
 *
 * Based on the hUGETracker UGE format specification.
 * Supports versions 5 and 6 of the UGE format.
 *
 * Usage:
 *   import { readUGEFile, parseUGE } from './uge.reader.js';
 *   const song = readUGEFile('path/to/song.uge');
 *   // or
 *   const buffer = readFileSync('song.uge');
 *   const song = parseUGE(buffer);
 */
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
export interface SubPatternCell {
    note: number;
    jump: number;
    effectCode: number;
    effectParam: number;
}
export interface DutyInstrument {
    type: InstrumentType.DUTY;
    name: string;
    length: number;
    lengthEnabled: boolean;
    initialVolume: number;
    volumeSweepDir: number;
    volumeSweepChange: number;
    freqSweepTime: number;
    sweepEnabled: number;
    freqSweepShift: number;
    dutyCycle: number;
    subpatternEnabled?: boolean;
    rows?: SubPatternCell[];
}
export interface WaveInstrument {
    type: InstrumentType.WAVE;
    name: string;
    length: number;
    lengthEnabled: boolean;
    volume: number;
    waveIndex: number;
    subpatternEnabled?: boolean;
    rows?: SubPatternCell[];
}
export interface NoiseInstrument {
    type: InstrumentType.NOISE;
    name: string;
    length: number;
    lengthEnabled: boolean;
    initialVolume: number;
    volumeSweepDir: number;
    volumeSweepChange: number;
    noiseMode?: number;
    subpatternEnabled?: boolean;
    rows?: SubPatternCell[];
}
export type Instrument = DutyInstrument | WaveInstrument | NoiseInstrument;
export interface PatternCell {
    note: number;
    instrument: number;
    effectCode: number;
    effectParam: number;
}
export interface Pattern {
    index: number;
    rows: PatternCell[];
}
export interface Orders {
    duty1: number[];
    duty2: number[];
    wave: number[];
    noise: number[];
}
export interface UGESong {
    version: number;
    name: string;
    artist: string;
    comment: string;
    dutyInstruments: DutyInstrument[];
    waveInstruments: WaveInstrument[];
    noiseInstruments: NoiseInstrument[];
    wavetables: number[][];
    initialTicksPerRow: number;
    timerTempoEnabled?: boolean;
    timerTempoDivider?: number;
    patterns: Pattern[];
    orders: Orders;
    routines: string[];
}
/**
 * Parse a UGE file from a Buffer
 */
export declare function parseUGE(data: Buffer): UGESong;
/**
 * Read and parse a UGE file from disk
 */
export declare function readUGEFile(path: string): UGESong;
/**
 * Convert MIDI note number to hUGETracker note index
 * hUGETracker uses indices 0-72 where 0 = C-3, 12 = C-4, 24 = C-5, etc.
 */
export declare function midiNoteToUGE(midi: number): number;
/**
 * Convert hUGETracker note index to note name string
 */
export declare function ugeNoteToString(uge: number): string;
/**
 * Get a summary string of the UGE song
 */
export declare function getUGESummary(song: UGESong): string;
/**
 * Convert UGE song to a detailed JSON representation
 * This provides a comprehensive breakdown similar to .bax file inspection
 */
export declare function getUGEDetailedJSON(song: UGESong): string;
declare const _default: {
    parseUGE: typeof parseUGE;
    readUGEFile: typeof readUGEFile;
    midiNoteToUGE: typeof midiNoteToUGE;
    ugeNoteToString: typeof ugeNoteToString;
    getUGESummary: typeof getUGESummary;
    getUGEDetailedJSON: typeof getUGEDetailedJSON;
};
export default _default;
//# sourceMappingURL=uge.reader.d.ts.map