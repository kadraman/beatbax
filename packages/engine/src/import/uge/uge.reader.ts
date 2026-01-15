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

import { readFileSync } from 'fs';

// ============================================================================
// Type Definitions
// ============================================================================

export enum InstrumentType {
    DUTY = 0,
    WAVE = 1,
    NOISE = 2
}

export enum ChannelType {
    PULSE1 = 0,
    PULSE2 = 1,
    WAVE = 2,
    NOISE = 3
}

export interface SubPatternCell {
    note: number;          // 0-72 for notes, 90 for empty
    jump: number;          // Jump command value
    effectCode: number;    // Effect code
    effectParam: number;   // Effect parameter
}

export interface DutyInstrument {
    type: InstrumentType.DUTY;
    name: string;
    length: number;
    lengthEnabled: boolean;
    initialVolume: number;
    volumeSweepDir: number;    // 0 = increase, 1 = decrease
    volumeSweepChange: number;
    freqSweepTime: number;     // 0-7
    sweepEnabled: number;      // 0 or 1
    freqSweepShift: number;    // 0-7
    dutyCycle: number;         // 0-3 (12.5%, 25%, 50%, 75%)
    subpatternEnabled?: boolean;
    rows?: SubPatternCell[];
}

export interface WaveInstrument {
    type: InstrumentType.WAVE;
    name: string;
    length: number;
    lengthEnabled: boolean;
    volume: number;            // 0=mute, 1=100%, 2=50%, 3=25%
    waveIndex: number;         // 0-15
    subpatternEnabled?: boolean;
    rows?: SubPatternCell[];
}

export interface NoiseInstrument {
    type: InstrumentType.NOISE;
    name: string;
    length: number;
    lengthEnabled: boolean;
    initialVolume: number;
    volumeSweepDir: number;    // 0 = increase, 1 = decrease
    volumeSweepChange: number;
    noiseMode?: number;        // 0=15-bit, 1=7-bit (v<6)
    subpatternEnabled?: boolean;
    rows?: SubPatternCell[];
}

export type Instrument = DutyInstrument | WaveInstrument | NoiseInstrument;

export interface PatternCell {
    note: number;           // 0-72 for notes, 90 for empty
    instrument: number;     // Instrument index (1-based, 0 = no change)
    effectCode: number;     // Effect code
    effectParam: number;    // Effect parameter
}

export interface Pattern {
    index: number;
    rows: PatternCell[];    // Always 64 rows
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
    dutyInstruments: DutyInstrument[];    // 15 instruments
    waveInstruments: WaveInstrument[];    // 15 instruments
    noiseInstruments: NoiseInstrument[];  // 15 instruments
    wavetables: number[][];               // 16 waves × 32 nibbles
    initialTicksPerRow: number;
    timerTempoEnabled?: boolean;          // v6+
    timerTempoDivider?: number;           // v6+
    patterns: Pattern[];
    orders: Orders;
    routines: string[];                   // 16 routine strings
}

// ============================================================================
// Binary Reading Helpers
// ============================================================================

class BinaryReader {
    private buffer: Buffer;
    private offset: number = 0;

    constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    getOffset(): number {
        return this.offset;
    }

    readU8(ctx: string = 'u8'): number {
        if (this.offset + 1 > this.buffer.length) {
            throw new Error(`EOF: Need 1 byte for ${ctx} at offset ${this.offset}`);
        }
        const val = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return val;
    }

    readU32(ctx: string = 'u32'): number {
        if (this.offset + 4 > this.buffer.length) {
            throw new Error(`EOF: Need 4 bytes for ${ctx} at offset ${this.offset}`);
        }
        const val = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return val;
    }

    readBool(ctx: string = 'bool'): boolean {
        return this.readU8(ctx) !== 0;
    }

    readShortString(ctx: string = 'shortstring'): string {
        const len = this.readU8(`${ctx}.length`);
        if (this.offset + 255 > this.buffer.length) {
            throw new Error(`EOF: Need 255 bytes for ${ctx} at offset ${this.offset}`);
        }
        const str = this.buffer.toString('utf8', this.offset, this.offset + len);
        this.offset += 255; // Always skip 255 bytes regardless of actual length
        return str;
    }

