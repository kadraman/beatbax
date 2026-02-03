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

// Map waveform names to hUGETracker waveform selector values (0-15)
// Official hUGETracker vibrato waveform names:
// 0=none, 1=square, 2=triangle, 3=sawUp, 4=sawDown, 5=stepped, 6=gated, 7=gatedSlow,
// 8=pulsedExtreme, 9=hybridTrillStep, A=hybridTriangleStep, B=hybridSawUpStep,
// C=longStepSawDown, D=hybridStepLongPause, E=slowPulse, F=subtlePulse
function mapWaveformName(value: string | number): number {
    if (typeof value === 'number') return value;

    const name = String(value).toLowerCase().trim();
    const waveformMap: Record<string, number> = {
        // Official hUGETracker waveform names (0-F)
        'none': 0,
        'square': 1,
        'triangle': 2,
        'sawup': 3,
        'sawdown': 4,
        'stepped': 5,
        'gated': 6,
        'gatedslow': 7,
        'pulsedextreme': 8,
        'hybridtrillstep': 9,
        'hybridtrianglestep': 10,
        'hybridsawupstep': 11,
        'longstepsawdown': 12,
        'hybridsteplongpause': 13,
        'slowpulse': 14,
        'subtlepulse': 15,

        // Common aliases for backward compatibility
        'sine': 2,         // Maps to triangle (closest smooth waveform to sine)
        'sin': 2,
        'tri': 2,          // Short for triangle
        'sqr': 1,          // Short for square
        'pulse': 1,        // Alias for square
        'saw': 3,          // Default to sawUp
        'sawtooth': 3,
        'ramp': 4,         // Ramp down (sawDown)
        'noise': 5,        // Maps to stepped (choppy)
        'random': 5,
    };

    return waveformMap[name] ?? 0; // Default to none (0) if unknown
}

function encodeVibParam(waveform: number, depth: number): number {
    const d = Math.max(0, Math.min(15, Math.round(depth * VIB_DEPTH_SCALE)));
    const w = Math.max(0, Math.min(15, Math.round(waveform)));
    return ((w & 0xf) << 4) | (d & 0xf);
}

// ============================================================================
// Effect Handler System - Extensible architecture for UGE effect conflicts
// ============================================================================

interface UGECell {
    note: number;
    instrument: number;
    effectCode: number;
    effectParam: number;
    pan?: 'L' | 'R' | 'C';
    volume?: number;
}

interface EffectRequest {
    type: string;
    code: number;
    param: number;
    duration: number; // Number of rows this effect should span (including note row)
    priority: number;
    isGlobal: boolean; // True for effects like panning (8xx) that affect all channels
}

interface EffectHandler {
    type: string;
    priority: number;

    /**
     * Parse effect from NoteEvent and return an EffectRequest.
     * Returns null if this handler doesn't apply to the given effect.
     */
    parse(fx: any, noteEvent: NoteEvent, sustainCount: number, tickSeconds: number): EffectRequest | null;

    /**
     * Check if this effect can coexist with another effect on the same row.
     * Since UGE only allows one effect per row, this is typically false unless
     * one effect can be moved to a different row (e.g., vibrato to sustain).
     */
    canCoexist(other: EffectRequest): boolean;

    /**
     * Apply this effect to a cell. Returns true if applied successfully.
     */
    apply(cell: UGECell, request: EffectRequest): boolean;
}

// Vibrato effect handler (4xy)
const VibratoHandler: EffectHandler = {
    type: 'vib',
    priority: 10,

    parse(fx: any, noteEvent: NoteEvent, sustainCount: number, tickSeconds: number): EffectRequest | null {
        const name = fx.type || fx;
        if (String(name).toLowerCase() !== 'vib') return null;

        const params = fx.params || (Array.isArray(fx) ? fx : []);
        const depthRaw = params.length > 0 ? Number(params[0]) : 0;
        // Default to triangle (2) if waveform is missing, empty, or falsy
        const waveformParam = (params.length > 2 && params[2]) ? params[2] : 2;
        const waveformRaw = mapWaveformName(waveformParam); // 3rd param: waveform name or number

        // Parse duration from 4th param or durationSec
        let durationRows = sustainCount + 1; // Default: full note length
        if (params && params.length > 3 && Number.isFinite(Number(params[3]))) {
            durationRows = Math.max(1, Math.round(Number(params[3])));
        } else if ((fx as any).paramsStr && typeof (fx as any).paramsStr === 'string') {
            const rawParts = (fx as any).paramsStr.split(',').map((s: string) => s.trim());
            if (rawParts.length > 3) {
                const p3 = Number(rawParts[3]);
                if (Number.isFinite(p3)) durationRows = Math.max(1, Math.round(p3));
            }
        } else if ((fx as any).durationSec && Number.isFinite((fx as any).durationSec)) {
            durationRows = Math.max(1, Math.round(((fx as any).durationSec) / tickSeconds));
        }

        const depth = Math.max(0, Math.min(15, Math.round(depthRaw)));
        const waveform = Math.max(0, Math.min(15, Math.round(waveformRaw)));
        const param = encodeVibParam(waveform, depth);

        return {
            type: 'vib',
            code: 4,
            param: param & 0xff,
            duration: Math.min(durationRows, sustainCount + 1), // Clamp to note length
            priority: this.priority,
            isGlobal: false,
        };
    },

    canCoexist(other: EffectRequest): boolean {
        // Vibrato can be delayed to sustain rows if panning takes priority on note row
        return other.type === 'pan' && other.isGlobal;
    },

    apply(cell: UGECell, request: EffectRequest): boolean {
        cell.effectCode = request.code;
        cell.effectParam = request.param;
        return true;
    },
};

