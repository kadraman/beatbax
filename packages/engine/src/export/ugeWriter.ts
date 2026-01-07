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
import { parseEnvelope, parseSweep } from '../chips/gameboy/pulse.js';
import { warn } from '../util/diag.js';

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

// Vibrato depth scaling applied when encoding 4xy for UGE export.
// Some trackers and synths use different depth units; tune this to match hUGE.
const VIB_DEPTH_SCALE = 4.0;

function encodeVibParam(rate: number, depth: number): number {
    const d = Math.max(0, Math.min(15, Math.round(depth * VIB_DEPTH_SCALE)));
    const r = Math.max(0, Math.min(15, Math.round(rate)));
    return ((r & 0xf) << 4) | (d & 0xf);
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
    freqSweepTime: number = 0,
    freqSweepDir: number = 0, // 0=up, 1=down
    freqSweepShift: number = 0,
): void {
    w.writeU32(InstrumentType.DUTY);
    w.writeShortString(name);
    w.writeU32(length);
    w.writeBool(lengthEnabled);
    w.writeU8(initialVolume);
    w.writeU32(sweepDir); // volume_sweep_dir (0=Increase, 1=Decrease)
    w.writeU8(sweepChange); // volume_sweep_change
    w.writeU32(freqSweepTime); // freq_sweep_time
    w.writeU32(freqSweepDir); // freq_sweep_direction (0=up, 1=down)
    w.writeU32(freqSweepShift); // freq_sweep_shift
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
export function mapWaveVolumeToUGE(vol: any): number {
    // Accept numbers or percent strings (e.g. '50%'). Default is 100 => maps to UGE value 1
    let vNum = 100;
    if (vol !== undefined && vol !== null) {
        if (typeof vol === 'string') {
            const s = vol.trim();
            vNum = s.endsWith('%') ? parseInt(s.slice(0, -1), 10) : parseInt(s, 10);
        } else {
            vNum = Number(vol);
        }
    }
    if (![0, 25, 50, 100].includes(vNum)) vNum = 100;
    // UGE mapping: 0=mute, 1=100%, 2=50%, 3=25%
    const map: Record<number, number> = { 0: 0, 100: 1, 50: 2, 25: 3 };
    return map[vNum];
}

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
    // output_level: per hUGE v6 spec this is a raw selector value (0..3) not a full envelope or percent.
    // Values: 0=mute, 1=100%, 2=50%, 3=25%. hUGEDriver expands this to NR32 by doing (output_level << 5) when writing to hardware.
    // Store as u32 for struct alignment in TInstrumentV3.
    w.writeU32(volume); // output_level (raw 0..3 per hUGE spec)
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
    noiseMode: number = 0, // 0=15-bit, 1=7-bit
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
    w.writeU32(noiseMode); // noise_mode: 0=15-bit, 1=7-bit

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
 *
 * @param noteName - Note name like "C4", "D#5"
 * @param ugeTranspose - Optional transpose in semitones for UGE export only (e.g., +12 = up one octave)
 */
function noteNameToMidiNote(noteName: string, ugeTranspose: number = 0): number {
    const match = noteName.match(/^([A-G]#?)(-?\d+)$/i);
    if (!match) return EMPTY_NOTE;

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const [, pitch, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const noteIndex = noteNames.indexOf(pitch.toUpperCase());

    if (noteIndex === -1) return EMPTY_NOTE;

    // Calculate MIDI note number and apply UGE-specific transpose
    let midiNote = (octave + 1) * 12 + noteIndex + ugeTranspose;

    // Convert to hUGETracker index
    // hUGETracker's "C3" (index 0) corresponds to MIDI note 36,
    // which is the note C2 at approximately 65.4 Hz in standard MIDI tuning.
    let ugeIndex = midiNote - 36;

    // hUGETracker minimum note is index 0 (displayed as C3)
    const originalIndex = ugeIndex;

    // If below range, transpose up by octaves until in range
    while (ugeIndex < 0 && ugeIndex + 12 <= 72) {
        ugeIndex += 12;
    }

    // Warn if note was transposed (below C3)
    if (originalIndex < 0 && ugeIndex >= 0) {
        const octavesShifted = Math.ceil(Math.abs(originalIndex) / 12);
        warn('export', `Note ${noteName} is below hUGETracker minimum (C3). Transposed up ${octavesShifted} octave(s).`);
    }

    // If above range, transpose down by octaves until in range
    while (ugeIndex > 72) {
        ugeIndex -= 12;
    }

    // Valid range is 0-72 (C-3 to C-9 in hUGETracker)
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
    strictGb: boolean = false,
    songBpm?: number,
    desiredVibMap?: Map<number, number>,
): Array<Array<{ note: number; instrument: number; effectCode: number; effectParam: number; pan?: 'L' | 'R' | 'C' }>> {
    const patterns: Array<Array<{ note: number; instrument: number; effectCode: number; effectParam: number; pan?: 'L' | 'R' | 'C' }>> = [];

    // Split events into 64-row patterns
    try { console.log('[DEBUG UGE] eventsToPatterns start, events.length=', events ? events.length : 0, events && events.slice(0,8).map(e=>e && (e as any).type)); } catch(e) {}
    let currentPattern: Array<{ note: number; instrument: number; effectCode: number; effectParam: number; pan?: 'L' | 'R' | 'C' }> = [];

    // Compute engine tick length (seconds per pattern row) from song BPM so
    // we can convert any `durationSec` normalized by the resolver back into
    // a row count when exporting to tracker rows. Prefer an explicit `songBpm`
    // passed from the exporter.
    const bpmForTicks = (typeof songBpm === 'number' && Number.isFinite(songBpm)) ? songBpm : 128;
    const tickSeconds = (60 / bpmForTicks) / 4; // same semantics used by resolver

    // Track the last active pan for this channel so sustain rows inherit it
    let currentPan: 'L' | 'R' | 'C' = 'C';
    // Rows where we should force a note cutoff by setting volume=0 on the empty cell
    const endCutRows = new Set<number>();
    // Map of target global row -> cut parameter (ticks) to write as ECx
    const cutParamMap: Map<number, number> = new Map();
    // Track active per-channel vibrato so we can repeat it on sustain rows.
    // `remainingRows` is optional; if present it counts sustain rows left AFTER the note row.
    let activeVib: { code: number; param: number; remainingRows?: number } | null = null;
    // Map of note globalRow -> desired durationRows (including the note row)
    if (!desiredVibMap) desiredVibMap = new Map();
    let prevEventType: string | null = null;
    for (let i = 0; i < events.length; i++) {
        const event = events[i];

        let cell: { note: number; instrument: number; effectCode: number; effectParam: number; pan?: 'L' | 'R' | 'C' };

        if (event.type === 'rest') {
            // Rest = empty cell (no note trigger, no effect) but inherit current pan
            // If this rest immediately follows a note or sustain, emit an explicit
            // Note Cut effect so trackers show the termination.
            let effCode = 0;
            let effParam = 0;
            if (prevEventType === 'note' || prevEventType === 'sustain') {
                // Emit as extended effect group E0x (note cut). Sub-effect=0, param=0
                effCode = 0xE;
                effParam = (0 << 4) | (0 & 0xF);
            }
            cell = {
                note: EMPTY_NOTE,
                instrument: 0,
                effectCode: effCode,
                effectParam: effParam,
                pan: currentPan,
            };
        } else if (event.type === 'sustain') {
            // Sustain = ongoing note; retain currentPan. If a vibrato was active on the
            // previous note row, repeat that effect on this sustain row until the note ends
            // or until an explicit vib duration has expired.
            let effCode = 0;
            let effParam = 0;
            if (activeVib) {
                // If remainingRows is undefined, vib continues for full note (until note ends).
                if (typeof activeVib.remainingRows === 'undefined' || activeVib.remainingRows > 0) {
                    effCode = activeVib.code;
                    effParam = activeVib.param;
                }
                try { console.log('[DEBUG UGE] sustain applying vib, remainingRows (before) =', (activeVib as any).remainingRows); } catch(e) {}
                try { console.log('[DEBUG UGE] sustain row debug', { globalRow: i, effApplied: effCode === (activeVib as any).code, remainingRowsBefore: (activeVib as any).remainingRows }); } catch(e) {}
            }
            cell = {
                note: EMPTY_NOTE,
                instrument: 0,
                effectCode: effCode,
                effectParam: effParam,
                pan: currentPan,
            };
            // Decrement remainingRows if present
            if (activeVib && typeof activeVib.remainingRows === 'number') {
                activeVib.remainingRows = Math.max(0, activeVib.remainingRows - 1);
                try { console.log('[DEBUG UGE] sustain vib remainingRows (after) =', activeVib.remainingRows); } catch(e) {}
                if (activeVib.remainingRows === 0) {
                    // Once expired, clear activeVib so further sustains don't repeat it
                    activeVib = null;
                }
            }
        } else if (event.type === 'note') {
            const noteEvent = event as NoteEvent;

            // Compute sustain length (count following sustain events) and mark the
            // first row AFTER the sustain as an explicit cut row so we can mute it
            // on export (some trackers require explicit volume change to stop sound).
            let sustainCount = 0;
            try {
                for (let k = i + 1; k < events.length; k++) {
                    const ne = events[k];
                    if (ne && (ne as any).type === 'sustain') sustainCount++;
                    else break;
                }
                const targetRow = i + sustainCount; // last sustain or same note row
                endCutRows.add(targetRow);
                try { console.log('[DEBUG UGE] mark endCutRow', targetRow); } catch(e) {}
                // determine cut parameter: explicit `cut` effect on the note, or
                // fall back to a 4th positional param on other effects if present
                let cutParam: number | undefined = undefined;
                if (Array.isArray(noteEvent.effects) && noteEvent.effects.length > 0) {
                    for (const fx of noteEvent.effects) {
                        if (!fx) continue;
                        const name = (fx.type || fx).toString().toLowerCase();
                        const params = fx.params || (Array.isArray(fx) ? fx : []);
                        if (name === 'cut') {
                            const p0 = params.length > 0 ? Number(params[0]) : NaN;
                            if (Number.isFinite(p0)) {
                                cutParam = Math.max(0, Math.min(255, Math.round(p0)));
                                break;
                            }
                        }
                        if (cutParam === undefined && params && params.length > 3) {
                            const p3 = Number(params[3]);
                            if (Number.isFinite(p3)) cutParam = Math.max(0, Math.min(255, Math.round(p3)));
                        }
                    }
                }
                if (typeof cutParam === 'undefined' || cutParam === null) cutParam = 0;
                cutParamMap.set(targetRow, cutParam);
            } catch (e) {}

            // Check for uge_transpose in instrument properties
            const inst = noteEvent.instrument ? instruments[noteEvent.instrument] : undefined;
            const ugeTranspose = inst?.uge_transpose ? parseInt(inst.uge_transpose, 10) : 0;

            const midiNote = noteNameToMidiNote(noteEvent.token, ugeTranspose);
            const instIndex = resolveInstrumentIndex(
                noteEvent.instrument,
                noteEvent.instProps,
                instruments,
                channelType,
                dutyInsts,
                waveInsts,
                noiseInsts,
            );

            // Determine per-note pan enum (L/C/R)
            let panEnum: 'L' | 'R' | 'C' = currentPan;
            // Inline note pan -> instrument GB pan -> instrument pan
            const notePan = convertPanToEnum(noteEvent.pan, strictGb, 'inline');
            if (notePan) {
                panEnum = notePan;
            } else if (inst) {
                const gbP = convertPanToEnum(inst['gb:pan'], strictGb, 'instrument');
                if (gbP) panEnum = gbP;
                else {
                    const instP = convertPanToEnum(inst['pan'], strictGb, 'instrument');
                    if (instP) panEnum = instP;
                }
            }

            // Update currentPan for subsequent sustain/rest rows
            currentPan = panEnum;

            // Base cell
            cell = {
                note: midiNote,
                instrument: instIndex, // UGE instruments are 0-based
                effectCode: 0,
                effectParam: 0,
                pan: panEnum,
            };

            // Map per-note effects to UGE effect codes (vibrato mapping implemented)
            try {
                // Reset any active vibrato for this note; we'll set it if this note defines vib
                activeVib = null;
                if (Array.isArray(noteEvent.effects) && noteEvent.effects.length > 0) {
                    for (const fx of noteEvent.effects) {
                        if (!fx) continue;
                        const name = fx.type || fx;
                        const params = fx.params || (Array.isArray(fx) ? fx : []);
                        if (String(name).toLowerCase() === 'vib') {
                            // Expect params: [depth, rate] or [depth]
                            const depthRaw = params.length > 0 ? Number(params[0]) : 0;
                            const rateRaw = params.length > 1 ? Number(params[1]) : 4;
                            const shapeRaw = params.length > 2 ? params[2] : undefined;
                            // Prefer an explicit 4th positional param if present so
                            // positional empties are preserved. Fall back to the
                            // raw paramsStr if the parser stripped empty slots. If
                            // neither is present, use the resolver-provided
                            // durationSec converted back to rows using tickSeconds.
                            let durationRowsRaw: any = undefined;
                            if (params && params.length > 3 && Number.isFinite(Number(params[3]))) {
                                durationRowsRaw = params[3];
                            } else if ((fx as any).paramsStr && typeof (fx as any).paramsStr === 'string') {
                                const rawParts = (fx as any).paramsStr.split(',').map((s: string) => s.trim());
                                if (rawParts.length > 3) {
                                    const p3 = Number(rawParts[3]);
                                    if (Number.isFinite(p3)) durationRowsRaw = p3;
                                }
                            } else if ((fx as any).durationSec && Number.isFinite((fx as any).durationSec)) {
                                const drFromSec = Math.max(0, Math.round(((fx as any).durationSec) / tickSeconds));
                                durationRowsRaw = drFromSec;
                            }
                            const depth = Number.isFinite(depthRaw) ? Math.max(0, Math.min(15, Math.round(depthRaw))) : 0;
                            const rate = Number.isFinite(rateRaw) ? Math.max(0, Math.min(15, Math.round(rateRaw))) : 4;
                            const param = encodeVibParam(rate, depth);
                            cell.effectCode = 4;
                            cell.effectParam = param & 0xff;
                            // Record as active vibrato so sustain rows repeat it. If a duration
                            // (in rows) was provided as the 4th positional param, honor it.
                            let remainingRows: number | undefined = undefined;
                            if (typeof durationRowsRaw !== 'undefined' && durationRowsRaw !== null) {
                                const dr = Number(durationRowsRaw);
                                if (Number.isFinite(dr) && dr > 0) {
                                    // record desired vib rows (note + sustains) for post-pass enforcement
                                    desiredVibMap.set(i, dr);
                                    // Note row consumes one row; remainingRows counts sustain rows left.
                                    remainingRows = Math.max(0, Math.floor(dr) - 1);
                                    // Clamp to the available sustain count so vibrato cannot
                                    // extend beyond the note's actual sustain length.
                                    if (typeof sustainCount === 'number') {
                                        remainingRows = Math.min(remainingRows, sustainCount);
                                    }
                                }
                            }
                            try {
                                console.log('[DEBUG UGE] vib duration detection', { note: noteEvent.token, paramsStr: (fx as any).paramsStr, durationSec: (fx as any).durationSec, durationRowsRaw, remainingRows, sustainCount, bpmForTicks });
                            } catch (e) {}
                            try {
                                if (typeof remainingRows === 'undefined') {
                                    console.log('[DEBUG UGE] vib set as indefinite (no duration supplied)');
                                } else {
                                    console.log('[DEBUG UGE] Setting activeVib', { note: noteEvent.token, remainingRows });
                                }
                            } catch (e) {}
                            activeVib = { code: 4, param: cell.effectParam, remainingRows };
                            // Debug: log mapping including optional shape and remainingRows
                            try { console.log('[DEBUG UGE] Mapped vib -> 4xy', { note: noteEvent.token, depth, rate, shape: shapeRaw, param: cell.effectParam, paramsStr: (fx as any).paramsStr, remainingRows }); } catch (e) {}
                            try { console.log('[DEBUG UGE] vib-set-on-note-row', { globalRow: i, note: noteEvent.token, cellEffect: cell.effectCode, cellParam: cell.effectParam }); } catch (e) {}
                            // Only honor the first vib effect
                            break;
                        }
                    }
                }
            } catch (e) {
                // best-effort: ignore mapping failures
            }
            // If this note did not declare a vib effect, ensure activeVib is cleared so sustain
            // rows following this note won't accidentally carry a previous vibrato.
            if (cell.effectCode !== 4) activeVib = null;
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
            // For named events, derive pan from instrument defaults if present
            let namedPan: 'L' | 'R' | 'C' = currentPan;
            const namedInst = namedEvent.token ? instruments[namedEvent.token] : undefined;
            if (namedInst) {
                const gbP = convertPanToEnum(namedInst['gb:pan'], strictGb, 'instrument');
                if (gbP) namedPan = gbP;
                else {
                    const nP = convertPanToEnum(namedInst['pan'], strictGb, 'instrument');
                    if (nP) namedPan = nP;
                }
            }
            currentPan = namedPan;
            const noteValue = (channelType === GBChannel.NOISE) ? 48 : 60;
            cell = {
                note: noteValue,
                instrument: instIndex || 0,
                effectCode: 0,
                effectParam: 0,
                pan: namedPan,
            };
        } else {
            // Unknown event type - treat as sustain
            cell = {
                note: EMPTY_NOTE,
                instrument: 0,
                effectCode: 0,
                effectParam: 0,
                pan: currentPan,
            };
        }

        // If exporter computed a cutParam for this exact global row, write
        // an explicit Note Cut effect (ECx) on this cell so trackers display it.
        if (cutParamMap.has(i)) {
            const cp = cutParamMap.get(i) || 0;
            const nib = Math.max(0, Math.min(15, cp & 0xff));
            try { console.log('[DEBUG UGE] Applying extended-cut at globalRow', i, 'param', nib); } catch(e) {}
            cell.effectCode = 0xE; // Extended effect group
            cell.effectParam = ((0 & 0xF) << 4) | (nib & 0xF); // E0x -> sub=0 (cut), param=nib
            (cell as any).volume = 0; // also set explicit zero volume as a fallback
        }

        // If this row was marked as an explicit cut, and the cell is empty,
        // emit an explicit Note Cut effect (0xC) so trackers show the cut in
        // the effect column. Also keep volume=0 as a fallback for players
        // that prefer the volume field.
        if (endCutRows.has(i) && cell.note === EMPTY_NOTE) {
            cell.effectCode = 0xE; // Extended effect group
            cell.effectParam = ((0 & 0xF) << 4) | (0 & 0xF); // E00 = immediate cut
            (cell as any).volume = 0; // fallback: explicit zero volume
        }

        // Update prevEventType for next iteration
        prevEventType = event && (event as any).type ? (event as any).type : null;

        currentPattern.push(cell);

        // When pattern reaches 64 rows, start a new one
        if (currentPattern.length >= PATTERN_ROWS) {
            patterns.push(currentPattern);
            currentPattern = [];
        }
    }

    // Add final pattern if it has any rows
    if (currentPattern.length > 0) {
        // Pad to 64 rows. If padding extends past the last event, the global
        // event index for padded rows starts at `events.length` — honor
        // `endCutRows` for these padded rows so explicit cuts at song end are
        // emitted.
        const existing = currentPattern.length;
        const padCount = PATTERN_ROWS - existing;
        for (let j = 0; j < padCount; j++) {
            const globalRow = events.length + j; // global event index for this padded row
            const isCut = endCutRows.has(globalRow);
            const cell: any = {
                note: EMPTY_NOTE,
                instrument: 0,
                effectCode: 0,
                effectParam: 0,
                pan: 'C',
            };
            if (isCut) {
                cell.effectCode = 0xC;
                cell.effectParam = 0x00;
                cell.volume = 0;
            }
            currentPattern.push(cell);
        }
        patterns.push(currentPattern);
    }

    // If no patterns, create one empty pattern
    if (patterns.length === 0) {
        const emptyPattern: Array<{ note: number; instrument: number; effectCode: number; effectParam: number; pan?: 'L' | 'R' | 'C' }> = [];
        for (let i = 0; i < PATTERN_ROWS; i++) {
            emptyPattern.push({
                note: EMPTY_NOTE,
                instrument: 0,
                effectCode: 0,
                effectParam: 0,
                pan: 'C',
            });
        }
        patterns.push(emptyPattern);
    }

    return patterns;
}

/**
 * Helper: snap numeric pan value to GB enum
 */
function snapToGB(value: number): 'L' | 'C' | 'R' {
    if (value < -0.33) return 'L';
    if (value > 0.33) return 'R';
    return 'C';
}

function enumToNR51Bits(p: 'L' | 'C' | 'R', chIndex: number): number {
    // Hardware-accurate NR51 layout (hUGETracker / Game Boy):
    // Pulse1 (ch 0): left=0x01, right=0x10
    // Pulse2 (ch 1): left=0x02, right=0x20
    // Wave   (ch 2): left=0x04, right=0x40
    // Noise  (ch 3): left=0x08, right=0x80
    const LEFT_BITS = [0x01, 0x02, 0x04, 0x08];
    const RIGHT_BITS = [0x10, 0x20, 0x40, 0x80];
    const leftBit = LEFT_BITS[chIndex] || 0;
    const rightBit = RIGHT_BITS[chIndex] || 0;
    if (p === 'L') return leftBit;
    if (p === 'R') return rightBit;
    return leftBit | rightBit;
}

export function convertPanToEnum(pan: any, strictGb: boolean, context: 'instrument' | 'inline' = 'inline'): 'L' | 'C' | 'R' | undefined {
    if (pan === undefined || pan === null) return undefined;
    if (typeof pan === 'object') {
        if (pan.enum) {
            const up = String(pan.enum).toUpperCase();
            if (up === 'L' || up === 'R' || up === 'C') return up as any;
        }
        if (typeof pan.value === 'number') {
            if (strictGb) throw new Error(`Numeric ${context === 'instrument' ? 'instrument' : 'inline'} pan not allowed in strict GB export`);
            return snapToGB(pan.value);
        }
        return undefined;
    }
    if (typeof pan === 'number') {
        if (strictGb) throw new Error(`Numeric ${context === 'instrument' ? 'instrument' : 'inline'} pan not allowed in strict GB export`);
        return snapToGB(pan);
    }
    const s = String(pan);
    const up = s.toUpperCase();
    if (up === 'L' || up === 'R' || up === 'C') return up as any;
    const n = Number(s);
    if (!Number.isNaN(n)) {
        if (strictGb) throw new Error(`Numeric ${context === 'instrument' ? 'instrument' : 'inline'} pan not allowed in strict GB export`);
        return snapToGB(n);
    }
    return undefined;
}

/**
 * Export a beatbax SongModel to UGE v6 binary format.
 */
export async function exportUGE(song: SongModel, outputPath: string, opts: { debug?: boolean; strictGb?: boolean } = {}): Promise<void> {
    const w = new UGEWriter();
    const strictGb = opts && opts.strictGb === true;

    // ====== Header & NR51 metadata ======
    // Compute NR51 register from channel/instrument pans and encode into comment for compatibility

    function resolveChannelPan(chModel: any, insts: any): 'L' | 'C' | 'R' {
        if (chModel && chModel.defaultInstrument) {
            const inst = insts && insts[chModel.defaultInstrument];
            if (inst) {
                const gbPan = convertPanToEnum(inst['gb:pan'], strictGb, 'instrument');
                if (gbPan) return gbPan;
                const instPan = convertPanToEnum(inst['pan'], strictGb, 'instrument');
                if (instPan) return instPan;
            }
        }
        const events = chModel && chModel.events ? chModel.events : [];
        for (const ev of events) {
            if (ev && ev.pan) {
                const evPan = convertPanToEnum(ev.pan, strictGb, 'inline');
                if (evPan) return evPan;
            }
        }
        return 'C';
    }

    // Enforce strict GB export rules early (throws if numeric pan is present and strict mode enabled)
    if (strictGb) {
        for (let ch = 0; ch < NUM_CHANNELS; ch++) {
            const chModel = song.channels && song.channels.find((c: any) => c.id === ch + 1);
            // resolveChannelPan will throw if numeric pan is present and strictGb=true
            resolveChannelPan(chModel, song.insts || {});
        }
    }

    // Header write
    w.writeU32(UGE_VERSION);
    const title = (song as any).metadata && (song as any).metadata.name ? (song as any).metadata.name : (song.pats ? 'BeatBax Song' : 'Untitled');
    const author = (song as any).metadata && (song as any).metadata.artist ? (song as any).metadata.artist : 'BeatBax';
    const comment = (song as any).metadata && (song as any).metadata.description ? (song as any).metadata.description : 'Exported from BeatBax live-coding engine';
    // Do not append NR51 debug metadata to the comment — remove NR51 metadata from UGE export
    w.writeShortString(title);
    w.writeShortString(author);
    w.writeShortString(comment);



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
    if (opts && opts.debug) console.log(`[DEBUG] Discovered instruments: duty=${dutyInsts.length} wave=${waveInsts.length} noise=${noiseInsts.length}`);
    if (opts && opts.debug) console.log(`[DEBUG] Wave instrument names: ${JSON.stringify(waveInsts)}`);

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
            const length = inst.length ? Number(inst.length) : 0;
            const lengthEnabled = inst.length ? true : false;

            const sweep = parseSweep(inst.sweep);
            const freqSweepTime = sweep ? sweep.time : 0;
            const freqSweepDir = sweep ? (sweep.direction === 'up' ? 0 : 1) : 0;
            const freqSweepShift = sweep ? sweep.shift : 0;

            writeDutyInstrument(w, name, dutyCycle, initialVol, sweepDir, sweepChange, lengthEnabled, length, freqSweepTime, freqSweepDir, freqSweepShift);
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
            const length = inst.length ? Number(inst.length) : 0;
            const lengthEnabled = inst.length ? true : false;
            const ugeVolume = mapWaveVolumeToUGE(inst.volume ?? inst.vol ?? 100);
            if (opts && opts.debug) console.log(`[DEBUG] Wave instrument '${name}' -> volume (beatbax)=${inst.volume ?? inst.vol ?? 'undefined'} ugeValue=${ugeVolume}`);
            writeWaveInstrument(w, name, i, ugeVolume, lengthEnabled, length);
        } else {
            // Default placeholder: use default 100% mapping
            writeWaveInstrument(w, `WAVE_${i}`, 0, mapWaveVolumeToUGE(100));
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
            // width parameter: 7=7-bit mode, 15=15-bit mode (default)
            const width = inst.width ? Number(inst.width) : 15;
            const noiseMode = width === 7 ? 1 : 0; // 0=15-bit, 1=7-bit
            const length = inst.length ? Number(inst.length) : 0;
            const lengthEnabled = inst.length ? true : false;
            writeNoiseInstrument(w, name, initialVol, sweepDir, sweepChange, noiseMode, lengthEnabled, length);
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
                        warn('export', `Failed to parse wave data for ${name}: ${inst.wave}`);
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
    const channelPatterns: Array<Array<Array<{ note: number; instrument: number; effectCode: number; effectParam: number; pan?: 'L' | 'R' | 'C' }>>> = [];

    // Shared map of desired vibrato durations (globalRow -> rows)
    const desiredVibMap: Map<number, number> = new Map();
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        // Find channel by ID (1-4)
        const chModel = song.channels && song.channels.find(c => c.id === ch + 1);
        const chEvents = (chModel && chModel.events) || [];
        if (opts && opts.debug) console.log(`[DEBUG] Channel ${ch + 1} has ${chEvents.length} events`);
        // share `desiredVibMap` across channels so later passes can inspect desired vib rows
        const patterns = eventsToPatterns(chEvents, (song.insts as any) || {}, ch as GBChannel, dutyInsts, waveInsts, noiseInsts, strictGb, (song as any).bpm, desiredVibMap);
        channelPatterns.push(patterns);
    }

    // Post-process channel patterns to inject explicit Note Cut (ECx) on the
    // last sustain (or note) row for each note event so tracker UIs display it.
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const chModel = song.channels && song.channels.find(c => c.id === ch + 1);
        const chEvents = (chModel && chModel.events) || [];
        const patterns = channelPatterns[ch] || [];
        for (let i = 0; i < chEvents.length; i++) {
            const ev = chEvents[i];
            if (!ev || (ev as any).type !== 'note') continue;
            // count sustain rows following note
            let sustainCount = 0;
            for (let k = i + 1; k < chEvents.length; k++) {
                const ne = chEvents[k];
                if (ne && (ne as any).type === 'sustain') sustainCount++;
                else break;
            }
            const targetRow = i + sustainCount; // global row index
            const patIdx = Math.floor(targetRow / PATTERN_ROWS);
            const rowIdx = targetRow % PATTERN_ROWS;
            // Determine cut parameter from note's effects (cut or 4th param) if present
            let cutParam = 0;
            const noteEvent = ev as NoteEvent;
            try {
                if (Array.isArray(noteEvent.effects) && noteEvent.effects.length > 0) {
                    for (const fx of noteEvent.effects) {
                        if (!fx) continue;
                        const name = (fx.type || fx).toString().toLowerCase();
                        const params = fx.params || (Array.isArray(fx) ? fx : []);
                        if (name === 'cut') {
                            const p0 = params.length > 0 ? Number(params[0]) : NaN;
                            if (Number.isFinite(p0)) { cutParam = Math.max(0, Math.min(255, Math.round(p0))); break; }
                        }
                        if (params && params.length > 3) {
                            const p3 = Number(params[3]);
                            if (Number.isFinite(p3)) cutParam = Math.max(0, Math.min(255, Math.round(p3)));
                        }
                    }
                }
            } catch (e) {}
            if (patterns[patIdx] && patterns[patIdx][rowIdx]) {
                // Write as extended effect E0x (sub=0 = Note Cut) with 4-bit parameter
                const nib = Math.max(0, Math.min(15, cutParam & 0xF));
                patterns[patIdx][rowIdx].effectCode = 0xE;
                patterns[patIdx][rowIdx].effectParam = ((0 & 0xF) << 4) | (nib & 0xF);
                (patterns[patIdx][rowIdx] as any).volume = 0;
                // (debug log removed)
            }
        }
    }

    // Inject global per-row NR51 panning effects (write a single 8xx on channel 1 when value changes)
    // Create a blank pattern for missing channels/patterns
    const blankPatternWithPan: Array<{ note: number; instrument: number; effectCode: number; effectParam: number; pan: 'L' | 'R' | 'C' }> = [];
    for (let i = 0; i < PATTERN_ROWS; i++) {
        blankPatternWithPan.push({ note: EMPTY_NOTE, instrument: 0, effectCode: 0, effectParam: 0, pan: 'C' });
    }

    // Compute max order length across channels (local variable)
    const orderLen = Math.max(1, Math.max(...channelPatterns.map(p => p.length)));

    // Keep NR51 state across orders so we don't re-emit the same mix repeatedly
    let lastNr51: number | null = null;
    // Track which global rows we wrote NR51 to and whether the pan came from
    // an explicit source in the `.bax` (instrument or inline). Key = globalRow
    // (orderIdx*PATTERN_ROWS + row)
    const nr51Writes: Map<number, { value: number; explicit: boolean }> = new Map();
    for (let orderIdx = 0; orderIdx < orderLen; orderIdx++) {
        for (let row = 0; row < PATTERN_ROWS; row++) {
            let nr51Value = 0;
            let hasNoteOn = false;
            for (let ch = 0; ch < NUM_CHANNELS; ch++) {
                const patterns = channelPatterns[ch];
                const pat = (orderIdx < patterns.length) ? patterns[orderIdx] : blankPatternWithPan;
                const cell = pat[row];
                const p = (cell && cell.pan) ? cell.pan : 'C';
                nr51Value |= enumToNR51Bits(p as 'L' | 'C' | 'R', ch);
                // Note-on detection: a cell with a note != EMPTY_NOTE indicates a note trigger
                if (cell && typeof cell.note === 'number' && cell.note !== EMPTY_NOTE) {
                    hasNoteOn = true;
                }
            }
            // Only set panning when NR51 changes AND we have a note-on at this row (avoids forcing mix changes on rows with no note start).
            if (nr51Value !== lastNr51 && hasNoteOn) {
                // Skip emitting the default NR51 mix (0xFF) as a tracker write; it
                // often collides with per-note effects and is unnecessary to emit.
                if ((nr51Value & 0xFF) === 0xFF) {
                    try { console.log('[DEBUG UGE] Skipping default NR51 (0xFF) write', { orderIdx, row, nr51Value }); } catch (e) {}
                    continue;
                }
                // Attempt to write 8xx effect on channel 1 (index 0) for this row.
                // If the target cell already contains a non-zero effect (e.g. vib=4xy),
                // do not overwrite it — prefer preserving per-note effects. Only
                // update `lastNr51` when we actually write the 8xx effect.
                // Skip writing NR51 if any channel already has a vib (4xy) on this row
                let anyVibOnRow = false;
                for (let chCheck = 0; chCheck < NUM_CHANNELS; chCheck++) {
                    const pats = channelPatterns[chCheck] || [];
                    const p = (orderIdx < pats.length) ? pats[orderIdx] : blankPatternWithPan;
                    const c = p[row];
                    if (c && c.effectCode === 4) { anyVibOnRow = true; break; }
                }
                if (anyVibOnRow) {
                    try { console.log('[DEBUG UGE] Skipping NR51 write due to existing vib on this row', { orderIdx, row, nr51Value }); } catch (e) {}
                    continue;
                }
                if (orderIdx >= channelPatterns[0].length) {
                    // Ensure pattern exists for channel 1 up to orderIdx
                    while (channelPatterns[0].length <= orderIdx) {
                        const newPat = blankPatternWithPan.map(c => ({ ...c }));
                        channelPatterns[0].push(newPat);
                    }
                }
                const targetCell = channelPatterns[0][orderIdx][row];
                // Determine whether this NR51 change is driven by any explicit pan
                // present in the source `.bax` for the channels at this global row.
                const globalRow = orderIdx * PATTERN_ROWS + row;
                let anyExplicit = false;
                    for (let ch2 = 0; ch2 < NUM_CHANNELS; ch2++) {
                    const chModel = song.channels && song.channels.find((c: any) => c.id === ch2 + 1);
                    if (!chModel) continue;
                    const ev = chModel.events && chModel.events[globalRow];
                    if (ev && (ev as any).pan) { anyExplicit = true; break; }
                    // instrument-level pan defaults are explicit if present on the instrument
                    if (chModel.defaultInstrument) {
                        const inst = (song.insts as any) && (song.insts as any)[chModel.defaultInstrument];
                        if (inst && (inst['gb:pan'] || inst['pan'])) { anyExplicit = true; break; }
                    }
                }
                if (targetCell && (!targetCell.effectCode || targetCell.effectCode === 0)) {
                    targetCell.effectCode = 8;
                    targetCell.effectParam = nr51Value & 0xFF;
                    lastNr51 = nr51Value;
                    nr51Writes.set(globalRow, { value: nr51Value & 0xFF, explicit: anyExplicit });
                } else {
                    try { console.log('[DEBUG UGE] Skipping NR51 write due to existing effect on ch1 row', { orderIdx, row, existingEffect: targetCell && targetCell.effectCode }); } catch (e) {}
                }
            }
        }
    }

    // Debug: dump NR51 writes map so we can inspect which rows were written
    if ((opts && opts.debug) || true) {
        try {
            const rows = Array.from(nr51Writes.entries()).map(([k, v]) => ({ globalRow: k, value: v.value, explicit: v.explicit }));
            console.log('[DEBUG UGE] NR51 writes:', JSON.stringify(rows, null, 2));
        } catch (e) { }
    }

    // Post-pass: ensure per-note vibrato (4xy) is present on the note trigger row.
    // In some cases (NR51 writes or other post-processing) the vib effect
    // may have ended up on the first sustain row instead of the note row.
    // Move a vib from the immediate next global row to the note row when it
    // appears on the sustain row but not on the note row.
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const patterns = channelPatterns[ch];
        const chModel = song.channels && song.channels.find(c => c.id === ch + 1);
        const chEvents = (chModel && chModel.events) || [];
        for (let i = 0; i < chEvents.length; i++) {
            const ev = chEvents[i];
            if (!ev || (ev as any).type !== 'note') continue;
            const globalRow = i;
            const patIdx = Math.floor(globalRow / PATTERN_ROWS);
            const rowIdx = globalRow % PATTERN_ROWS;
            if (!patterns[patIdx]) continue;

            // Derive desired vib duration and params directly from the source note's effects
            const noteEvent = ev as NoteEvent;
            let vibFx: any = null;
            if (Array.isArray(noteEvent.effects)) {
                for (const fx of noteEvent.effects) {
                    if (!fx) continue;
                    if (String((fx as any).type || fx).toLowerCase() === 'vib') { vibFx = fx; break; }
                }
            }
            if (!vibFx) continue;

            // parse duration (rows) from positional 4th param, paramsStr, or durationSec
            let durationRowsRaw: number | undefined = undefined;
            const params = vibFx.params || [];
            if (params && params.length > 3 && Number.isFinite(Number(params[3]))) {
                durationRowsRaw = Number(params[3]);
            } else if (vibFx.paramsStr && typeof vibFx.paramsStr === 'string') {
                const rawParts = vibFx.paramsStr.split(',').map((s: string) => s.trim());
                if (rawParts.length > 3) {
                    const p3 = Number(rawParts[3]); if (Number.isFinite(p3)) durationRowsRaw = p3;
                }
            } else if (vibFx.durationSec && Number.isFinite(vibFx.durationSec)) {
                const bpmForTicks = (typeof song.bpm === 'number' && Number.isFinite(song.bpm)) ? song.bpm : 128;
                const tickSeconds = (60 / bpmForTicks) / 4;
                durationRowsRaw = Math.max(0, Math.round(vibFx.durationSec / tickSeconds));
            }
            if (typeof durationRowsRaw === 'undefined') continue;

            // compute remaining sustains and clamp
            let sustainCountLocal = 0;
            for (let k = i + 1; k < chEvents.length; k++) {
                const ne = chEvents[k]; if (ne && (ne as any).type === 'sustain') sustainCountLocal++; else break;
            }
            const dr = Math.max(0, Math.floor(durationRowsRaw));
            let remainingRows = Math.max(0, dr - 1);
            remainingRows = Math.min(remainingRows, sustainCountLocal);

            // compute vib param from depth/rate
            const depthRaw = params.length > 0 ? Number(params[0]) : 0;
            const rateRaw = params.length > 1 ? Number(params[1]) : 4;
            const depth = Number.isFinite(depthRaw) ? Math.max(0, Math.min(15, Math.round(depthRaw))) : 0;
            const rate = Number.isFinite(rateRaw) ? Math.max(0, Math.min(15, Math.round(rateRaw))) : 4;
            const param = encodeVibParam(rate, depth);

            const cell = patterns[patIdx][rowIdx];
            const nextGlobal = globalRow + 1;
            const nextPatIdx = Math.floor(nextGlobal / PATTERN_ROWS);
            const nextRowIdx = nextGlobal % PATTERN_ROWS;

            const nrInfo = nr51Writes.get(globalRow);
            const nrWasExplicit = nrInfo ? nrInfo.explicit : false;
            const nrValue = nrInfo ? nrInfo.value : null;
            const nrIsDefault = (nrValue === 0xFF);
            try { console.log('[DEBUG UGE] enforce-vib', { globalRow, dr, remainingRows, sustainCountLocal, nrInfo, cellEffect: cell && cell.effectCode, nextEffect: patterns[nextPatIdx] && patterns[nextPatIdx][nextRowIdx] ? patterns[nextPatIdx][nextRowIdx].effectCode : null }); } catch (e) {}

            // If the note row currently holds an explicit non-default NR51, preserve it.
            const preserveNR51 = (cell && cell.effectCode === 8 && nrWasExplicit && !nrIsDefault);

            if (!preserveNR51) {
                // Place vib on the note row
                if (cell) { cell.effectCode = 4; cell.effectParam = param & 0xff; }
                // Clear vib from sustain rows beyond remainingRows up to sustainCountLocal
                for (let s = 1; s <= sustainCountLocal; s++) {
                    const g = globalRow + s;
                    const pIdx = Math.floor(g / PATTERN_ROWS);
                    const rIdx = g % PATTERN_ROWS;
                    if (s > remainingRows) {
                        if (patterns[pIdx] && patterns[pIdx][rIdx] && patterns[pIdx][rIdx].effectCode === 4) {
                            patterns[pIdx][rIdx].effectCode = 0;
                            patterns[pIdx][rIdx].effectParam = 0;
                        }
                    } else {
                        // ensure vib present for allowed sustain rows
                        if (patterns[pIdx] && patterns[pIdx][rIdx]) {
                            patterns[pIdx][rIdx].effectCode = 4;
                            patterns[pIdx][rIdx].effectParam = param & 0xff;
                        }
                    }
                }
            } else {
                // Preserve explicit NR51: keep vib starting on next row but trim to remainingRows
                for (let s = 1; s <= sustainCountLocal; s++) {
                    const g = globalRow + s;
                    const pIdx = Math.floor(g / PATTERN_ROWS);
                    const rIdx = g % PATTERN_ROWS;
                    if (s > remainingRows) {
                        if (patterns[pIdx] && patterns[pIdx][rIdx] && patterns[pIdx][rIdx].effectCode === 4) {
                            patterns[pIdx][rIdx].effectCode = 0;
                            patterns[pIdx][rIdx].effectParam = 0;
                        }
                    } else {
                        if (patterns[pIdx] && patterns[pIdx][rIdx]) {
                            patterns[pIdx][rIdx].effectCode = 4;
                            patterns[pIdx][rIdx].effectParam = param & 0xff;
                        }
                    }
                }
            }
        }
    }

    // Enforce exact vibrato lengths using `desiredVibMap` recorded during note mapping.
    // This trims any extra 4xy effects that may have been applied beyond the requested duration.
    try { console.log('[DEBUG UGE] desiredVibMap entries:', Array.from(desiredVibMap.entries())); } catch(e) {}
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const patterns = channelPatterns[ch];
        const chModel = song.channels && song.channels.find(c => c.id === ch + 1);
        const chEvents = (chModel && chModel.events) || [];
        for (let i = 0; i < chEvents.length; i++) {
            const ev = chEvents[i];
            if (!ev || (ev as any).type !== 'note') continue;
            const desired = desiredVibMap.get(i);
            if (typeof desired === 'number' && desired > 0) {
                // For rows from i to i+desired-1, vib is allowed; beyond that up to the
                // note's actual sustain end, clear any stray 4xy.
                let sustainCountLocal = 0;
                for (let k = i + 1; k < chEvents.length; k++) {
                    const ne = chEvents[k];
                    if (ne && (ne as any).type === 'sustain') sustainCountLocal++;
                    else break;
                }
                const targetRow = i + sustainCountLocal; // last sustain or same note row
                const clearStart = i + desired;
                for (let global = clearStart; global <= targetRow - 1; global++) {
                    const patIdx = Math.floor(global / PATTERN_ROWS);
                    const rowIdx = global % PATTERN_ROWS;
                    if (patterns[patIdx] && patterns[patIdx][rowIdx] && patterns[patIdx][rowIdx].effectCode === 4) {
                        patterns[patIdx][rowIdx].effectCode = 0;
                        patterns[patIdx][rowIdx].effectParam = 0;
                    }
                }
            }
        }
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

    // (debug forced E08 removed)

    // Add a blank pattern for padding shorter channels
    const blankPatternCells = [];
    for (let i = 0; i < PATTERN_ROWS; i++) {
        blankPatternCells.push({ note: EMPTY_NOTE, instrument: 0, effectCode: 0, effectParam: 0 });
    }
    const blankPatternIndex = allPatterns.length;
    allPatterns.push({ channelIndex: -1, patternIndex: -1, cells: blankPatternCells });

    // FINAL ENFORCEMENT PASS: ensure vibrato (4xy) appears for exactly the
    // requested number of rows (note + dr - 1) per-note. This operates on
    // `allPatterns` which are the final pattern buffers to be serialized.
    try {
        try { console.log('[DEBUG UGE] finalEnforcement start', { nr51Writes: Array.from(nr51Writes.entries()), desiredVibMap: Array.from(desiredVibMap.entries()) }); } catch(e) {}
        for (let ch = 0; ch < NUM_CHANNELS; ch++) {
            const chModel = song.channels && song.channels.find(c => c.id === ch + 1);
            const chEvents = (chModel && chModel.events) || [];
            for (let i = 0; i < chEvents.length; i++) {
                const ev = chEvents[i];
                if (!ev || (ev as any).type !== 'note') continue;
                const noteEvent = ev as NoteEvent;
                // find vib effect on this note
                let vibFx: any = null;
                if (Array.isArray(noteEvent.effects)) {
                    for (const fx of noteEvent.effects) {
                        if (!fx) continue;
                        if (String((fx as any).type || fx).toLowerCase() === 'vib') { vibFx = fx; break; }
                    }
                }
                if (!vibFx) continue;

                // parse requested duration (rows) from positional param, paramsStr, or durationSec
                let dr: number | undefined = undefined;
                const params = vibFx.params || [];
                if (params && params.length > 3 && Number.isFinite(Number(params[3]))) {
                    dr = Number(params[3]);
                } else if (vibFx.paramsStr && typeof vibFx.paramsStr === 'string') {
                    const parts = vibFx.paramsStr.split(',').map((s: string) => s.trim());
                    if (parts.length > 3) {
                        const p3 = Number(parts[3]); if (Number.isFinite(p3)) dr = p3;
                    }
                } else if (vibFx.durationSec && Number.isFinite(vibFx.durationSec)) {
                    const bpmForTicks = (typeof song.bpm === 'number' && Number.isFinite(song.bpm)) ? song.bpm : 128;
                    const tickSeconds = (60 / bpmForTicks) / 4;
                    dr = Math.max(0, Math.round(vibFx.durationSec / tickSeconds));
                }
                if (typeof dr === 'undefined' || dr <= 0) continue;

                // compute sustainCount
                let sustainCount = 0;
                for (let k = i + 1; k < chEvents.length; k++) {
                    const ne = chEvents[k]; if (ne && (ne as any).type === 'sustain') sustainCount++; else break;
                }

                // determine vib param
                const depthRaw = params.length > 0 ? Number(params[0]) : 0;
                const rateRaw = params.length > 1 ? Number(params[1]) : 4;
                const depth = Number.isFinite(depthRaw) ? Math.max(0, Math.min(15, Math.round(depthRaw))) : 0;
                const rate = Number.isFinite(rateRaw) ? Math.max(0, Math.min(15, Math.round(rateRaw))) : 4;
                const param = encodeVibParam(rate, depth);

                const globalStart = i;
                const allowedEnd = globalStart + dr - 1; // inclusive
                const actualEnd = globalStart + sustainCount; // inclusive

                // if NR51 explicit and non-default on note row, we will preserve it
                const notePatIdx = Math.floor(globalStart / PATTERN_ROWS);
                const noteRowIdx = globalStart % PATTERN_ROWS;
                const noteCell = (allPatterns.find(p => p.channelIndex === ch && p.patternIndex === notePatIdx) || { cells: [] }).cells[noteRowIdx];
                const nrInfo = nr51Writes.get(globalStart);
                const nrWasExplicit = nrInfo ? nrInfo.explicit : false;
                const nrValue = nrInfo ? nrInfo.value : null;
                const nrIsDefault = (nrValue === 0xFF);
                const preserveNoteNR51 = !!noteCell && noteCell.effectCode === 8 && nrWasExplicit && !nrIsDefault;
                try { console.log('[DEBUG UGE] finalEnforce note check', { ch, globalStart, nrInfo, noteCellEffect: noteCell && noteCell.effectCode, preserveNoteNR51, allPatternsNoteCell: (allPatterns.find(p=>p.channelIndex===ch && p.patternIndex===Math.floor(globalStart/PATTERN_ROWS))||{cells:[]}).cells[globalStart%PATTERN_ROWS] }); } catch (e) {}

                // enforce: set the note-row vibrato first (deterministic)
                // overwrite default/implicit NR51 but preserve explicit non-default NR51
                if (!preserveNoteNR51) {
                    const patIdx = Math.floor(globalStart / PATTERN_ROWS);
                    const rowIdx = globalStart % PATTERN_ROWS;
                    const patObj = allPatterns.find(p => p.channelIndex === ch && p.patternIndex === patIdx);
                    if (patObj) {
                        const cell = patObj.cells[rowIdx];
                        if (cell) {
                            cell.effectCode = 4;
                            cell.effectParam = param & 0xff;
                        }
                    }
                }

                // enforce: for g in [globalStart+1 .. min(allowedEnd, actualEnd)] set 4xy=param
                for (let g = globalStart + 1; g <= Math.min(allowedEnd, actualEnd); g++) {
                    const patIdx = Math.floor(g / PATTERN_ROWS);
                    const rowIdx = g % PATTERN_ROWS;
                    const patObj = allPatterns.find(p => p.channelIndex === ch && p.patternIndex === patIdx);
                    if (!patObj) continue;
                    const cell = patObj.cells[rowIdx];
                    if (!cell) continue;
                    cell.effectCode = 4;
                    cell.effectParam = param & 0xff;
                }

                // clear any 4xy beyond allowedEnd up to actualEnd
                for (let g = Math.max(allowedEnd + 1, globalStart + 1); g <= actualEnd; g++) {
                    const patIdx = Math.floor(g / PATTERN_ROWS);
                    const rowIdx = g % PATTERN_ROWS;
                    const patObj = allPatterns.find(p => p.channelIndex === ch && p.patternIndex === patIdx);
                    if (!patObj) continue;
                    const cell = patObj.cells[rowIdx];
                    if (!cell) continue;
                    if (cell.effectCode === 4) {
                        cell.effectCode = 0; cell.effectParam = 0;
                    }
                }
            }
        }
    } catch (e) { console.log('[DEBUG UGE] final vib enforcement failed', e && (e as any).stack ? (e as any).stack : e); }

    // NOTE: vib->cut heuristic removed. We rely on per-note post-process above
    // that injects a single extended `E0x` at the computed end-of-note row
    // (patterns[patIdx][rowIdx]) so cuts are deterministic and occur only once.

    // Write number of patterns
    // Debug: inspect patterns before serialization
    if (opts && opts.debug) {
        try {
            console.log('[DEBUG UGE] Dumping first 3 allPatterns entries (showing up to 16 rows each)');
            for (let pi = 0; pi < Math.min(3, allPatterns.length); pi++) {
                const p = allPatterns[pi];
                console.log(`[DEBUG UGE] allPatterns[${pi}] -> channel=${p.channelIndex} pattern=${p.patternIndex} rows=${p.cells.length}`);
                for (let r = 0; r < Math.min(16, p.cells.length); r++) {
                    const c = p.cells[r] as any;
                    console.log(` [DEBUG UGE] pat${pi} row${r}: note=${c.note} inst=${c.instrument} vol=${typeof c.volume==='number'?c.volume:'undef'} eff=0x${(c.effectCode||0).toString(16)} effp=0x${(c.effectParam||0).toString(16)}`);
                }
            }
        } catch (e) {
            console.log('[DEBUG UGE] Pattern dump failed', e && (e as any) && (e as any).stack ? (e as any).stack : e);
        }

        // Debug: count EC (note-cut) occurrences before writing
        let ecCount = 0;
        for (const p of allPatterns) {
            for (let r = 0; r < p.cells.length; r++) {
                const c = p.cells[r];
                if (c && c.effectCode === 0xC) ecCount++;
            }
        }
        console.log('[DEBUG] Pre-serialize EC count:', ecCount);
    }

    w.writeU32(allPatterns.length);

    if (opts && opts.debug) console.log(`[DEBUG] Total patterns: ${allPatterns.length}`);
    if (opts && opts.debug) console.log(`[DEBUG] Pattern breakdown: Ch1=${channelPatterns[0].length}, Ch2=${channelPatterns[1].length}, Ch3=${channelPatterns[2].length}, Ch4=${channelPatterns[3].length}`);

    // Focused debug: show effect codes for first 16 rows of each channel for quick verification
    if (opts && opts.debug) {
        for (let ch = 0; ch < NUM_CHANNELS; ch++) {
            const patterns = channelPatterns[ch] || [];
            const pat = patterns[0] || new Array(PATTERN_ROWS).fill({ note: EMPTY_NOTE, instrument: 0, effectCode: 0, effectParam: 0 });
            const rowsToShow = Math.min(16, pat.length);
            const entries = [];
            for (let r = 0; r < rowsToShow; r++) {
                const c: any = pat[r];
                entries.push({ row: r, note: c.note, eff: `0x${(c.effectCode||0).toString(16)}`, effp: `0x${(c.effectParam||0).toString(16)}` });
            }
            console.log(`[DEBUG UGE] Channel ${ch+1} first ${rowsToShow} rows:`, JSON.stringify(entries));
        }
    }

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
        for (let rowIdx = 0; rowIdx < pattern.cells.length; rowIdx++) {
            const cell = pattern.cells[rowIdx];
            // Deterministic post-serialize enforcement: if this global row had a
            // desired vib duration recorded, ensure the note-row contains the
            // vibrato effect (4xy) with the correct param. We compute the param
            // from the source NoteEvent so it's authoritative. Preserve any
            // explicit non-default NR51 (8xx) present on the note row.
            try {
                // Debug: show mapping state for this cell
                try { console.log('[DEBUG UGE] serialize-cell debug', {
                    channel: pattern.channelIndex,
                    patternIndex: pattern.patternIndex,
                    rowIdx,
                    globalRow: pattern.patternIndex * PATTERN_ROWS + rowIdx,
                    desired: desiredVibMap.get(pattern.patternIndex * PATTERN_ROWS + rowIdx),
                    nrInfo: nr51Writes.get(pattern.patternIndex * PATTERN_ROWS + rowIdx),
                    preCell: { effectCode: cell && cell.effectCode, effectParam: cell && cell.effectParam }
                }); } catch(e) {}
                const globalRow = pattern.patternIndex * PATTERN_ROWS + rowIdx;
                const desired = desiredVibMap.get(globalRow);
                if (typeof desired === 'number' && desired > 0) {
                    // find channel model and source event
                    const chModel = song.channels && song.channels.find((c: any) => c.id === pattern.channelIndex + 1);
                    const chEvents = (chModel && chModel.events) || [];
                    const srcEv = chEvents[globalRow];
                    if (srcEv && (srcEv as any).type === 'note') {
                        // extract vib fx from source event
                        let vibFx: any = null;
                        if (Array.isArray((srcEv as any).effects)) {
                            for (const fx of (srcEv as any).effects) {
                                if (!fx) continue;
                                if (String((fx as any).type || fx).toLowerCase() === 'vib') { vibFx = fx; break; }
                            }
                        }
                        if (vibFx) {
                            // compute param
                            const params = vibFx.params || [];
                            const depthRaw = params.length > 0 ? Number(params[0]) : 0;
                            const rateRaw = params.length > 1 ? Number(params[1]) : 4;
                            const depth = Number.isFinite(depthRaw) ? Math.max(0, Math.min(15, Math.round(depthRaw))) : 0;
                            const rate = Number.isFinite(rateRaw) ? Math.max(0, Math.min(15, Math.round(rateRaw))) : 4;
                            const param = encodeVibParam(rate, depth);
                            // check NR51 explicit non-default preservation
                            const nrInfo = nr51Writes.get(globalRow);
                            const nrWasExplicit = nrInfo ? nrInfo.explicit : false;
                            const nrValue = nrInfo ? nrInfo.value : null;
                            const nrIsDefault = (nrValue === 0xFF);
                            const preserveNoteNR51 = !!cell && cell.effectCode === 8 && nrWasExplicit && !nrIsDefault;
                            if (!preserveNoteNR51) {
                                cell.effectCode = 4;
                                cell.effectParam = param & 0xff;
                            }
                        }
                    }
                }
            } catch (e) {}
            if (opts && opts.debug && cell && cell.effectCode === 0xC) {
                console.log(`[DEBUG UGE] Writing Note Cut in pattern ${i} ch ${ch} row ${rowIdx}`);
            }
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
            let volume = (typeof (cell as any).volume === 'number') ? (cell as any).volume : undefined;
            // If exporter previously set volume=0 to force a cut, ensure an explicit
            // Note Cut effect is written too so tracker UIs show the cut in the
            // effect column. Prefer explicit effect when volume==0.
            if (typeof volume === 'number' && volume === 0 && (!cell.effectCode || cell.effectCode === 0)) {
                // write as extended effect group E00 (immediate cut) when volume explicitly zero
                cell.effectCode = 0xE;
                cell.effectParam = ((0 & 0xF) << 4) | (0 & 0xF);
            }
            if (typeof volume === 'number') {
                w.writePatternCell(cell.note, relativeInstrument, cell.effectCode, cell.effectParam, volume);
            } else {
                w.writePatternCell(cell.note, relativeInstrument, cell.effectCode, cell.effectParam);
            }
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
    if (opts && opts.debug) {
        console.log(`[DEBUG] UGE: ${out.length} bytes written to ${outputPath}`);
    }
    writeFileSync(outputPath, out);
}

export default exportUGE;