    readString(ctx: string = 'string'): string {
        const len = this.readU32(`${ctx}.length`);
        if (this.offset + len > this.buffer.length) {
            throw new Error(`EOF: Need ${len} bytes for ${ctx} at offset ${this.offset}`);
        }
        const str = this.buffer.toString('utf8', this.offset, this.offset + len);
        this.offset += len;
        // No null terminator in beatbax writer output
        return str;
    }

    skip(bytes: number): void {
        this.offset += bytes;
    }
}

// ============================================================================
// Parsing Functions
// ============================================================================

function parseSubPatternRows(reader: BinaryReader, version: number, ctx: string): SubPatternCell[] {
    const rows: SubPatternCell[] = [];
    for (let r = 0; r < 64; r++) {
        const note = reader.readU32(`${ctx}.row[${r}].note`);
        const unused = reader.readU32(`${ctx}.row[${r}].unused`);
        const jump = reader.readU32(`${ctx}.row[${r}].jump`);
        const effectCode = reader.readU32(`${ctx}.row[${r}].effectCode`);
        const effectParam = reader.readU8(`${ctx}.row[${r}].effectParam`);
        rows.push({ note, jump, effectCode, effectParam });
    }
    // v4-v5 have 6 additional unused bytes after rows
    if (version >= 4 && version < 6) {
        reader.skip(6);
    }
    return rows;
}

function parseDutyInstrument(reader: BinaryReader, version: number, idx: number): DutyInstrument {
    const baseOffset = reader.getOffset();
    const instType = reader.readU32(`duty[${idx}].type`);

    if (instType !== 0) {
        throw new Error(`Expected duty instrument type 0 at offset ${baseOffset}, got ${instType}`);
    }

    const name = reader.readShortString(`duty[${idx}].name`);
    const length = reader.readU32(`duty[${idx}].length`);
    const lengthEnabled = reader.readBool(`duty[${idx}].lengthEnabled`);
    const initialVolume = reader.readU8(`duty[${idx}].initialVolume`);
    const volumeSweepDir = reader.readU32(`duty[${idx}].volumeSweepDir`);
    const volumeSweepChange = reader.readU8(`duty[${idx}].volumeSweepChange`);
    const freqSweepTime = reader.readU32(`duty[${idx}].freqSweepTime`);
    const sweepEnabled = reader.readU32(`duty[${idx}].sweepEnabled`);
    const freqSweepShift = reader.readU32(`duty[${idx}].freqSweepShift`);
    const dutyCycle = reader.readU8(`duty[${idx}].dutyCycle`);

    // Three unused u32s
    reader.readU32(`duty[${idx}].unused_a`);
    reader.readU32(`duty[${idx}].unused_b`);
    reader.readU32(`duty[${idx}].counter_step`);

    let subpatternEnabled: boolean | undefined;
    let rows: SubPatternCell[] | undefined;

    if (version < 6) {
        // v5 has additional unused fields and always includes rows
        rows = parseSubPatternRows(reader, version, `duty[${idx}]`);
    } else {
        // v6: subpattern flag, then 64 rows × 17 bytes (always present in binary)
        subpatternEnabled = reader.readBool(`duty[${idx}].subpatternEnabled`);
        // Always skip 64 rows × 17 bytes = 1088 bytes (they're always written)
        reader.skip(64 * 17);
    }

    return {
        type: InstrumentType.DUTY,
        name,
        length,
        lengthEnabled,
        initialVolume,
        volumeSweepDir,
        volumeSweepChange,
        freqSweepTime,
        sweepEnabled,
        freqSweepShift,
        dutyCycle,
        subpatternEnabled,
        rows
    };
}