// Note Cut effect handler (ECx)
const NoteCutHandler: EffectHandler = {
    type: 'cut',
    priority: 20, // Highest priority - always applied

    parse(fx: any, noteEvent: NoteEvent, sustainCount: number, tickSeconds: number): EffectRequest | null {
        const name = (fx.type || fx).toString().toLowerCase();
        if (name !== 'cut') return null;

        const params = fx.params || (Array.isArray(fx) ? fx : []);
        const p0 = params.length > 0 ? Number(params[0]) : 0;
        const cutParam = Number.isFinite(p0) ? Math.max(0, Math.min(15, Math.round(p0))) : 0;

        return {
            type: 'cut',
            code: 0xE,
            param: ((0 & 0xF) << 4) | (cutParam & 0xF), // Extended effect E0x
            duration: 1, // Applied only on last sustain row
            priority: this.priority,
            isGlobal: false,
        };
    },

    canCoexist(other: EffectRequest): boolean {
        return false; // Note cut always wins, applied at end of note
    },

    apply(cell: UGECell, request: EffectRequest): boolean {
        cell.effectCode = request.code;
        cell.effectParam = request.param;
        if (cell.volume === undefined) cell.volume = 0;
        return true;
    },
};

// Portamento effect handler (3xx - Tone portamento)
const PortamentoHandler: EffectHandler = {
    type: 'port',
    priority: 12,

    parse(fx: any, noteEvent: NoteEvent, sustainCount: number, tickSeconds: number): EffectRequest | null {
        const name = fx.type || fx;
        if (String(name).toLowerCase() !== 'port') return null;

        const params = fx.params || (Array.isArray(fx) ? fx : []);
        // port: speed parameter (0-255, determines how fast the pitch slides)
        const speedRaw = params.length > 0 ? Number(params[0]) : 16;
        const speed = Math.max(0, Math.min(255, Math.round(speedRaw)));

        // Parse duration if specified
        let durationRows = sustainCount + 1; // Default: full note length
        if (params && params.length > 1 && Number.isFinite(Number(params[1]))) {
            durationRows = Math.max(1, Math.round(Number(params[1])));
        } else if ((fx as any).durationSec && Number.isFinite((fx as any).durationSec)) {
            durationRows = Math.max(1, Math.round(((fx as any).durationSec) / tickSeconds));
        }

        return {
            type: 'port',
            code: 3,
            param: speed & 0xff,
            duration: Math.min(durationRows, sustainCount + 1),
            priority: this.priority,
            isGlobal: false,
        };
    },

    canCoexist(other: EffectRequest): boolean {
        // Portamento can be delayed to sustain rows if panning takes priority
        return other.type === 'pan' && other.isGlobal;
    },

    apply(cell: UGECell, request: EffectRequest): boolean {
        cell.effectCode = request.code;
        cell.effectParam = request.param;
        return true;
    },
};

// Pitch Bend effect handler - approximated with tone portamento (3xx)
// Note: This is a lossy approximation. Delay parameter and non-linear curves are not supported.
const PitchBendHandler: EffectHandler = {
    type: 'bend',
    priority: 11, // Just below portamento priority

    parse(fx: any, noteEvent: NoteEvent, sustainCount: number, tickSeconds: number): EffectRequest | null {
        const name = fx.type || fx;
        if (String(name).toLowerCase() !== 'bend') return null;

        const params = fx.params || (Array.isArray(fx) ? fx : []);

        // Parse bend parameters: [semitones, curve, delay, time]
        const semitones = params.length > 0 ? Number(params[0]) : 0;
        if (!Number.isFinite(semitones) || semitones === 0) return null;

        const curve = params.length > 1 ? String(params[1]).toLowerCase() : 'linear';
        const delay = params.length > 2 ? Number(params[2]) : 0.5;
        const bendTime = params.length > 3 ? Number(params[3]) : undefined;

        // Warn about unsupported features
        if (curve !== 'linear') {
            warn('export', `Pitch bend with curve '${curve}' detected. hUGETracker only supports linear pitch slides (3xx). Curve will be approximated as linear.`);
        }
        if (delay > 0) {
            warn('export', `Pitch bend with delay=${delay} detected. hUGETracker portamento (3xx) cannot delay bend start. The bend will apply across the full note duration.`);
        }

        // Calculate portamento speed based on semitone distance
        // Portamento formula: portDur = (256 - speed) / 256 * noteDuration * 0.6
        // For pitch bend, we want the slide to complete across the full note duration
        // Rearranging: speed = 256 - (portDur / (noteDuration * 0.6)) * 256
        // For full note bend: portDur ≈ noteDuration, so speed ≈ 256 - (1/0.6)*256 ≈ -171 (invalid)
        // This means we need to account for the note duration relationship differently

        // Simpler approach: Use a fixed speed that produces reasonable slides
        // Testing shows: speed ~16-64 works well for typical bends
        // Map larger semitone distances to higher speeds (faster slides needed)
        const absSemitones = Math.abs(semitones);
        let speed: number;
        if (absSemitones <= 1) {
            speed = 32; // Subtle bends (quarter/half-tone)
        } else if (absSemitones <= 2) {
            speed = 48; // Whole-tone bends (guitar-style)
        } else if (absSemitones <= 5) {
            speed = 64; // Medium bends (perfect fourth)
        } else if (absSemitones <= 7) {
            speed = 96; // Large bends (perfect fifth)
        } else {
            speed = 128; // Extreme bends (octave+)
        }

        return {
            type: 'bend',
            code: 3, // Tone portamento
            param: speed & 0xff,
            duration: sustainCount + 1, // Apply across full note
            priority: this.priority,
            isGlobal: false,
        };
    },

    canCoexist(other: EffectRequest): boolean {
        // Pitch bend cannot coexist with portamento (same effect code)
        if (other.type === 'port') return false;
        // Can be delayed for panning
        return other.type === 'pan' && other.isGlobal;
    },

    apply(cell: UGECell, request: EffectRequest): boolean {
        cell.effectCode = request.code;
        cell.effectParam = request.param;
        return true;
    },
};

