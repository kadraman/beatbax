/**
 * UGE Reader - Parses hUGETracker .uge files (v1–v6)
 *
 * Layout follows GB Studio `loadUGESong` / hUGETracker Pascal packed records.
 * BeatBax-exported v6 files round-trip through the same field order.
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

    readI8(ctx: string = 'i8'): number {
        const u = this.readU8(ctx);
        return u > 0x7f ? u - 0x100 : u;
    }

    remaining(): number {
        return this.buffer.length - this.offset;
    }
}

// ============================================================================
// Parsing Functions
// ============================================================================

const EMPTY_SUBPATTERN_NOTE = 90;
const INSTRUMENT_SLOTS = 15;

function emptySubpatternRows(): SubPatternCell[] {
    return Array.from({ length: 64 }, () => ({
        note: EMPTY_SUBPATTERN_NOTE,
        jump: 0,
        effectCode: 0,
        effectParam: 0,
    }));
}

/** hUGETracker UpgradeSong / GB Studio `subpatternFromNoiseMacro`. */
export function subpatternFromNoiseMacro(noiseMacro: number[], ticksPerRow: number): SubPatternCell[] {
    const rows = emptySubpatternRows();
    for (let j = 0; j < noiseMacro.length; j++) {
        const dest = j + 1;
        if (dest >= rows.length) break;
        rows[dest].note = noiseMacro[j] + 36;
    }
    const wrapPoint = Math.min(Math.max(1, ticksPerRow), 7);
    rows[wrapPoint - 1].jump = wrapPoint;
    return rows;
}

function parseSubPatternRows(reader: BinaryReader, ctx: string): SubPatternCell[] {
    const rows: SubPatternCell[] = [];
    for (let r = 0; r < 64; r++) {
        const note = reader.readU32(`${ctx}.row[${r}].note`);
        reader.readU32(`${ctx}.row[${r}].unused`);
        const jump = reader.readU32(`${ctx}.row[${r}].jump`);
        const effectCode = reader.readU32(`${ctx}.row[${r}].effectCode`);
        const effectParam = reader.readU8(`${ctx}.row[${r}].effectParam`);
        rows.push({ note, jump, effectCode, effectParam });
    }
    return rows;
}

interface ParsedInstrumentRecord {
    idx: number;
    type: number;
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
    volume: number;
    waveIndex: number;
    noiseMode: number;
    subpatternEnabled: boolean;
    rows?: SubPatternCell[];
    noiseMacro: number[];
}

/**
 * Every instrument type shares the same packed record layout (hUGETracker TInstrument).
 * GB Studio `loadUGESong` reads this uniformly, then buckets by `type`.
 */
function parseInstrumentRecord(reader: BinaryReader, version: number, idx: number): ParsedInstrumentRecord {
    const type = reader.readU32(`inst[${idx}].type`);
    const name = reader.readShortString(`inst[${idx}].name`);
    const length = reader.readU32(`inst[${idx}].length`);
    const lengthEnabled = reader.readBool(`inst[${idx}].lengthEnabled`);
    let initialVolume = reader.readU8(`inst[${idx}].initialVolume`);
    if (initialVolume > 15) initialVolume = 15;
    const volumeSweepDir = reader.readU32(`inst[${idx}].volumeSweepDir`);
    const volumeSweepChange = reader.readU8(`inst[${idx}].volumeSweepChange`);
    const freqSweepTime = reader.readU32(`inst[${idx}].freqSweepTime`);
    const sweepEnabled = reader.readU32(`inst[${idx}].sweepDir`);
    const freqSweepShift = reader.readU32(`inst[${idx}].freqSweepShift`);
    const dutyCycle = reader.readU8(`inst[${idx}].dutyCycle`);
    const volume = reader.readU32(`inst[${idx}].waveOutputLevel`);
    const waveIndex = reader.readU32(`inst[${idx}].waveIndex`);

    let noiseMode = 0;
    let subpatternEnabled = false;
    let rows: SubPatternCell[] | undefined;
    const noiseMacro: number[] = [];

    if (version >= 6) {
        noiseMode = reader.readU32(`inst[${idx}].noiseMode`);
        subpatternEnabled = reader.readBool(`inst[${idx}].subpatternEnabled`);
        rows = parseSubPatternRows(reader, `inst[${idx}]`);
    } else {
        reader.readU32(`inst[${idx}].unused_pre_mode`);
        noiseMode = reader.readU32(`inst[${idx}].noiseMode`);
        reader.readU32(`inst[${idx}].unused_post_mode`);
        if (version >= 4) {
            for (let m = 0; m < 6; m++) {
                noiseMacro.push(reader.readI8(`inst[${idx}].noiseMacro[${m}]`));
            }
        }
    }

    return {
        idx,
        type,
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
        volume,
        waveIndex,
        noiseMode,
        subpatternEnabled,
        rows,
        noiseMacro,
    };
}

