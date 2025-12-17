/**
 * UGE v6 binary file writer for hUGETracker.
 * 
 * This writer exports a beatbax SongModel to a valid UGE v6 file that can be
 * opened in hUGETracker and processed by uge2source.exe.
 * 
 * Format spec: Based on hUGETracker source (song.pas, HugeDatatypes.pas)
 * Reference implementation: generate_minimal_uge.py (validated with uge2source.exe)
 * 
 * Key discoveries:
 * - TInstrumentV3 is a packed record with embedded TPattern (64 cells × 17 bytes)
 * - SubpatternEnabled is a semantic flag; bytes are ALWAYS written (1381 bytes per instrument)
 * - Pascal AnsiString format: u32 length + bytes (length does NOT include null terminator)
 * - Pattern cell v6 (TCellV2): 17 bytes = Note(u32) + Instrument(u32) + Volume(u32) + EffectCode(u32) + EffectParams(u8)
 * - Volume field: 0x00005A00 (23040) means "no volume change"
 */

import { writeFileSync } from 'fs';
import { SongModel, ChannelEvent, NoteEvent } from '../song/songModel.js';

// Constants from UGE v6 spec
const UGE_VERSION = 6;
const NUM_DUTY_INSTRUMENTS = 15;
const NUM_WAVE_INSTRUMENTS = 15;
const NUM_NOISE_INSTRUMENTS = 15;
const NUM_WAVETABLES = 16;
const WAVETABLE_SIZE = 32; // 32 nibbles (4-bit values)
const PATTERN_ROWS = 64;
const NUM_CHANNELS = 4;
const NUM_ROUTINES = 16;
const EMPTY_NOTE = 90; // Note value for empty/rest cells

// Game Boy channel mapping
enum GBChannel {
    PULSE1 = 0,
    PULSE2 = 1,
    WAVE = 2,
    NOISE = 3,
}

// Instrument types
enum InstrumentType {
    DUTY = 0,
    WAVE = 1,
    NOISE = 2,
}

/**
 * Binary buffer writer with helper methods for UGE format.
 */
class UGEWriter {
    private buffer: number[] = [];

    writeU8(val: number): void {
        this.buffer.push(val & 0xff);
    }

    writeU32(val: number): void {
        this.buffer.push(val & 0xff);
        this.buffer.push((val >> 8) & 0xff);
        this.buffer.push((val >> 16) & 0xff);
        this.buffer.push((val >> 24) & 0xff);
    }

    writeBool(val: boolean): void {
        this.writeU8(val ? 1 : 0);
    }

    /**
     * Write shortstring: 1 byte length + 255 bytes (padded with zeros)
     */
    writeShortString(s: string): void {
        const bytes = Buffer.from(s.substring(0, 255), 'utf-8');
        this.writeU8(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            this.buffer.push(bytes[i]);
        }
        // Pad to 255 bytes
        for (let i = bytes.length; i < 255; i++) {
            this.buffer.push(0);
        }
    }

    /**
     * Write string: u32 length + bytes (Pascal AnsiString format)
     * Length does NOT include null terminator.
     */
    writeString(s: string): void {
        const bytes = Buffer.from(s, 'utf-8');
        this.writeU32(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            this.buffer.push(bytes[i]);
        }
    }

    /**
     * Write a pattern cell (TCellV2): 17 bytes
     * Note(u32) + Instrument(u32) + Unused(u32) + EffectCode(u32) + EffectParams(u8)
     */
    writePatternCell(note: number, instrument: number, effectCode: number, effectParam: number): void {
        this.writeU32(note);
        this.writeU32(instrument);
        this.writeU32(0); // unused field in v6
        this.writeU32(effectCode);
        this.writeU8(effectParam);
    }

    /**
     * Write empty pattern cell (rest)
     */
    writeEmptyCell(): void {
        this.writePatternCell(EMPTY_NOTE, 0, 0, 0);
    }

    toBuffer(): Buffer {
        return Buffer.from(this.buffer);
    }
}

/**
 * Write a minimal duty instrument (TInstrumentV3 with type=0)
 * Total size: 1381 bytes = 293 base + 1088 subpattern
 */
function writeDutyInstrument(
    w: UGEWriter,
    name: string,
    duty: number = 2, // 0=12.5%, 1=25%, 2=50%, 3=75%
    initialVolume: number = 15,
    lengthEnabled: boolean = false,
    length: number = 0,
): void {
    w.writeU32(InstrumentType.DUTY);
    w.writeShortString(name);
    w.writeU32(length);
    w.writeBool(lengthEnabled);
    w.writeU8(initialVolume);
    w.writeU32(0); // volume_sweep_dir
    w.writeU8(0); // volume_sweep_change
    w.writeU32(0); // freq_sweep_time
    w.writeU32(0); // sweep_enabled
    w.writeU32(0); // freq_sweep_shift
    w.writeU8(duty); // duty_cycle
    w.writeU32(0); // unused_a
    w.writeU32(0); // unused_b
    w.writeU32(0); // counter_step

    // Subpattern: ALWAYS write 64 rows (part of TInstrumentV3 structure)
    w.writeBool(false); // subpattern_enabled
    for (let row = 0; row < PATTERN_ROWS; row++) {
        w.writeEmptyCell();
    }
}