function parseWaveInstrument(reader: BinaryReader, version: number, idx: number): WaveInstrument {
    const baseOffset = reader.getOffset();
    const instType = reader.readU32(`wave[${idx}].type`);

    if (instType !== 1) {
        throw new Error(`Expected wave instrument type 1 at offset ${baseOffset}, got ${instType}`);
    }

    const name = reader.readShortString(`wave[${idx}].name`);
    const length = reader.readU32(`wave[${idx}].length`);
    const lengthEnabled = reader.readBool(`wave[${idx}].lengthEnabled`);

    // Skip unused fields
    reader.readU8(`wave[${idx}].unused1_u8`);
    reader.readU32(`wave[${idx}].unused2_u32`);
    reader.readU8(`wave[${idx}].unused3_u8`);
    reader.readU32(`wave[${idx}].unused4_u32`);
    reader.readU32(`wave[${idx}].unused5_u32`);
    reader.readU32(`wave[${idx}].unused6_u32`);
    reader.readU8(`wave[${idx}].unused7_u8`);

    const volume = reader.readU32(`wave[${idx}].volume`);
    const waveIndex = reader.readU32(`wave[${idx}].waveIndex`);
    reader.readU32(`wave[${idx}].counter_step`);

    let subpatternEnabled: boolean | undefined;
    let rows: SubPatternCell[] | undefined;

    if (version < 6) {
        // v5 has additional unused fields and always includes rows
        rows = parseSubPatternRows(reader, version, `wave[${idx}]`);
    } else {
        // v6: subpattern flag, then 64 rows × 17 bytes (always present in binary)
        subpatternEnabled = reader.readBool(`wave[${idx}].subpatternEnabled`);
        // Always skip 64 rows × 17 bytes = 1088 bytes (they're always written)
        reader.skip(64 * 17);
    }

    return {
        type: InstrumentType.WAVE,
        name,
        length,
        lengthEnabled,
        volume,
        waveIndex,
        subpatternEnabled,
        rows
    };
}

function parseNoiseInstrument(reader: BinaryReader, version: number, idx: number): NoiseInstrument {
    const baseOffset = reader.getOffset();
    const instType = reader.readU32(`noise[${idx}].type`);

    if (instType !== 2) {
        throw new Error(`Expected noise instrument type 2 at offset ${baseOffset}, got ${instType}`);
    }

    const name = reader.readShortString(`noise[${idx}].name`);
    const length = reader.readU32(`noise[${idx}].length`);
    const lengthEnabled = reader.readBool(`noise[${idx}].lengthEnabled`);
    const initialVolume = reader.readU8(`noise[${idx}].initialVolume`);
    const volumeSweepDir = reader.readU32(`noise[${idx}].volumeSweepDir`);
    const volumeSweepChange = reader.readU8(`noise[${idx}].volumeSweepChange`);

    // Skip unused fields
    reader.readU32(`noise[${idx}].unused_a`);
    reader.readU32(`noise[${idx}].unused_b`);
    reader.readU32(`noise[${idx}].unused_c`);
    reader.readU8(`noise[${idx}].unused_d`);
    reader.readU32(`noise[${idx}].unused_e`);
    reader.readU32(`noise[${idx}].unused_f`);
    reader.readU32(`noise[${idx}].noise_mode`);

    let noiseMode: number | undefined;
    let subpatternEnabled: boolean | undefined;
    let rows: SubPatternCell[] | undefined;

    if (version < 6) {
        // v5 has additional unused fields and always includes rows
        rows = parseSubPatternRows(reader, version, `noise[${idx}]`);
    } else {
        // v6: subpattern flag, then 64 rows × 17 bytes (always present in binary)
        subpatternEnabled = reader.readBool(`noise[${idx}].subpatternEnabled`);
        // Always skip 64 rows × 17 bytes = 1088 bytes (they're always written)
        reader.skip(64 * 17);
    }

    return {
        type: InstrumentType.NOISE,
        name,
        length,
        lengthEnabled,
        initialVolume,
        volumeSweepDir,
        volumeSweepChange,
        noiseMode,
        subpatternEnabled,
        rows
    };
}

function parseWavetables(reader: BinaryReader, version: number): number[][] {
    const waves: number[][] = [];
    for (let w = 0; w < 16; w++) {
        const nibbles: number[] = [];
        for (let i = 0; i < 32; i++) {
            nibbles.push(reader.readU8(`wavetable[${w}].nibble[${i}]`));
        }
        waves.push(nibbles);
    }
    // v<3 has an off-by-one filler byte
    if (version < 3) {
        reader.readU8('wavetable.off_by_one_filler');
    }
    return waves;
}