function emptyDuty(): DutyInstrument {
    return {
        type: InstrumentType.DUTY,
        name: '',
        length: 0,
        lengthEnabled: false,
        initialVolume: 15,
        volumeSweepDir: 1,
        volumeSweepChange: 0,
        freqSweepTime: 0,
        sweepEnabled: 0,
        freqSweepShift: 0,
        dutyCycle: 2,
    };
}

function emptyWave(): WaveInstrument {
    return {
        type: InstrumentType.WAVE,
        name: '',
        length: 0,
        lengthEnabled: false,
        volume: 1,
        waveIndex: 0,
    };
}

function emptyNoise(): NoiseInstrument {
    return {
        type: InstrumentType.NOISE,
        name: '',
        length: 0,
        lengthEnabled: false,
        initialVolume: 15,
        volumeSweepDir: 1,
        volumeSweepChange: 0,
        noiseMode: 0,
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
        // v<3 TWaveV1 is 33 bytes (off-by-one) per table
        if (version < 3) {
            reader.readU8(`wavetable[${w}].off_by_one_filler`);
        }
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
    const patternsById: Map<number, Pattern> = new Map();

    for (let p = 0; p < numPatterns; p++) {
        let index: number;
        if (version >= 5) {
            index = reader.readU32(`pattern[${p}].index`);
        } else {
            index = p;
        }
        const rows: PatternCell[] = [];

        for (let r = 0; r < 64; r++) {
            const note = reader.readU32(`pattern[${p}].row[${r}].note`);
            const instrument = reader.readU32(`pattern[${p}].row[${r}].instrument`);

            // v6 has an unused u32 field (TCellV2 volume)
            if (version >= 6) {
                reader.readU32(`pattern[${p}].row[${r}].unused_v6`);
            }

            const effectCode = reader.readU32(`pattern[${p}].row[${r}].effectCode`);
            const effectParam = reader.readU8(`pattern[${p}].row[${r}].effectParam`);

            rows.push({ note, instrument, effectCode, effectParam });
        }

        // v5 files saved by old GB Studio could repeat sequential ids; store at p then.
        const storeIndex = (version === 5 && patternsById.has(index)) ? p : index;
        patternsById.set(storeIndex, { index: storeIndex, rows });
    }

    const patterns = [...patternsById.values()];

    return { initialTicksPerRow, timerTempoEnabled, timerTempoDivider, patterns };
}

function parseOrders(reader: BinaryReader): Orders {
    const channels: number[][] = [];
    const channelNames = ['Duty1', 'Duty2', 'Wave', 'Noise'];

    for (let c = 0; c < 4; c++) {
        const orderLenPlusOne = reader.readU32(`orders[${channelNames[c]}].lengthPlusOne`);
        const orderLen = Math.max(0, orderLenPlusOne - 1);
        const indices: number[] = [];

        // Each order entry is a single uint32 (the pattern index).
        // After all entries there is one trailing uint32(0) filler (off-by-one per UGE spec).
        for (let i = 0; i < orderLen; i++) {
            const idx = reader.readU32(`orders[${channelNames[c]}].index[${i}]`);
            indices.push(idx);
        }
        // Consume the trailing off-by-one filler uint32
        reader.readU32(`orders[${channelNames[c]}].trailingFiller`);

        channels.push(indices);
    }

    return {
        duty1: channels[0],
        duty2: channels[1],
        wave: channels[2],
        noise: channels[3]
    };
}

function parseRoutines(reader: BinaryReader, version: number): string[] {
    const routines: string[] = Array.from({ length: 16 }, () => '');
    if (version < 2) return routines;
    try {
        for (let i = 0; i < 16; i++) {
            if (reader.remaining() < 4) break;
            routines[i] = reader.readString(`routine[${i}]`);
        }
    } catch {
        // Native files sometimes omit or truncate routines; instruments already parsed.
    }
    return routines;
}

// ============================================================================
// Main Parsing Functions
// ============================================================================

/**
 * Parse a UGE file from a Buffer (hUGETracker v1–v6).
 */
export function parseUGE(data: Buffer): UGESong {
    const reader = new BinaryReader(data);

    const version = reader.readU32('header.version');

    if (version < 0 || version > 6) {
        throw new Error(`Unsupported UGE version ${version}. This parser supports v1–v6 files.`);
    }

    const name = reader.readShortString('header.name');
    const artist = reader.readShortString('header.artist');
    const comment = reader.readShortString('header.comment');

    const instrumentCount = version < 3 ? 15 : 45;
    const records: ParsedInstrumentRecord[] = [];
    for (let i = 0; i < instrumentCount; i++) {
        records.push(parseInstrumentRecord(reader, version, i));
    }

    const dutyInstruments: DutyInstrument[] = Array.from({ length: INSTRUMENT_SLOTS }, emptyDuty);
    const waveInstruments: WaveInstrument[] = Array.from({ length: INSTRUMENT_SLOTS }, emptyWave);
    const noiseInstruments: NoiseInstrument[] = Array.from({ length: INSTRUMENT_SLOTS }, emptyNoise);

    for (const rec of records) {
        const slot = rec.idx % INSTRUMENT_SLOTS;
        if (rec.type === InstrumentType.DUTY) {
            dutyInstruments[slot] = {
                type: InstrumentType.DUTY,
                name: rec.name,
                length: rec.length,
                lengthEnabled: rec.lengthEnabled,
                initialVolume: rec.initialVolume,
                volumeSweepDir: rec.volumeSweepDir,
                volumeSweepChange: rec.volumeSweepChange,
                freqSweepTime: rec.freqSweepTime,
                sweepEnabled: rec.sweepEnabled,
                freqSweepShift: rec.freqSweepShift,
                dutyCycle: rec.dutyCycle,
                subpatternEnabled: rec.subpatternEnabled,
                rows: rec.rows,
            };
        } else if (rec.type === InstrumentType.WAVE) {
            waveInstruments[slot] = {
                type: InstrumentType.WAVE,
                name: rec.name,
                length: rec.length,
                lengthEnabled: rec.lengthEnabled,
                volume: rec.volume,
                waveIndex: rec.waveIndex,
                subpatternEnabled: rec.subpatternEnabled,
                rows: rec.rows,
            };
        } else if (rec.type === InstrumentType.NOISE) {
            noiseInstruments[slot] = {
                type: InstrumentType.NOISE,
                name: rec.name,
                length: rec.length,
                lengthEnabled: rec.lengthEnabled,
                initialVolume: rec.initialVolume,
                volumeSweepDir: rec.volumeSweepDir,
                volumeSweepChange: rec.volumeSweepChange,
                noiseMode: rec.noiseMode,
                subpatternEnabled: rec.subpatternEnabled,
                rows: rec.rows,
            };
        } else {
            throw new Error(`Invalid instrument type ${rec.type} [${rec.idx}, "${rec.name}"]`);
        }
    }

    const wavetables = parseWavetables(reader, version);

    const { initialTicksPerRow, timerTempoEnabled, timerTempoDivider, patterns } = parsePatterns(reader, version);

    // v4–v5 noise macros → subpattern rows (only when any step is non-zero).
    if (version >= 4 && version < 6) {
        for (const rec of records) {
            if (rec.type !== InstrumentType.NOISE) continue;
            if (!rec.noiseMacro.some((n) => n !== 0)) continue;
            const slot = rec.idx % INSTRUMENT_SLOTS;
            const inst = noiseInstruments[slot];
            inst.subpatternEnabled = true;
            inst.rows = subpatternFromNoiseMacro(rec.noiseMacro, initialTicksPerRow);
        }
    }

    const orders = parseOrders(reader);
    const routines = parseRoutines(reader, version);

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

export default { parseUGE, readUGEFile, midiNoteToUGE, ugeNoteToString, getUGESummary, getUGEDetailedJSON, subpatternFromNoiseMacro };