// Pitch Sweep effect handler - hardware-native GB NR10 frequency sweep
// Maps directly to Game Boy Pulse 1 channel sweep register
// Note: Sweep is ONLY available on Pulse 1 (channel 0) in hardware
const SweepHandler: EffectHandler = {
    type: 'sweep',
    priority: 13, // Between portamento and arpeggio

    parse(fx: any, noteEvent: NoteEvent, sustainCount: number, tickSeconds: number): EffectRequest | null {
        const name = fx.type || fx;
        if (String(name).toLowerCase() !== 'sweep') return null;

        const params = fx.params || (Array.isArray(fx) ? fx : []);

        // Parse sweep parameters: [time, direction, shift]
        const time = params.length > 0 ? Number(params[0]) : 0;
        if (!Number.isFinite(time) || time < 0 || time > 7) return null;
        if (time === 0) return null; // Sweep disabled

        // GB sweep is set in the instrument definition, not per-note
        // Validate that other parameters exist but don't need to parse them in detail
        const shift = params.length > 2 ? Number(params[2]) : 0;
        if (!Number.isFinite(shift) || shift < 0 || shift > 7) return null;
        if (shift === 0) return null; // No frequency change

        // Warn and ignore - sweep is instrument-level in GB/UGE
        warn('export', `Sweep effect detected on note. Game Boy sweep (NR10) is configured per-instrument, not per-note. Set sweep parameters in the instrument definition instead. Effect will be ignored in UGE export.`);

        return null; // Sweep is instrument-level, not note-level
    },

    canCoexist(other: EffectRequest): boolean {
        return true; // Never applied to cells anyway
    },

    apply(cell: UGECell, request: EffectRequest): boolean {
        // Sweep is instrument-level, cannot be applied to individual cells
        return false;
    },
};

// Arpeggio effect handler (0xy - Arpeggio)
const ArpeggioHandler: EffectHandler = {
    type: 'arp',
    priority: 15, // Higher priority than vibrato, lower than note cut

    parse(fx: any, noteEvent: NoteEvent, sustainCount: number, tickSeconds: number): EffectRequest | null {
        const name = fx.type || fx;
        if (String(name).toLowerCase() !== 'arp') return null;

        const params = fx.params || (Array.isArray(fx) ? fx : []);

        // Parse semitone offsets - filter out non-numeric values
        const offsets = params
            .map((p: any) => Number(p))
            .filter((n: number) => Number.isFinite(n) && n >= 0 && n <= 15);

        if (offsets.length === 0) return null;

        // hUGETracker 0xy supports only 2 offsets (x and y nibbles, both 0-15)
        // If user provides more than 2 offsets, we'll take the first 2 and warn
        const offset1 = offsets.length > 0 ? offsets[0] : 0;
        const offset2 = offsets.length > 1 ? offsets[1] : 0;

        // Encode as 0xy where x=first offset, y=second offset
        const param = ((offset1 & 0xF) << 4) | (offset2 & 0xF);

        // Store metadata for warning if >2 offsets provided
        const hasExtraOffsets = offsets.length > 2;

        return {
            type: 'arp',
            code: 0,
            param: param & 0xff,
            duration: sustainCount + 1, // Full note duration
            priority: this.priority,
            isGlobal: false,
            ...(hasExtraOffsets && { _extraOffsets: offsets.slice(2) }), // Metadata for warning
        } as any;
    },

    canCoexist(other: EffectRequest): boolean {
        // Arpeggio cannot coexist with other note-level effects
        return false;
    },

    apply(cell: UGECell, request: EffectRequest): boolean {
        cell.effectCode = request.code;
        cell.effectParam = request.param;
        return true;
    },
};