/**
 * Write a minimal wave instrument (TInstrumentV3 with type=1)
 * Total size: 1381 bytes
 */
function writeWaveInstrument(
    w: UGEWriter,
    name: string,
    waveIndex: number = 0,
    volume: number = 3, // 0=mute, 1=100%, 2=50%, 3=25%
    lengthEnabled: boolean = false,
    length: number = 0,
): void {
    w.writeU32(InstrumentType.WAVE);
    w.writeShortString(name);
    w.writeU32(length);
    w.writeBool(lengthEnabled);
    w.writeU8(0); // unused1
    w.writeU32(0); // unused2
    w.writeU8(0); // unused3
    w.writeU32(0); // unused4
    w.writeU32(0); // unused5
    w.writeU32(0); // unused6
    w.writeU8(0); // unused7
    w.writeU32(volume); // output_level
    w.writeU32(waveIndex); // wave_index
    w.writeU32(0); // counter_step

    // Subpattern: ALWAYS write 64 rows
    w.writeBool(false);
    for (let row = 0; row < PATTERN_ROWS; row++) {
        w.writeEmptyCell();
    }
}

/**
 * Write a minimal noise instrument (TInstrumentV3 with type=2)
 * Total size: 1381 bytes
 */
function writeNoiseInstrument(
    w: UGEWriter,
    name: string,
    initialVolume: number = 15,
    lengthEnabled: boolean = false,
    length: number = 0,
): void {
    w.writeU32(InstrumentType.NOISE);
    w.writeShortString(name);
    w.writeU32(length);
    w.writeBool(lengthEnabled);
    w.writeU8(initialVolume);
    w.writeU32(1); // volume_sweep_dir
    w.writeU8(0); // volume_sweep_change
    w.writeU32(0); // unused_a
    w.writeU32(0); // unused_b
    w.writeU32(0); // unused_c
    w.writeU8(0); // unused_d
    w.writeU32(0); // unused_e
    w.writeU32(0); // unused_f
    w.writeU32(0); // counter_step

    // Subpattern: ALWAYS write 64 rows
    w.writeBool(false);
    for (let row = 0; row < PATTERN_ROWS; row++) {
        w.writeEmptyCell();
    }
}

/**
 * Convert note name (e.g. "C4") to MIDI note number
 */
/**
 * Convert note name (e.g., "C5") to hUGETracker note index.
 * hUGETracker uses indices 0-72 where 0 = C-3, 12 = C-4, 24 = C-5, etc.
 * This is MIDI note number minus 36 (3 octaves offset).
 * Notes below C-3 are transposed up by octaves to fit in range.
 */