function parsePatterns(reader: BinaryReader, version: number): {
    initialTicksPerRow: number;
    timerTempoEnabled?: boolean;
    timerTempoDivider?: number;
    patterns: Pattern[];
} {
    const initialTicksPerRow = reader.readU32('patterns.initialTicksPerRow');

    let timerTempoEnabled: boolean | undefined;
    let timerTempoDivider: number | undefined;

    if (version >= 6) {
        timerTempoEnabled = reader.readBool('patterns.timerTempoEnabled');
        timerTempoDivider = reader.readU32('patterns.timerTempoDivider');
    }

    const numPatterns = reader.readU32('patterns.numPatterns');
    const patterns: Pattern[] = [];

    for (let p = 0; p < numPatterns; p++) {
        const index = reader.readU32(`pattern[${p}].index`);
        const rows: PatternCell[] = [];

        for (let r = 0; r < 64; r++) {
            const note = reader.readU32(`pattern[${p}].row[${r}].note`);
            const instrument = reader.readU32(`pattern[${p}].row[${r}].instrument`);

            // v6 has an unused u32 field
            if (version >= 6) {
                reader.readU32(`pattern[${p}].row[${r}].unused_v6`);
            }

            const effectCode = reader.readU32(`pattern[${p}].row[${r}].effectCode`);
            const effectParam = reader.readU8(`pattern[${p}].row[${r}].effectParam`);

            rows.push({ note, instrument, effectCode, effectParam });
        }

        patterns.push({ index, rows });
    }

    return { initialTicksPerRow, timerTempoEnabled, timerTempoDivider, patterns };
}

function parseOrders(reader: BinaryReader): Orders {
    const channels: number[][] = [];
    const channelNames = ['Duty1', 'Duty2', 'Wave', 'Noise'];

    for (let c = 0; c < 4; c++) {
        const orderLenPlusOne = reader.readU32(`orders[${channelNames[c]}].lengthPlusOne`);
        const orderLen = Math.max(0, orderLenPlusOne - 1);
        const indices: number[] = [];

        for (let i = 0; i < orderLen; i++) {
            const idx = reader.readU32(`orders[${channelNames[c]}].index[${i}]`);
            const filler = reader.readU32(`orders[${channelNames[c]}].filler[${i}]`);
            indices.push(idx);
        }

        channels.push(indices);
    }

    return {
        duty1: channels[0],
        duty2: channels[1],
        wave: channels[2],
        noise: channels[3]
    };
}

function parseRoutines(reader: BinaryReader): string[] {
    const routines: string[] = [];
    for (let i = 0; i < 16; i++) {
        const code = reader.readString(`routine[${i}]`);
        routines.push(code);
    }
    return routines;
}

// ============================================================================
// Main Parsing Functions
// ============================================================================

/**
 * Parse a UGE file from a Buffer
 */
export function parseUGE(data: Buffer): UGESong {
    const reader = new BinaryReader(data);

    // Read header
    const version = reader.readU32('header.version');

    // Validate version
    if (version < 5 || version > 6) {
        throw new Error(`Unsupported UGE version ${version}. This parser supports only v5 or v6 files.`);
    }

    const name = reader.readShortString('header.name');
    const artist = reader.readShortString('header.artist');
    const comment = reader.readShortString('header.comment');

    // Parse instruments
    const dutyInstruments: DutyInstrument[] = [];
    for (let i = 0; i < 15; i++) {
        dutyInstruments.push(parseDutyInstrument(reader, version, i));
    }

    const waveInstruments: WaveInstrument[] = [];
    for (let i = 0; i < 15; i++) {
        waveInstruments.push(parseWaveInstrument(reader, version, i));
    }

    const noiseInstruments: NoiseInstrument[] = [];
    for (let i = 0; i < 15; i++) {
        noiseInstruments.push(parseNoiseInstrument(reader, version, i));
    }

    // Parse wavetables
    const wavetables = parseWavetables(reader, version);

    // Parse patterns
    const { initialTicksPerRow, timerTempoEnabled, timerTempoDivider, patterns } = parsePatterns(reader, version);

    // Parse orders
    const orders = parseOrders(reader);

    // Parse routines
    const routines = parseRoutines(reader);

    return {
        version,
        name,
        artist,
        comment,
        dutyInstruments,
        waveInstruments,
        noiseInstruments,
        wavetables,
        initialTicksPerRow,
        timerTempoEnabled,
        timerTempoDivider,
        patterns,
        orders,
        routines
    };
}