// Volume Slide effect handler (Dxy - Volume Slide)
const VolumeSlideHandler: EffectHandler = {
    type: 'volSlide',
    priority: 8,

    parse(fx: any, noteEvent: NoteEvent, sustainCount: number, tickSeconds: number): EffectRequest | null {
        const name = fx.type || fx;
        const nameStr = String(name).toLowerCase();
        if (nameStr !== 'volslide') return null;

        const params = fx.params || (Array.isArray(fx) ? fx : []);
        // volSlide: delta parameter (signed: +N = slide up, -N = slide down)
        const deltaRaw = params.length > 0 ? Number(params[0]) : 0;
        const delta = Number.isFinite(deltaRaw) ? deltaRaw : 0;

        if (delta === 0) return null; // No volume change

        // hUGETracker Axy operates per-frame (~60Hz), so volume changes happen very fast.
        // Scale BeatBax delta values down for smoother, more audible fades:
        // - Divide by 4 to convert "musical" slide amounts to frame-rate slide speeds
        // - Ensure minimum of 1 for any non-zero delta (to avoid no-op)
        // - Clamp to hardware range 0-15
        // Example: volSlide:+8 → A20 (2 per frame = ~0.1s for 15→0 fade)
        //          volSlide:+4 → A10 (1 per frame = ~0.25s fade)
        let slideUp = 0;
        let slideDown = 0;

        if (delta > 0) {
            // Positive delta = slide up
            const scaledDelta = Math.max(1, Math.round(Math.abs(delta) / 4));
            slideUp = Math.min(15, scaledDelta);
        } else if (delta < 0) {
            // Negative delta = slide down
            const scaledDelta = Math.max(1, Math.round(Math.abs(delta) / 4));
            slideDown = Math.min(15, scaledDelta);
        }

        // Encode as Axy where x=slide up, y=slide down
        const param = ((slideUp & 0xF) << 4) | (slideDown & 0xF);

        // Parse duration if specified
        let durationRows = sustainCount + 1; // Default: full note length
        if (params && params.length > 1 && Number.isFinite(Number(params[1]))) {
            durationRows = Math.max(1, Math.round(Number(params[1])));
        } else if ((fx as any).durationSec && Number.isFinite((fx as any).durationSec)) {
            durationRows = Math.max(1, Math.round(((fx as any).durationSec) / tickSeconds));
        }

        return {
            type: 'volSlide',  // Must match handler type
            code: 0xA,  // Axy = Volume Slide (not 0xD which is pattern break)
            param: param & 0xff,
            duration: Math.min(durationRows, sustainCount + 1),
            priority: this.priority,
            isGlobal: false,
        };
    },

    canCoexist(other: EffectRequest): boolean {
        // Volume slide can be delayed if higher priority effects take note row
        return other.type === 'pan' && other.isGlobal;
    },

    apply(cell: UGECell, request: EffectRequest): boolean {
        cell.effectCode = request.code;
        cell.effectParam = request.param;
        return true;
    },
};

// Effect handler registry - add new handlers here as effects are implemented
// Note: Retrigger is NOT included - hUGETracker has no native retrigger effect
// Retrigger is WebAudio-only and cannot be exported to UGE
// Note: Sweep is registered but warns - GB sweep is instrument-level (NR10), not per-note
const EFFECT_HANDLERS: EffectHandler[] = [
    NoteCutHandler,      // Priority 20 - always wins
    ArpeggioHandler,     // Priority 15
    SweepHandler,        // Priority 13 - warns (instrument-level only)
    PortamentoHandler,   // Priority 12
    PitchBendHandler,    // Priority 11 - approximated with portamento
    VibratoHandler,      // Priority 10
    VolumeSlideHandler,  // Priority 8
];

/**
 * Resolve effect conflicts for a single row. Returns the highest-priority
 * effect that should be applied, or null if no effects apply.
 */