function noteNameToMidiNote(noteName: string): number {
    const match = noteName.match(/^([A-G]#?)(-?\d+)$/i);
    if (!match) return EMPTY_NOTE;

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const [, pitch, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const noteIndex = noteNames.indexOf(pitch.toUpperCase());
    
    if (noteIndex === -1) return EMPTY_NOTE;
    
    // Calculate MIDI note number
    let midiNote = (octave + 1) * 12 + noteIndex;
    
    // Convert to hUGETracker index: MIDI C3 (48) = UGE index 12 = C-4
    // So UGE index = MIDI note - 36
    let ugeIndex = midiNote - 36;
    
    // If below range, transpose up by octaves until in range
    while (ugeIndex < 0 && ugeIndex + 12 <= 72) {
        ugeIndex += 12;
    }
    
    // If above range, transpose down by octaves until in range
    while (ugeIndex > 72) {
        ugeIndex -= 12;
    }
    
    // Valid range is 0-72 (C-3 to C-9)
    if (ugeIndex < 0 || ugeIndex > 72) return EMPTY_NOTE;
    
    return ugeIndex;
}

/**
 * Map beatbax instrument to Game Boy instrument index
 */
function resolveInstrumentIndex(
    instName: string | undefined,
    instProps: Record<string, string> | undefined,
    instruments: Record<string, Record<string, string>>,
    channelType: GBChannel,
): number {
    // If no instrument specified, return 0 (default)
    if (!instName) return 0;

    // Look up instrument in song model
    const inst = instruments[instName] || instProps;
    if (!inst) return 0;

    const type = inst.type?.toLowerCase();

    // Map to appropriate instrument index based on type and channel
    if (type === 'pulse1' || type === 'pulse2' || type === 'duty') {
        // Duty instruments: 0-14
        return 0; // Default to first duty instrument
    } else if (type === 'wave') {
        // Wave instruments: 0-14
        return 0; // Default to first wave instrument
    } else if (type === 'noise') {
        // Noise instruments: 0-14
        return 0; // Default to first noise instrument
    }

    return 0;
}

/**
 * Convert beatbax channel events to UGE pattern cells
 * Returns patterns (64-row chunks) for a single channel
 */
function eventsToPatterns(
    events: ChannelEvent[],
    instruments: Record<string, Record<string, string>>,
    channelType: GBChannel,
): Array<Array<{ note: number; instrument: number; effectCode: number; effectParam: number }>> {
    const patterns: Array<Array<{ note: number; instrument: number; effectCode: number; effectParam: number }>> = [];
    
    // Split events into 64-row patterns
    let currentPattern: Array<{ note: number; instrument: number; effectCode: number; effectParam: number }> = [];
    
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        
        let cell: { note: number; instrument: number; effectCode: number; effectParam: number };

        if (event.type === 'rest') {
            // Rest = empty cell
            cell = {
                note: EMPTY_NOTE,
                instrument: 0,
                effectCode: 0,
                effectParam: 0,
            };
        } else if (event.type === 'note') {
            const noteEvent = event as NoteEvent;
            const midiNote = noteNameToMidiNote(noteEvent.token);
            const instIndex = resolveInstrumentIndex(
                noteEvent.instrument,
                noteEvent.instProps,
                instruments,
                channelType,
            );

            cell = {
                note: midiNote,
                instrument: instIndex + 1, // UGE instruments are 1-indexed (0 = no instrument)
                effectCode: 0,
                effectParam: 0,
            };
        } else {
            // Named instrument (e.g., percussion) - treat as note trigger
            cell = {
                note: 60, // Default to middle C for named instruments
                instrument: 1,
                effectCode: 0,
                effectParam: 0,
            };
        }
        
        currentPattern.push(cell);
        
        // When pattern reaches 64 rows, start a new one
        if (currentPattern.length >= PATTERN_ROWS) {
            patterns.push(currentPattern);
            currentPattern = [];
        }
    }
    
    // Add final pattern if it has any rows
    if (currentPattern.length > 0) {
        // Pad to 64 rows
        while (currentPattern.length < PATTERN_ROWS) {
            currentPattern.push({
                note: EMPTY_NOTE,
                instrument: 0,
                effectCode: 0,
                effectParam: 0,
            });
        }
        patterns.push(currentPattern);
    }
    
    // If no patterns, create one empty pattern
    if (patterns.length === 0) {
        const emptyPattern: Array<{ note: number; instrument: number; effectCode: number; effectParam: number }> = [];
        for (let i = 0; i < PATTERN_ROWS; i++) {
            emptyPattern.push({
                note: EMPTY_NOTE,
                instrument: 0,
                effectCode: 0,
                effectParam: 0,
            });
        }
        patterns.push(emptyPattern);
    }
    
    return patterns;
}

/**
 * Export a beatbax SongModel to UGE v6 binary format.
 */
export async function exportUGE(song: SongModel, outputPath: string): Promise<void> {
    const w = new UGEWriter();

    // ====== Header ======
    w.writeU32(UGE_VERSION);
    w.writeShortString(song.pats ? 'BeatBax Song' : 'Untitled');
    w.writeShortString('BeatBax');
    w.writeShortString('Exported from BeatBax live-coding engine');

    // ====== Instruments (minimal set) ======
    // For now emit minimal default instruments so UGE file is loadable.
    // 15 duty, 15 wave, 15 noise, 16 wavetables
    for (let i = 0; i < NUM_DUTY_INSTRUMENTS; i++) writeDutyInstrument(w, `DUTY_${i}`, 2);
    for (let i = 0; i < NUM_WAVE_INSTRUMENTS; i++) writeWaveInstrument(w, `WAVE_${i}`, 0);
    for (let i = 0; i < NUM_NOISE_INSTRUMENTS; i++) writeNoiseInstrument(w, `NOISE_${i}`);

    // Write wavetable data (16 tables × 32 nibbles)
    for (let t = 0; t < NUM_WAVETABLES; t++) {
        // Write 32 nibbles packed into 2 bytes each nibble? Keep simple: write 32 bytes (0-15)
        for (let n = 0; n < WAVETABLE_SIZE; n++) {
            w.writeU8(0);
        }
    }

    // ====== Patterns per channel ======
    const orders: number[] = [];
    const channelPatterns: Array<Array<Array<{ note: number; instrument: number; effectCode: number; effectParam: number }>>> = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const chModel = song.channels && song.channels[ch];
        const chEvents = (chModel && chModel.events) || [];
        const patterns = eventsToPatterns(chEvents, (song.insts as any) || {}, ch as GBChannel);
        channelPatterns.push(patterns);
        // build order list: simply 0..(patterns.length-1)
        orders.push(0);
    }

    // Write order length and orders (minimal)
    w.writeU32(1);
    w.writeU32(0);

    // Write number of unique patterns and pattern data (concatenate per channel)
    // For simplicity assume each channel has its own pattern bank
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const patterns = channelPatterns[ch];
        w.writeU32(patterns.length);
        for (const pat of patterns) {
            for (const cell of pat) {
                w.writePatternCell(cell.note, cell.instrument, cell.effectCode, cell.effectParam);
            }
        }
    }

    // Write final binary
    const out = w.toBuffer();
    writeFileSync(outputPath, out);
    console.log(`[OK] Exported UGE v6 file: ${outputPath} (${out.length} bytes)`);
}

export default exportUGE;