/**
 * Read and parse a UGE file from disk
 */
export function readUGEFile(path: string): UGESong {
    const buffer = readFileSync(path);
    return parseUGE(buffer);
}

/**
 * Convert MIDI note number to hUGETracker note index
 * hUGETracker uses indices 0-72 where 0 = C-3, 12 = C-4, 24 = C-5, etc.
 */
export function midiNoteToUGE(midi: number): number {
    return midi - 36; // Offset by 3 octaves (MIDI note 36 = C2 = UGE C-3)
}

/**
 * Convert hUGETracker note index to note name string
 */
export function ugeNoteToString(uge: number): string {
    if (uge === 90) return '...'; // Empty note
    if (uge < 0 || uge > 72) return '???';

    const noteNames = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
    const octave = Math.floor(uge / 12) + 3;
    const note = noteNames[uge % 12];
    return `${note}${octave}`;
}

/**
 * Get a summary string of the UGE song
 */
export function getUGESummary(song: UGESong): string {
    const lines: string[] = [];
    lines.push(`=== UGE v${song.version} ===`);
    lines.push(`Title: ${song.name}`);
    lines.push(`Artist: ${song.artist}`);
    if (song.comment) lines.push(`Comment: ${song.comment}`);
    lines.push(`Ticks/Row: ${song.initialTicksPerRow} (≈${Math.round(896 / song.initialTicksPerRow)} BPM)`);
    lines.push(`Patterns: ${song.patterns.length}`);
    lines.push(`Orders: D1=${song.orders.duty1.length}, D2=${song.orders.duty2.length}, W=${song.orders.wave.length}, N=${song.orders.noise.length}`);

    // Count used instruments
    const usedDuty = song.dutyInstruments.filter(i => i.name && i.name.trim()).length;
    const usedWave = song.waveInstruments.filter(i => i.name && i.name.trim()).length;
    const usedNoise = song.noiseInstruments.filter(i => i.name && i.name.trim()).length;
    lines.push(`Instruments: ${usedDuty} duty, ${usedWave} wave, ${usedNoise} noise`);

    return lines.join('\n');
}

/**
 * Convert UGE song to a detailed JSON representation
 * This provides a comprehensive breakdown similar to .bax file inspection
 */