function resolveEffectConflict(requests: EffectRequest[]): EffectRequest | null {
    if (requests.length === 0) return null;
    if (requests.length === 1) return requests[0];

    // Sort by priority (descending)
    const sorted = [...requests].sort((a, b) => b.priority - a.priority);

    // Return highest priority effect
    // Future enhancement: check handler.canCoexist() for multi-effect support
    return sorted[0];
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
        // Add null terminator as per UGE spec
        this.buffer.push(0);
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

    // If above range, clamp to maximum value and warn
    if (ugeIndex > 72) {
        warn('export', `Note ${noteName} (index ${ugeIndex}) is above hUGETracker maximum (72). Clamped to C-9.`);
        ugeIndex = 72;
    }

    // Valid range is 0-72 (C-3 to C-9 in hUGETracker)
    if (ugeIndex < 0) return EMPTY_NOTE;

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
    // Track active per-channel arpeggio so we can repeat it on sustain rows.
    let activeArp: { code: number; param: number; remainingRows?: number } | null = null;
    // Map of note globalRow -> desired durationRows (including the note row)
    if (!desiredVibMap) desiredVibMap = new Map();
    // Track if any retrigger effects are encountered (for warning)
    let hasRetrigEffects = false;
    let prevEventType: string | null = null;
    // Track if we've seen the first note yet (to skip portamento on first note)
    let hasSeenNote = false;
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
                instrument: -1, // No instrument change on rest cells
                effectCode: effCode,
                effectParam: effParam,
                pan: currentPan,
            };
        } else if (event.type === 'sustain') {
            // Sustain = ongoing note; retain currentPan. If a vibrato or arpeggio was active on the
            // previous note row, repeat that effect on this sustain row until the note ends
            // or until an explicit duration has expired.
            let effCode = 0;
            let effParam = 0;
            if (activeVib) {
                // If remainingRows is undefined, vib continues for full note (until note ends).
                if (typeof activeVib.remainingRows === 'undefined' || activeVib.remainingRows > 0) {
                    effCode = activeVib.code;
                    effParam = activeVib.param;
                }
            } else if (activeArp) {
                // If remainingRows is undefined, arp continues for full note (until note ends).
                if (typeof activeArp.remainingRows === 'undefined' || activeArp.remainingRows > 0) {
                    effCode = activeArp.code;
                    effParam = activeArp.param;
                }
            }
            cell = {
                note: EMPTY_NOTE,
                instrument: -1, // No instrument change on sustain cells
                effectCode: effCode,
                effectParam: effParam,
                pan: currentPan,
            };
            // Decrement remainingRows if present
            if (activeVib && typeof activeVib.remainingRows === 'number') {
                activeVib.remainingRows = Math.max(0, activeVib.remainingRows - 1);
                if (activeVib.remainingRows === 0) {
                    // Once expired, clear activeVib so further sustains don't repeat it
                    activeVib = null;
                }
            }
            if (activeArp && typeof activeArp.remainingRows === 'number') {
                activeArp.remainingRows = Math.max(0, activeArp.remainingRows - 1);
                if (activeArp.remainingRows === 0) {
                    // Once expired, clear activeArp so further sustains don't repeat it
                    activeArp = null;
                }
            }
        } else if (event.type === 'note') {
            const noteEvent = event as NoteEvent;

            // Compute sustain length (count following sustain events)
            let sustainCount = 0;
            try {
                for (let k = i + 1; k < events.length; k++) {
                    const ne = events[k];
                    if (ne && (ne as any).type === 'sustain') sustainCount++;
                    else break;
                }

                // Mark cut rows if:
                // 1. The note has an explicit cut effect, OR
                // 2. The note is followed only by rests/empty cells until pattern boundary
                //    (to prevent bleeding into next pattern)
                let hasExplicitCut = false;
                let cutParam: number | undefined = undefined;
                if (Array.isArray(noteEvent.effects) && noteEvent.effects.length > 0) {
                    for (const fx of noteEvent.effects) {
                        if (!fx) continue;
                        const name = (fx.type || fx).toString().toLowerCase();
                        const params = fx.params || (Array.isArray(fx) ? fx : []);
                        if (name === 'cut') {
                            hasExplicitCut = true;
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

                const targetRow = i + sustainCount; // last sustain or same note row

                // Check if this note is followed only by rests until the next pattern boundary
                // (to prevent note bleed across pattern loops)
                let needsAutoCut = false;
                if (!hasExplicitCut) {
                    const patternBoundary = Math.ceil((targetRow + 1) / PATTERN_ROWS) * PATTERN_ROWS;
                    let hasNonRestAfter = false;
                    for (let j = targetRow + 1; j < patternBoundary && j < events.length; j++) {
                        const laterEvent = events[j];
                        if (laterEvent && (laterEvent as any).type !== 'rest') {
                            hasNonRestAfter = true;
                            break;
                        }
                    }
                    // If no non-rest events until pattern boundary OR end of channel, add auto-cut to prevent bleed
                    // Also add auto-cut if this is the very last event in the channel
                    if (!hasNonRestAfter) {
                        needsAutoCut = true;
                    }
                }

                // Add to endCutRows/cutParamMap if explicit cut or auto-cut needed
                if (hasExplicitCut || needsAutoCut) {
                    endCutRows.add(targetRow);
                    if (typeof cutParam === 'undefined' || cutParam === null) cutParam = 0;
                    cutParamMap.set(targetRow, cutParam);
                }
            } catch (e) {}

            // Check for uge_transpose in instrument properties
            const inst = noteEvent.instrument ? instruments[noteEvent.instrument] : undefined;
            let ugeTranspose = inst?.uge_transpose ? parseInt(inst.uge_transpose, 10) : 0;

            // For noise channels, NO automatic transpose by default
            // User should write notes in the actual range they want (C2-C8)
            // which will map to hUGETracker indices 0-72 (C-3 to C-9 in tracker notation)
            // If a custom transpose is needed, use uge_transpose in the instrument
            if (channelType === GBChannel.NOISE && !inst?.uge_transpose) {
                ugeTranspose = 0; // No automatic transpose for noise
            }

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

            // Parse all effects using the extensible handler system
            activeVib = null;
            activeArp = null;
            const effectRequests: EffectRequest[] = [];

            if (Array.isArray(noteEvent.effects) && noteEvent.effects.length > 0) {
                for (const fx of noteEvent.effects) {
                    if (!fx) continue;

                    // Track retrigger effects for warning
                    const fxName = (fx.type || fx).toString().toLowerCase();
                    if (fxName === 'retrig') {
                        hasRetrigEffects = true;
                        continue; // Skip retrigger - not supported in UGE
                    }

                    // Skip portamento on the first note (nothing to slide from)
                    if (fxName === 'port' && !hasSeenNote) {
                        continue; // Don't add portamento effect to first note
                    }

                    // Try each handler to parse this effect
                    for (const handler of EFFECT_HANDLERS) {
                        const request = handler.parse(fx, noteEvent, sustainCount, tickSeconds);
                        if (request) {
                            // Warn if arpeggio has more than 2 offsets (UGE 0xy only supports 2)
                            if (request.type === 'arp' && (request as any)._extraOffsets) {
                                const extraOffsets = (request as any)._extraOffsets;
                                const totalOffsets = 2 + extraOffsets.length; // 2 encoded + extras
                                warn('export', `Arpeggio with ${totalOffsets} offsets detected. hUGETracker 0xy only supports 2 offsets. Extra offsets [${extraOffsets.join(', ')}] will be ignored in UGE export.`);
                            }
                            effectRequests.push(request);
                            break; // Each effect handled by only one handler
                        }
                    }
                }
            }

            // Mark that we've seen a note
            hasSeenNote = true;

            // Resolve conflicts and apply the winning effect to note row
            const winningEffect = resolveEffectConflict(effectRequests);
            if (winningEffect && winningEffect.type !== 'cut') {
                // For vibrato, apply to BOTH note row AND the next sustain row
                if (winningEffect.type === 'vib') {
                    // Apply to note row
                    const handler = EFFECT_HANDLERS.find(h => h.type === winningEffect.type);
                    if (handler) {
                        handler.apply(cell, winningEffect);
                    }
                    // Also keep it active for the next sustain row
                    // remainingRows=1 means it will be applied to exactly one more row
                    activeVib = {
                        code: winningEffect.code,
                        param: winningEffect.param,
                        remainingRows: 1
                    };
                    desiredVibMap.set(i, 2); // vibrato appears on 2 rows total
                } else if (winningEffect.type === 'arp') {
                    // Apply arpeggio to note row AND all sustain rows (arpeggio lasts for full note duration)
                    const handler = EFFECT_HANDLERS.find(h => h.type === winningEffect.type);
                    if (handler) {
                        handler.apply(cell, winningEffect);
                    }
                    // Set activeArp to continue on all sustain rows
                    // sustainCount is the number of sustain events following this note
                    activeArp = {
                        code: winningEffect.code,
                        param: winningEffect.param,
                        remainingRows: sustainCount // Apply to ALL sustain rows
                    };
                } else {
                    // Apply non-vibrato, non-arpeggio effects to note row (portamento, volslide, etc.)
                    const handler = EFFECT_HANDLERS.find(h => h.type === winningEffect.type);
                    if (handler) {
                        handler.apply(cell, winningEffect);
                    }
                }
            }
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
            // Default note value when instrument name is used without an explicit note
            // For noise: use MIDI 60 (C4/middle C) → hUGETracker index 24 (mid range)
            // For tonal channels: use MIDI 60 (C4/middle C) → hUGETracker index 24
            const noteValue = 24; // hUGETracker index (MIDI 60 - 36 = 24)
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
                instrument: -1, // No instrument on padding rows
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
                instrument: -1, // No instrument on empty pattern rows
                effectCode: 0,
                effectParam: 0,
                pan: 'C',
            });
        }
        patterns.push(emptyPattern);
    }

    // Store retrigger warning flag on the patterns array for caller to check
    (patterns as any).__hasRetrigEffects = hasRetrigEffects;

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
export async function exportUGE(song: SongModel, outputPath: string, opts: { debug?: boolean; strictGb?: boolean; verbose?: boolean } = {}): Promise<void> {
    const w = new UGEWriter();
    const strictGb = opts && opts.strictGb === true;
    const verbose = opts && opts.verbose === true;

    if (verbose) {
        console.log(`Exporting to UGE v6 format: ${outputPath}`);
    }

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

    if (verbose) {
        console.log('Processing instruments...');
        if (dutyInsts.length > 0 || waveInsts.length > 0 || noiseInsts.length > 0) {
            console.log(`  Instruments exported:`);
            if (dutyInsts.length > 0) console.log(`    - Duty: ${dutyInsts.length}/15 slots (${dutyInsts.join(', ')})`);
            if (waveInsts.length > 0) console.log(`    - Wave: ${waveInsts.length}/15 slots (${waveInsts.join(', ')})`);
            if (noiseInsts.length > 0) console.log(`    - Noise: ${noiseInsts.length}/15 slots (${noiseInsts.join(', ')})`);
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
            // Map direction: 'flat' means no sweep (period=0), up=0, down=1
            let sweepDir = 1; // default to down
            let sweepChange = 0;
            if (env.mode === 'gb') {
                if (env.direction === 'flat') {
                    sweepChange = 0; // No sweep change for flat
                } else {
                    sweepDir = env.direction === 'up' ? 0 : 1;
                    sweepChange = env.period ?? 0;
                }
            }
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
            // Map direction: 'flat' means no sweep (period=0), up=0, down=1
            let sweepDir = 1; // default to down
            let sweepChange = 0;
            if (env.mode === 'gb') {
                if (env.direction === 'flat') {
                    sweepChange = 0; // No sweep change for flat
                } else {
                    sweepDir = env.direction === 'up' ? 0 : 1;
                    sweepChange = env.period ?? 0;
                }
            }
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

    if (verbose) {
        console.log('Building patterns for 4 channels...');
    }

    // Shared map of desired vibrato durations (globalRow -> rows)
    const desiredVibMap: Map<number, number> = new Map();
    let hasRetrigEffectsInSong = false; // Track if any channel has retrigger effects

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        // Find channel by ID (1-4)
        const chModel = song.channels && song.channels.find(c => c.id === ch + 1);
        const chEvents = (chModel && chModel.events) || [];
        if (opts && opts.debug) console.log(`[DEBUG] Channel ${ch + 1} has ${chEvents.length} events`);
        // share `desiredVibMap` across channels so later passes can inspect desired vib rows
        const patterns = eventsToPatterns(chEvents, (song.insts as any) || {}, ch as GBChannel, dutyInsts, waveInsts, noiseInsts, strictGb, (song as any).bpm, desiredVibMap);
        channelPatterns.push(patterns);

        // Check if this channel has retrigger effects
        if ((patterns as any).__hasRetrigEffects) {
            hasRetrigEffectsInSong = true;
        }
    }

    // Emit warning if retrigger effects were found
    if (hasRetrigEffectsInSong) {
        warn('export', 'Retrigger effects detected in song but cannot be exported to UGE (hUGETracker has no native retrigger effect). Retrigger effects will be lost. Use WebAudio playback for retrigger support.');
    }

    // ====== Unified Post-Processing Pass ======
    // Single pass to handle: explicit note cuts, vibrato duration enforcement, and effect conflicts

    // Track statistics for verbose output
    let cutCount = 0;
    let vibCount = 0;

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const chModel = song.channels && song.channels.find(c => c.id === ch + 1);
        const chEvents = (chModel && chModel.events) || [];
        const patterns = channelPatterns[ch] || [];

        for (let i = 0; i < chEvents.length; i++) {
            const ev = chEvents[i];
            if (!ev || (ev as any).type !== 'note') continue;

            const noteEvent = ev as NoteEvent;

            // Count sustain rows following this note
            let sustainCount = 0;
            for (let k = i + 1; k < chEvents.length; k++) {
                const ne = chEvents[k];
                if (ne && (ne as any).type === 'sustain') sustainCount++;
                else break;
            }

            const lastSustainRow = i + sustainCount;

            // 1. Apply explicit note cut effects ONLY if the note has a cut effect
            // (Implicit cuts are handled during pattern building when a rest follows a note)
            const cutEffect = noteEvent.effects?.find((fx: any) => {
                const name = (fx.type || fx).toString().toLowerCase();
                return name === 'cut';
            });

            if (cutEffect) {
                const request = NoteCutHandler.parse(cutEffect, noteEvent, sustainCount, 0);
                if (request) {
                    const patIdx = Math.floor(lastSustainRow / PATTERN_ROWS);
                    const rowIdx = lastSustainRow % PATTERN_ROWS;
                    if (patterns[patIdx] && patterns[patIdx][rowIdx]) {
                        NoteCutHandler.apply(patterns[patIdx][rowIdx], request);
                        cutCount++;
                    }
                }
            }

            // 2. Enforce vibrato duration (trim any effects beyond requested duration)
            const desiredDuration = desiredVibMap.get(i);
            if (typeof desiredDuration === 'number' && desiredDuration > 0) {
                vibCount++;
                // Last row that should have vibrato is i + desiredDuration - 1

                // Clear any vibrato effects beyond the desired duration
                for (let rowOffset = desiredDuration; rowOffset <= sustainCount; rowOffset++) {
                    const globalRow = i + rowOffset;
                    const patIdx = Math.floor(globalRow / PATTERN_ROWS);
                    const rowIdx = globalRow % PATTERN_ROWS;

                    if (patterns[patIdx] && patterns[patIdx][rowIdx] && patterns[patIdx][rowIdx].effectCode === 4) {
                        patterns[patIdx][rowIdx].effectCode = 0;
                        patterns[patIdx][rowIdx].effectParam = 0;
                    }
                }
            }
        }
    }

    if (verbose) {
        console.log('Applying effects and post-processing...');

        // Pattern statistics
        let totalRows = 0;
        for (let ch = 0; ch < NUM_CHANNELS; ch++) {
            totalRows += channelPatterns[ch].reduce((sum, pat) => sum + pat.length, 0);
        }

        console.log('  Pattern structure:');
        for (let ch = 0; ch < NUM_CHANNELS; ch++) {
            const patterns = channelPatterns[ch];
            const rowCount = patterns.reduce((sum, pat) => sum + pat.length, 0);
            console.log(`    - Channel ${ch + 1}: ${patterns.length} pattern${patterns.length !== 1 ? 's' : ''} (${rowCount} rows total)`);
        }

        // Effect statistics
        if (vibCount > 0 || cutCount > 0) {
            console.log('  Effects applied:');
            if (vibCount > 0) console.log(`    - Vibrato: ${vibCount} note${vibCount !== 1 ? 's' : ''}`);
            if (cutCount > 0) console.log(`    - Note cuts: ${cutCount} occurrence${cutCount !== 1 ? 's' : ''}`);
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
                    continue; // Skip default NR51 mix
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
                    continue; // Skip NR51 when vibrato already present
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
                    if (opts && opts.debug) {
                        try { console.log('[DEBUG] Skipping NR51 write due to existing effect on ch1 row', { orderIdx, row, existingEffect: targetCell && targetCell.effectCode }); } catch (e) {}
                    }
                }
            }
        }
    }

    // Debug: dump NR51 writes map so we can inspect which rows were written
    if (opts && opts.debug) {
        try {
            const rows = Array.from(nr51Writes.entries()).map(([k, v]) => ({ globalRow: k, value: v.value, explicit: v.explicit }));
            console.log('[DEBUG] NR51 writes:', JSON.stringify(rows, null, 2));
        } catch (e) { }
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

    if (verbose) {
        const actualBpm = Math.round(896 / ticksPerRow);
        console.log(`  Tempo: ${bpm} BPM (${ticksPerRow} ticks/row in UGE${actualBpm !== bpm ? `, actual: ~${actualBpm} BPM` : ''})`);
    }

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
        if (opts && opts.debug) {
            try { console.log('[DEBUG] finalEnforcement start', { nr51Writes: Array.from(nr51Writes.entries()), desiredVibMap: Array.from(desiredVibMap.entries()) }); } catch(e) {}
        }
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
                if (!vibFx) continue;                // parse requested duration (rows) from positional param, paramsStr, or durationSec
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
                // Default to triangle (2) if waveform is missing, empty, or falsy
                const waveformParam = (params.length > 2 && params[2]) ? params[2] : 2;
                const waveformRaw = mapWaveformName(waveformParam); // 3rd param: waveform name or number
                const depth = Number.isFinite(depthRaw) ? Math.max(0, Math.min(15, Math.round(depthRaw))) : 0;
                const waveform = Number.isFinite(waveformRaw) ? Math.max(0, Math.min(15, Math.round(waveformRaw))) : 0;
                const param = encodeVibParam(waveform, depth);

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
                if (opts && opts.debug) {
                    try { console.log('[DEBUG] finalEnforce note check', { ch, globalStart, nrInfo, noteCellEffect: noteCell && noteCell.effectCode, preserveNoteNR51, allPatternsNoteCell: (allPatterns.find(p=>p.channelIndex===ch && p.patternIndex===Math.floor(globalStart/PATTERN_ROWS))||{cells:[]}).cells[globalStart%PATTERN_ROWS] }); } catch (e) {}
                }

                // Updated behavior: vibrato appears on BOTH note row AND first sustain row
                // This provides immediate vibrato effect starting from the note trigger
                // No need to clear vibrato from note row anymore

                // enforce: for g in [globalStart .. min(allowedEnd, actualEnd)] set 4xy=param
                // Note: starting from globalStart (note row) instead of globalStart+1
                for (let g = globalStart; g <= Math.min(allowedEnd, actualEnd); g++) {
                    const patIdx = Math.floor(g / PATTERN_ROWS);
                    const rowIdx = g % PATTERN_ROWS;
                    const patObj = allPatterns.find(p => p.channelIndex === ch && p.patternIndex === patIdx);
                    if (!patObj) continue;
                    const cell = patObj.cells[rowIdx];
                    if (!cell) continue;
                    // Only apply if no conflicting effect already set (e.g., panning on note row)
                    if (cell.effectCode === 0 || cell.effectCode === 4) {
                        cell.effectCode = 4;
                        cell.effectParam = param & 0xff;
                    }
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
    } catch (e) {
        if (opts && opts.debug) {
            console.log('[DEBUG] final vib enforcement failed', e && (e as any).stack ? (e as any).stack : e);
        }
    }

    // NOTE: vib->cut heuristic removed. We rely on per-note post-process above
    // that injects a single extended `E0x` at the computed end-of-note row
    // (patterns[patIdx][rowIdx]) so cuts are deterministic and occur only once.

    // Write number of patterns
    // Debug: inspect patterns before serialization
    if (opts && opts.debug) {
        try {
            console.log('[DEBUG] Dumping first 3 allPatterns entries (showing up to 16 rows each)');
            for (let pi = 0; pi < Math.min(3, allPatterns.length); pi++) {
                const p = allPatterns[pi];
                console.log(`[DEBUG] allPatterns[${pi}] -> channel=${p.channelIndex} pattern=${p.patternIndex} rows=${p.cells.length}`);
                for (let r = 0; r < Math.min(16, p.cells.length); r++) {
                    const c = p.cells[r] as any;
                    console.log(` [DEBUG] pat${pi} row${r}: note=${c.note} inst=${c.instrument} vol=${typeof c.volume==='number'?c.volume:'undef'} eff=0x${(c.effectCode||0).toString(16)} effp=0x${(c.effectParam||0).toString(16)}`);
                }
            }
        } catch (e) {
            console.log('[DEBUG] Pattern dump failed', e && (e as any).stack ? (e as any).stack : e);
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
            console.log(`[DEBUG] Channel ${ch+1} first ${rowsToShow} rows:`, JSON.stringify(entries));
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

            if (opts && opts.debug && cell && cell.effectCode === 0xC) {
                console.log(`[DEBUG] Writing Note Cut in pattern ${i} ch ${ch} row ${rowIdx}`);
            }

            // Convert absolute instrument index to relative index based on channel type
            // UGE pattern cells use 1-based indices (1-15) within each instrument type
            // 0 means "no instrument" (use previous/default)
            let relativeInstrument = cell.instrument;

            // HUGETracker convention: when portamento or similar effects are present on a note,
            // the instrument field should be blank (0) to prevent re-triggering.
            // However, we DO want to set instruments on:
            // - Rows with effects but NO note (sustain rows with vibrato, etc.)
            // - First note of a song (needs instrument to trigger)
            // So only clear instrument when there's BOTH a note AND an effect code.
            if (cell.effectCode && cell.effectCode !== 0 && cell.note !== EMPTY_NOTE) {
                // Only clear instrument for specific effects that should not retrigger instruments
                // For now, only portamento (3) should clear the instrument on notes
                if (cell.effectCode === 3) {
                    relativeInstrument = 0;
                }
            }

            if (ch >= 0 && ch < NUM_CHANNELS) {
                // If instrument is -1 (rest/sustain cell), use 0 to indicate no instrument change
                if (cell.instrument === -1) {
                    relativeInstrument = 0;
                } else if (ch === 0 || ch === 1) {
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

    if (verbose) {
        console.log('Writing binary output...');
        const sizeKB = (out.length / 1024).toFixed(2);
        console.log(`Export complete: ${out.length.toLocaleString()} bytes (${sizeKB} KB) written`);
        console.log(`File ready for hUGETracker v6`);
    }
}

export default exportUGE;
