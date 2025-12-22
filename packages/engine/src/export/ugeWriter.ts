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
import { parseEnvelope } from '../chips/gameboy/pulse.js';

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
     * Note(u32) + Instrument(u32) + Volume(u32) + EffectCode(u32) + EffectParams(u8)
     */
    writePatternCell(note: number, instrument: number, effectCode: number, effectParam: number, volume: number = 0x00005A00): void {
        this.writeU32(note);
        this.writeU32(instrument);
        this.writeU32(volume); // Volume field: 0x00005A00 = "no volume change" marker
        this.writeU32(effectCode);
        this.writeU8(effectParam);
    }

    /**
     * Write instrument subpattern cell: 17 bytes
     * Note(u32) + Instrument(u32) + Volume(u32) + EffectCode(u32) + EffectParams(u8)
     * (Same as TCellV2)
     */
    writeInstrumentSubpatternCell(note: number, instrument: number, volume: number, effectCode: number, effectParam: number): void {
        this.writePatternCell(note, instrument, effectCode, effectParam, volume);
    }

    /**
     * Write empty pattern cell (rest)
     */
    writeEmptyCell(): void {
        this.writePatternCell(EMPTY_NOTE, 0, 0, 0);
    }

    /**
     * Write empty instrument subpattern cell
     */
    writeEmptyInstrumentCell(): void {
        this.writeInstrumentSubpatternCell(EMPTY_NOTE, 0, 0, 0, 0);
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
    sweepDir: number = 1, // 0=increase, 1=decrease
    sweepChange: number = 0, // 0-7
    lengthEnabled: boolean = false,
    length: number = 0,
): void {
    w.writeU32(InstrumentType.DUTY);
    w.writeShortString(name);
    w.writeU32(length);
    w.writeBool(lengthEnabled);
    w.writeU8(initialVolume);
    w.writeU32(sweepDir); // volume_sweep_dir (0=Increase, 1=Decrease)
    w.writeU8(sweepChange); // volume_sweep_change
    w.writeU32(0); // freq_sweep_time
    w.writeU32(0); // sweep_enabled
    w.writeU32(0); // freq_sweep_shift
    w.writeU8(duty); // duty_cycle
    w.writeU32(0); // unused_a
    w.writeU32(0); // unused_b
    w.writeU32(0); // counter_step (TStepWidth) - MISSING in previous version

    // Subpattern: ALWAYS write 64 rows (part of TInstrumentV3 structure)
    w.writeBool(false); // subpattern_enabled (set to false by default)
    for (let row = 0; row < PATTERN_ROWS; row++) {
        w.writeEmptyInstrumentCell();
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
    w.writeU8(0); // unused1_u8
    w.writeU32(0); // unused2_u32
    w.writeU8(0); // unused3_u8
    w.writeU32(0); // unused4_u32
    w.writeU32(0); // unused5_u32
    w.writeU32(0); // unused6_u32
    w.writeU8(0); // unused7_u8
    w.writeU32(volume); // output_level
    w.writeU32(waveIndex); // wave_index
    w.writeU32(0); // counter_step (TStepWidth) - MISSING in previous version

    // Subpattern: ALWAYS write 64 rows
    w.writeBool(false); // subpattern_enabled (set to false by default)
    for (let row = 0; row < PATTERN_ROWS; row++) {
        w.writeEmptyInstrumentCell();
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
    sweepDir: number = 1, // 0=increase, 1=decrease
    sweepChange: number = 0, // 0-7, envelope period
    lengthEnabled: boolean = true,
    length: number = 8, // Short length for percussion
): void {
    w.writeU32(InstrumentType.NOISE);
    w.writeShortString(name);
    w.writeU32(length);
    w.writeBool(lengthEnabled);
    w.writeU8(initialVolume);
    w.writeU32(sweepDir); // volume_sweep_dir (0=Increase, 1=Decrease)
    w.writeU8(sweepChange); // volume_sweep_change
    w.writeU32(0); // unused_a
    w.writeU32(0); // unused_b
    w.writeU32(0); // unused_c
    w.writeU8(0); // unused_d
    w.writeU32(0); // unused_e
    w.writeU32(0); // unused_f
    w.writeU32(0); // noise_mode / counter_step

    // Subpattern: ALWAYS write 64 rows
    w.writeBool(false); // subpattern_enabled (set to false by default)
    for (let row = 0; row < PATTERN_ROWS; row++) {
        w.writeEmptyInstrumentCell();
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
    dutyInsts: string[],
    waveInsts: string[],
    noiseInsts: string[],
): number {
    // If no instrument specified, return 0 (default)
    if (!instName) return 0;

    // Look up instrument in song model
    const inst = instruments[instName] || instProps;
    if (!inst) return 0;

    const type = inst.type?.toLowerCase();

    // Map to appropriate instrument index based on type and channel
    // UGE uses 0-based instrument indexing:
    // 0-14 = duty instruments (array indices 0-14)
    // 15-29 = wave instruments (array indices 0-14)
    // 30-44 = noise instruments (array indices 0-14)
    if (type === 'pulse1' || type === 'pulse2' || type === 'duty') {
        const idx = dutyInsts.indexOf(instName);
        return idx !== -1 ? idx : 0;
    } else if (type === 'wave') {
        const idx = waveInsts.indexOf(instName);
        return idx !== -1 ? idx + NUM_DUTY_INSTRUMENTS : NUM_DUTY_INSTRUMENTS;
    } else if (type === 'noise') {
        const idx = noiseInsts.indexOf(instName);
        return idx !== -1 ? idx + NUM_DUTY_INSTRUMENTS + NUM_WAVE_INSTRUMENTS : NUM_DUTY_INSTRUMENTS + NUM_WAVE_INSTRUMENTS;
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
    dutyInsts: string[],
    waveInsts: string[],
    noiseInsts: string[],
): Array<Array<{ note: number; instrument: number; effectCode: number; effectParam: number }>> {
    const patterns: Array<Array<{ note: number; instrument: number; effectCode: number; effectParam: number }>> = [];
    
    // Split events into 64-row patterns
    let currentPattern: Array<{ note: number; instrument: number; effectCode: number; effectParam: number }> = [];
    
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        
        let cell: { note: number; instrument: number; effectCode: number; effectParam: number };

        if (event.type === 'rest') {
            // Rest = empty cell (no note trigger, no effect)
            cell = {
                note: EMPTY_NOTE,
                instrument: 0,
                effectCode: 0,
                effectParam: 0,
            };
        } else if (event.type === 'sustain') {
            // Sustain = empty cell (90)
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
                dutyInsts,
                waveInsts,
                noiseInsts,
            );

            cell = {
                note: midiNote,
                instrument: instIndex, // UGE instruments are 0-based
                effectCode: 0,
                effectParam: 0,
            };
        } else if (event.type === 'named') {
            // Named instrument (e.g., percussion) - the token IS the instrument name
            const namedEvent = event as any; // NamedInstrumentEvent
            const instIndex = resolveInstrumentIndex(
                namedEvent.token, // Use token as the instrument name
                namedEvent.instProps,
                instruments,
                channelType,
                dutyInsts,
                waveInsts,
                noiseInsts,
            );
            // For noise channel, use a typical percussion note (48 = good snare/hi-hat frequency)
            const noteValue = (channelType === GBChannel.NOISE) ? 48 : 60;
            cell = {
                note: noteValue,
                instrument: instIndex || 0,
                effectCode: 0,
                effectParam: 0,
            };
        } else {
            // Unknown event type - treat as sustain
            cell = {
                note: EMPTY_NOTE,
                instrument: 0,
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
export async function exportUGE(song: SongModel, outputPath: string, opts?: { debug?: boolean }): Promise<void> {
    const w = new UGEWriter();

    // ====== Header ======
    w.writeU32(UGE_VERSION);
    w.writeShortString(song.pats ? 'BeatBax Song' : 'Untitled');
    w.writeShortString('BeatBax');
    w.writeShortString('Exported from BeatBax live-coding engine');

    // ====== Build instrument lists ======
    const dutyInsts: string[] = [];
    const waveInsts: string[] = [];
    const noiseInsts: string[] = [];

    if (song.insts) {
        for (const [name, inst] of Object.entries(song.insts)) {
            const type = (inst as any).type?.toLowerCase();
            if (type === 'pulse1' || type === 'pulse2' || type === 'duty') {
                if (dutyInsts.length < NUM_DUTY_INSTRUMENTS) dutyInsts.push(name);
            } else if (type === 'wave') {
                if (waveInsts.length < NUM_WAVE_INSTRUMENTS) waveInsts.push(name);
            } else if (type === 'noise') {
                if (noiseInsts.length < NUM_NOISE_INSTRUMENTS) noiseInsts.push(name);
            }
        }
    }

    // ====== Instruments Section ======
    // Write Duty instruments (15 slots)
    for (let i = 0; i < NUM_DUTY_INSTRUMENTS; i++) {
        if (i < dutyInsts.length) {
            const name = dutyInsts[i];
            const inst = (song.insts as any)[name];
            const dutyVal = parseFloat(inst.duty || '50');
            let dutyCycle = 2; // 50%
            if (dutyVal <= 12.5) dutyCycle = 0;
            else if (dutyVal <= 25) dutyCycle = 1;
            else if (dutyVal <= 50) dutyCycle = 2;
            else dutyCycle = 3;

            const env = parseEnvelope(inst.env);
            const initialVol = env.mode === 'gb' ? (env.initial ?? 15) : 15;
            const sweepDir = env.mode === 'gb' ? (env.direction === 'up' ? 0 : 1) : 1;
            const sweepChange = env.mode === 'gb' ? (env.period ?? 0) : 0;

            writeDutyInstrument(w, name, dutyCycle, initialVol, sweepDir, sweepChange);
        } else {
            writeDutyInstrument(w, `DUTY_${i}`, 2, 15, 1, 0);
        }
    }

    // Write Wave instruments (15 slots)
    for (let i = 0; i < NUM_WAVE_INSTRUMENTS; i++) {
        if (i < waveInsts.length) {
            const name = waveInsts[i];
            const inst = (song.insts as any)[name];
            // Wave index mapping: use the slot index i
            writeWaveInstrument(w, name, i);
        } else {
            writeWaveInstrument(w, `WAVE_${i}`, 0);
        }
    }

    // Write Noise instruments (15 slots)
    for (let i = 0; i < NUM_NOISE_INSTRUMENTS; i++) {
        if (i < noiseInsts.length) {
            const name = noiseInsts[i];
            const inst = (song.insts as any)[name];
            const env = parseEnvelope(inst.env);
            const initialVol = env.mode === 'gb' ? (env.initial ?? 15) : 15;
            const sweepDir = env.mode === 'gb' ? (env.direction === 'up' ? 0 : 1) : 1;
            const sweepChange = env.mode === 'gb' ? (env.period ?? 0) : 0;
            writeNoiseInstrument(w, name, initialVol, sweepDir, sweepChange);
        } else {
            writeNoiseInstrument(w, `NOISE_${i}`);
        }
    }

    // ====== Wavetables Section ======
    const wavetables: number[][] = [];
    for (let i = 0; i < NUM_WAVETABLES; i++) {
        const table = new Array(WAVETABLE_SIZE).fill(0);
        if (i < waveInsts.length) {
            const name = waveInsts[i];
            const inst = (song.insts as any)[name];
            
            // Parse wave data (can be string or array)
            let waveData: number[] | undefined;
            if (inst.wave) {
                if (Array.isArray(inst.wave)) {
                    waveData = inst.wave;
                } else if (typeof inst.wave === 'string') {
                    // Parse string like "[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]"
                    try {
                        waveData = JSON.parse(inst.wave);
                    } catch (e) {
                        console.warn(`[WARN] Failed to parse wave data for ${name}: ${inst.wave}`);
                    }
                }
            }
            
            if (waveData && Array.isArray(waveData)) {
                for (let n = 0; n < Math.min(WAVETABLE_SIZE, waveData.length); n++) {
                    table[n] = Math.max(0, Math.min(15, waveData[n]));
                }
                // If 16 entries, repeat to fill 32
                if (waveData.length === 16) {
                    for (let n = 0; n < 16; n++) {
                        table[n + 16] = table[n];
                    }
                }
            }
        }
        wavetables.push(table);
    }

    // Write wavetable data (16 tables × 32 nibbles)
    for (let t = 0; t < NUM_WAVETABLES; t++) {
        for (let n = 0; n < WAVETABLE_SIZE; n++) {
            w.writeU8(wavetables[t][n]);
        }
    }

    // ====== Build patterns per channel ======
    const channelPatterns: Array<Array<Array<{ note: number; instrument: number; effectCode: number; effectParam: number }>>> = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        // Find channel by ID (1-4)
        const chModel = song.channels && song.channels.find(c => c.id === ch + 1);
        const chEvents = (chModel && chModel.events) || [];
        if (opts && opts.debug) console.log(`[DEBUG] Channel ${ch + 1} has ${chEvents.length} events`);
        const patterns = eventsToPatterns(chEvents, (song.insts as any) || {}, ch as GBChannel, dutyInsts, waveInsts, noiseInsts);
        channelPatterns.push(patterns);
    }

    // ====== Song Patterns Section ======
    // Calculate ticks per row from BPM
    // hUGETracker uses a Game Boy timer-based system where lower ticks = faster tempo
    // Formula: BPM = 896 / ticksPerRow (derived from hUGETracker behavior)
    // Examples: 4 ticks/row ≈ 224 BPM, 7 ticks/row ≈ 128 BPM, 8 ticks/row ≈ 112 BPM
    // Note: Due to integer tick constraints, exact BPM matching is not always possible
    // Default: 128 BPM (7 ticks/row) provides exact timing alignment
    const bpm = (song && typeof song.bpm === 'number') ? song.bpm : 128;
    const ticksPerRow = Math.max(1, Math.round(896 / bpm));
    
    w.writeU32(ticksPerRow); // Initial ticks per row
    w.writeBool(false); // Timer based tempo enabled (v6)
    w.writeU32(0); // Timer based tempo divider (v6)

    // Count total patterns across all channels
    const allPatterns: Array<{ channelIndex: number; patternIndex: number; cells: Array<{ note: number; instrument: number; effectCode: number; effectParam: number }> }> = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const patterns = channelPatterns[ch];
        for (let pi = 0; pi < patterns.length; pi++) {
            allPatterns.push({
                channelIndex: ch,
                patternIndex: pi,
                cells: patterns[pi],
            });
        }
    }

    // Add a blank pattern for padding shorter channels
    const blankPatternCells = [];
    for (let i = 0; i < PATTERN_ROWS; i++) {
        blankPatternCells.push({ note: EMPTY_NOTE, instrument: 0, effectCode: 0, effectParam: 0 });
    }
    const blankPatternIndex = allPatterns.length;
    allPatterns.push({ channelIndex: -1, patternIndex: -1, cells: blankPatternCells });

    // Write number of patterns
    w.writeU32(allPatterns.length);

    if (opts && opts.debug) console.log(`[DEBUG] Total patterns: ${allPatterns.length}`);
    if (opts && opts.debug) console.log(`[DEBUG] Pattern breakdown: Ch1=${channelPatterns[0].length}, Ch2=${channelPatterns[1].length}, Ch3=${channelPatterns[2].length}, Ch4=${channelPatterns[3].length}`);

    // Write pattern data
    for (let i = 0; i < allPatterns.length; i++) {
        w.writeU32(i); // Pattern index
        const pattern = allPatterns[i];
        const ch = pattern.channelIndex;
        
        // Debug all channel patterns
            if (ch >= 0 && ch < NUM_CHANNELS) {
                const nonEmpty = pattern.cells.filter((c, idx) => c.note !== EMPTY_NOTE || c.instrument !== 0);
                if (opts && opts.debug) console.log(`[DEBUG] Pattern ${i} for channel ${ch + 1}: ${nonEmpty.length} non-empty cells out of ${pattern.cells.length} total rows`);
                if (nonEmpty.length <= 20) {
                    if (opts && opts.debug) console.log(`[DEBUG]   Non-empty cells:`, nonEmpty.map((c) => {
                        const rowIdx = pattern.cells.indexOf(c);
                        return `row${rowIdx}:note=${c.note},inst=${c.instrument}`;
                    }).join('; '));
                }
            }
        
        // Write cells with instrument index conversion
        for (const cell of pattern.cells) {
            // Convert absolute instrument index to relative index based on channel type
            // UGE pattern cells use 1-based indices (1-15) within each instrument type
            // 0 means "no instrument" (use previous/default)
            let relativeInstrument = cell.instrument;
            if (ch >= 0 && ch < NUM_CHANNELS) {
                if (ch === 0 || ch === 1) {
                    // Duty channels: absolute index 0-14 → relative 1-15
                    if (cell.instrument >= 0 && cell.instrument < NUM_DUTY_INSTRUMENTS) {
                        relativeInstrument = cell.instrument + 1;
                    } else {
                        relativeInstrument = 0; // No instrument
                    }
                } else if (ch === 2) {
                    // Wave channel: absolute index 15-29 → relative 1-15
                    if (cell.instrument >= NUM_DUTY_INSTRUMENTS && cell.instrument < NUM_DUTY_INSTRUMENTS + NUM_WAVE_INSTRUMENTS) {
                        relativeInstrument = (cell.instrument - NUM_DUTY_INSTRUMENTS) + 1;
                    } else {
                        relativeInstrument = 0; // No instrument
                    }
                } else if (ch === 3) {
                    // Noise channel: absolute index 30-44 → relative 1-15
                    if (cell.instrument >= NUM_DUTY_INSTRUMENTS + NUM_WAVE_INSTRUMENTS) {
                        relativeInstrument = (cell.instrument - NUM_DUTY_INSTRUMENTS - NUM_WAVE_INSTRUMENTS) + 1;
                    } else {
                        relativeInstrument = 0; // No instrument
                    }
                }
            }
            w.writePatternCell(cell.note, relativeInstrument, cell.effectCode, cell.effectParam);
        }
    }

    // ====== Song Orders Section ======
    // Find max order length across all channels
    let maxOrderLength = 0;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        maxOrderLength = Math.max(maxOrderLength, channelPatterns[ch].length);
    }
    // Ensure at least one order row exists
    maxOrderLength = Math.max(1, maxOrderLength);

    // Write order lists for 4 channels (Duty1, Duty2, Wave, Noise)
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const patterns = channelPatterns[ch];
        
        // Write order length + 1 (off-by-one per UGE spec)
        w.writeU32(maxOrderLength + 1);
        
        // Write order indices
        let patternIndexOffset = 0;
        for (let prevCh = 0; prevCh < ch; prevCh++) {
            patternIndexOffset += channelPatterns[prevCh].length;
        }
        
        //if (ch === 3) {
        //    if (opts && opts.debug) console.log(`[DEBUG] Channel 4 order list: length=${maxOrderLength}, patternIndexOffset=${patternIndexOffset}`);
        //}
        
        for (let i = 0; i < maxOrderLength; i++) {
            if (i < patterns.length) {
                const patIdx = patternIndexOffset + i;
                //if (ch === 3) {
                //    if (opts && opts.debug) console.log(`[DEBUG] Channel 4 order[${i}] = pattern ${patIdx}`);
                //}
                w.writeU32(patIdx);
            } else {
                // Pad with the blank pattern
                w.writeU32(blankPatternIndex);
            }
        }
        
        // Write off-by-one filler
        w.writeU32(0);
    }

    // ====== Routines Section ======
    // Write 16 empty routine strings
    for (let i = 0; i < NUM_ROUTINES; i++) {
        w.writeString('');
    }

    // Write final binary
    const out = w.toBuffer();
    writeFileSync(outputPath, out);
    console.log(`[OK] Exported UGE v6 file: ${outputPath} (${out.length} bytes, ${ticksPerRow} ticks/row @ ${bpm} BPM)`);
}

export default exportUGE;