export function getUGEDetailedJSON(song: UGESong): string {
    // Convert patterns to human-readable format with note names
    const patternsDetailed = song.patterns.map(pattern => ({
        index: pattern.index,
        rows: pattern.rows.map(row => ({
            note: row.note === 90 ? '...' : ugeNoteToString(row.note),
            noteIndex: row.note,
            instrument: row.instrument,
            effectCode: row.effectCode,
            effectParam: row.effectParam,
            effectDisplay: row.effectCode === 0 ? '...' :
                `${row.effectCode.toString(16).toUpperCase()}${row.effectParam.toString(16).toUpperCase().padStart(2, '0')}`
        }))
    }));

    // Filter instruments to show only those with names
    const dutyInstrumentsFiltered = song.dutyInstruments
        .map((inst, idx) => ({ ...inst, index: idx }))
        .filter(inst => inst.name && inst.name.trim());

    const waveInstrumentsFiltered = song.waveInstruments
        .map((inst, idx) => ({ ...inst, index: idx }))
        .filter(inst => inst.name && inst.name.trim());

    const noiseInstrumentsFiltered = song.noiseInstruments
        .map((inst, idx) => ({ ...inst, index: idx }))
        .filter(inst => inst.name && inst.name.trim());

    // Format wavetables as hex strings for readability
    const wavetablesFormatted = song.wavetables.map((wave, idx) => ({
        index: idx,
        nibbles: wave,
        hex: wave.map(n => n.toString(16).toUpperCase()).join(' ')
    }));

    const detailed = {
        version: song.version,
        metadata: {
            name: song.name,
            artist: song.artist,
            comment: song.comment
        },
        tempo: {
            ticksPerRow: song.initialTicksPerRow,
            approximateBPM: Math.round(896 / song.initialTicksPerRow),
            timerTempoEnabled: song.timerTempoEnabled,
            timerTempoDivider: song.timerTempoDivider
        },
        instruments: {
            duty: dutyInstrumentsFiltered.map(inst => ({
                index: inst.index,
                name: inst.name,
                type: 'duty',
                length: inst.length,
                lengthEnabled: inst.lengthEnabled,
                initialVolume: inst.initialVolume,
                volumeSweep: {
                    direction: inst.volumeSweepDir === 0 ? 'increase' : 'decrease',
                    change: inst.volumeSweepChange
                },
                frequencySweep: {
                    time: inst.freqSweepTime,
                    enabled: inst.sweepEnabled === 1,
                    shift: inst.freqSweepShift
                },
                dutyCycle: inst.dutyCycle,
                dutyCyclePercent: [12.5, 25, 50, 75][inst.dutyCycle] || 50,
                subpatternEnabled: inst.subpatternEnabled,
                hasSubpatternRows: inst.rows && inst.rows.length > 0
            })),
            wave: waveInstrumentsFiltered.map(inst => ({
                index: inst.index,
                name: inst.name,
                type: 'wave',
                length: inst.length,
                lengthEnabled: inst.lengthEnabled,
                volume: inst.volume,
                volumePercent: [0, 100, 50, 25][inst.volume] || 100,
                waveIndex: inst.waveIndex,
                subpatternEnabled: inst.subpatternEnabled,
                hasSubpatternRows: inst.rows && inst.rows.length > 0
            })),
            noise: noiseInstrumentsFiltered.map(inst => ({
                index: inst.index,
                name: inst.name,
                type: 'noise',
                length: inst.length,
                lengthEnabled: inst.lengthEnabled,
                initialVolume: inst.initialVolume,
                volumeSweep: {
                    direction: inst.volumeSweepDir === 0 ? 'increase' : 'decrease',
                    change: inst.volumeSweepChange
                },
                noiseMode: inst.noiseMode,
                noiseModeDescription: inst.noiseMode === 0 ? '15-bit' : inst.noiseMode === 1 ? '7-bit' : 'unknown',
                subpatternEnabled: inst.subpatternEnabled,
                hasSubpatternRows: inst.rows && inst.rows.length > 0
            }))
        },
        wavetables: wavetablesFormatted,
        patterns: patternsDetailed,
        orders: {
            duty1: song.orders.duty1,
            duty2: song.orders.duty2,
            wave: song.orders.wave,
            noise: song.orders.noise,
            maxLength: Math.max(
                song.orders.duty1.length,
                song.orders.duty2.length,
                song.orders.wave.length,
                song.orders.noise.length
            )
        },
        routines: song.routines.map((code, idx) => ({
            index: idx,
            code: code,
            hasCode: code && code.length > 0
        })).filter(r => r.hasCode),
        statistics: {
            totalPatterns: song.patterns.length,
            totalInstruments: dutyInstrumentsFiltered.length + waveInstrumentsFiltered.length + noiseInstrumentsFiltered.length,
            dutyInstruments: dutyInstrumentsFiltered.length,
            waveInstruments: waveInstrumentsFiltered.length,
            noiseInstruments: noiseInstrumentsFiltered.length,
            wavetablesUsed: song.wavetables.filter((w, idx) =>
                waveInstrumentsFiltered.some(inst => inst.waveIndex === idx)
            ).length,
            songLength: {
                duty1: song.orders.duty1.length,
                duty2: song.orders.duty2.length,
                wave: song.orders.wave.length,
                noise: song.orders.noise.length
            }
        }
    };

    return JSON.stringify(detailed, null, 2);
}

export default { parseUGE, readUGEFile, midiNoteToUGE, ugeNoteToString, getUGESummary, getUGEDetailedJSON };
