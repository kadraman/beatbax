/**
 * UGE v6 binary file reader for hUGETracker files.
 * 
 * This reader parses UGE v6 files (and backwards compatible with v5/v4/v3)
 * and extracts all data including instruments, patterns, orders, and wavetables.
 * 
 * Based on:
 * - hUGETracker UGE v6 format specification (docs/uge-v6-spec.md)
 * - GB Studio's ugeHelper.ts implementation
 * - Reference UGE files in songs/ directory
 */

import { readFileSync } from 'fs';

// Constants
const NUM_DUTY_INSTRUMENTS = 15;
const NUM_WAVE_INSTRUMENTS = 15;
const NUM_NOISE_INSTRUMENTS = 15;
const NUM_WAVETABLES = 16;
const WAVETABLE_SIZE = 32;
const PATTERN_ROWS = 64;
const NUM_CHANNELS = 4;
const NUM_ROUTINES = 16;
const EMPTY_NOTE = 90;

// Instrument types
export enum InstrumentType {
	DUTY = 0,
	WAVE = 1,
	NOISE = 2,
}

// Channel types
export enum ChannelType {
	PULSE1 = 0,
	PULSE2 = 1,
	WAVE = 2,
	NOISE = 3,
}

/**
 * Subpattern cell (instrument automation)
 */
export interface SubPatternCell {
	note: number | null;
	jump: number;
	effectcode: number | null;
	effectparam: number | null;
}

/**
 * Duty/Pulse instrument data
 */
export interface DutyInstrument {
	type: InstrumentType.DUTY;
	name: string;
	length: number;
	length_enabled: boolean;
	initial_volume: number;
	volume_sweep_direction: number; // 0 = increase, 1 = decrease
	volume_sweep_change: number;
	freq_sweep_time: number;
	freq_sweep_shift: number;
	duty_cycle: number; // 0-3 (12.5%, 25%, 50%, 75%)
	subpattern_enabled: boolean;
	subpattern: SubPatternCell[];
}

/**
 * Wave instrument data
 */
export interface WaveInstrument {
	type: InstrumentType.WAVE;
	name: string;
	length: number;
	length_enabled: boolean;
	volume: number; // output level
	wave_index: number; // wavetable index (0-15)
	subpattern_enabled: boolean;
	subpattern: SubPatternCell[];
}

/**
 * Noise instrument data
 */
export interface NoiseInstrument {
	type: InstrumentType.NOISE;
	name: string;
	length: number;
	length_enabled: boolean;
	initial_volume: number;
	volume_sweep_direction: number;
	volume_sweep_change: number;
	noise_counter_step: number; // 0 = 15-bit, 1 = 7-bit
	subpattern_enabled: boolean;
	subpattern: SubPatternCell[];
	noise_macro?: number[]; // v4-v5 only (6 int8 values)
}

export type Instrument = DutyInstrument | WaveInstrument | NoiseInstrument;

/**
 * Pattern cell (one row in a pattern)
 */
export interface PatternCell {
	note: number; // 0-72 for notes, 90 for empty/rest
	instrument: number; // instrument index (0 if not used)
	effectcode: number;
	effectparam: number;
}

/**
 * Pattern data (64 rows)
 */
export interface Pattern {
	id: number;
	rows: PatternCell[];
}

/**
 * Complete UGE song data
 */
export interface UGESong {
	version: number;
	name: string;
	artist: string;
	comment: string;
	
	duty_instruments: DutyInstrument[];
	wave_instruments: WaveInstrument[];
	noise_instruments: NoiseInstrument[];
	
	wavetables: Uint8Array[]; // 16 wavetables of 32 nibbles each

	ticks_per_row: number;
	timer_enabled: boolean; // v6+ only
	timer_divider: number; // v6+ only

	patterns: Pattern[];

	// Order lists for each channel (pattern indices)
	orders: {
		pulse1: number[];
		pulse2: number[];
		wave: number[];
		noise: number[];
	};

	routines: string[]; // 16 routine code strings
}

/**
 * Binary buffer reader with helper methods for UGE format.
 */
class UGEReader {
	private data: ArrayBuffer;
	private uint8data: Uint8Array;
	private offset: number = 0;
	private textDecoder: TextDecoder;

	constructor(buffer: ArrayBuffer) {
		this.data = buffer;
		this.uint8data = new Uint8Array(buffer);
		this.textDecoder = new TextDecoder('utf-8');
	}

	readU8(): number {
		return this.uint8data[this.offset++];
	}

	readU32(): number {
		const view = new DataView(this.data, this.offset, 4);
		this.offset += 4;
		return view.getUint32(0, true); // little-endian
	}

	readBool(): boolean {
		return this.readU8() !== 0;
	}

	/**
	 * Read shortstring: 1 byte length + up to 255 bytes (total 256 bytes)
	 */
	readShortString(): string {
		const len = this.uint8data[this.offset];
		let text = '';
		if (len > 0) {
			text = this.textDecoder.decode(
				this.data.slice(this.offset + 1, this.offset + 1 + len)
			);
		}
		this.offset += 256; // Always 256 bytes total
		return text;
	}

	/**
	 * Read Pascal AnsiString: u32 length + bytes + null terminator
	 */
	readString(): string {
		const len = this.readU32();
		if (len === 0) {
			return '';
		}
		const text = this.textDecoder.decode(
			this.data.slice(this.offset, this.offset + len)
		);
		this.offset += len;
		// Skip null terminator if present
		if (this.offset < this.data.byteLength && this.uint8data[this.offset] === 0) {
			this.offset++;
		}
		return text;
	}

	/**
	 * Read a pattern cell (depends on version)
	 */
	readPatternCell(version: number): PatternCell {
		const note = this.readU32();
		const instrument = this.readU32();
		
		if (version >= 6) {
			this.offset += 4; // unused field in v6
		}
		
		const effectcode = this.readU32();
		const effectparam = this.readU8();

		return { note, instrument, effectcode, effectparam };
	}

	/**
	 * Read a subpattern cell (64 rows per instrument)
	 */
	readSubPatternCell(): SubPatternCell {
		const note = this.readU32();
		this.offset += 4; // unused field
		const jump = this.readU32();
		const effectcode = this.readU32();
		const effectparam = this.readU8();

		return {
			note: note === EMPTY_NOTE ? null : note,
			jump,
			effectcode: effectcode === 0 && effectparam === 0 ? null : effectcode,
			effectparam: effectcode === 0 && effectparam === 0 ? null : effectparam,
		};
	}

	getOffset(): number {
		return this.offset;
	}
}

/**
 * Parse a UGE file from an ArrayBuffer
 */
export function parseUGE(buffer: ArrayBuffer): UGESong {
	const reader = new UGEReader(buffer);

	// Header
	const version = reader.readU32();
	
	if (version < 0 || version > 6) {
		throw new Error(`Unsupported UGE version: ${version}`);
	}

	const name = reader.readShortString();
	const artist = reader.readShortString();
	const comment = reader.readShortString();

	// Instruments
	const instrument_count = version < 3 ? 15 : 45;
	
	const duty_instruments: DutyInstrument[] = [];
	const wave_instruments: WaveInstrument[] = [];
	const noise_instruments: NoiseInstrument[] = [];

	for (let n = 0; n < instrument_count; n++) {
		const type = reader.readU32();
		const inst_name = reader.readShortString();

		const length = reader.readU32();
		const length_enabled = reader.readBool();
		
		let initial_volume = reader.readU8();
		if (initial_volume > 15) {
			initial_volume = 15; // clamp to valid range
		}

		const volume_direction = reader.readU32();
		let volume_sweep_change = reader.readU8();
		
		// Convert volume sweep to signed format
		if (volume_sweep_change !== 0) {
			volume_sweep_change = 8 - volume_sweep_change;
		}
		if (volume_direction) {
			volume_sweep_change = -volume_sweep_change;
		}

		const freq_sweep_time = reader.readU32();
		const freq_sweep_direction = reader.readU32();
		let freq_sweep_shift = reader.readU32();
		if (freq_sweep_direction) {
			freq_sweep_shift = -freq_sweep_shift;
		}

		const duty = reader.readU8();

		const wave_output_level = reader.readU32();
		const wave_waveform_index = reader.readU32();

		let subpattern_enabled = false;
		let noise_counter_step = 0;
		const subpattern: SubPatternCell[] = [];
		const noise_macro: number[] = [];

		if (version >= 6) {
			noise_counter_step = reader.readU32();
			subpattern_enabled = reader.readBool();

			for (let m = 0; m < 64; m++) {
				subpattern.push(reader.readSubPatternCell());
			}
		} else {
			// v5 and earlier
			reader.readU32(); // unused
			noise_counter_step = reader.readU32();
			reader.readU32(); // unused
			
			if (version >= 4) {
				// Read noise macro (6 int8 values)
				for (let m = 0; m < 6; m++) {
					const uint8ref = reader.readU8();
					const int8ref = uint8ref > 0x7f ? uint8ref - 0x100 : uint8ref;
					noise_macro.push(int8ref);
				}
			}
		}

		// Store instrument based on type
		if (type === InstrumentType.DUTY) {
			duty_instruments.push({
				type: InstrumentType.DUTY,
				name: inst_name,
				length,
				length_enabled: length_enabled,
				initial_volume,
				volume_sweep_direction: volume_direction,
				volume_sweep_change,
				freq_sweep_time,
				freq_sweep_shift,
				duty_cycle: duty,
				subpattern_enabled,
				subpattern,
			});
		} else if (type === InstrumentType.WAVE) {
			wave_instruments.push({
				type: InstrumentType.WAVE,
				name: inst_name,
				length,
				length_enabled: length_enabled,
				volume: wave_output_level,
				wave_index: wave_waveform_index,
				subpattern_enabled,
				subpattern,
			});
		} else if (type === InstrumentType.NOISE) {
			noise_instruments.push({
				type: InstrumentType.NOISE,
				name: inst_name,
				length,
				length_enabled: length_enabled,
				initial_volume,
				volume_sweep_direction: volume_direction,
				volume_sweep_change,
				noise_counter_step,
				subpattern_enabled,
				subpattern,
				noise_macro: noise_macro.length > 0 ? noise_macro : undefined,
			});
		}
	}

	// Wavetables (16 × 32 nibbles)
	const wavetables: Uint8Array[] = [];
	for (let n = 0; n < NUM_WAVETABLES; n++) {
		const wave = new Uint8Array(WAVETABLE_SIZE);
		for (let i = 0; i < WAVETABLE_SIZE; i++) {
			wave[i] = reader.readU8();
		}
		wavetables.push(wave);
		
		// v2 and earlier have off-by-one error
		if (version < 3) {
			reader.readU8();
		}
	}

	// Pattern timing
	const ticks_per_row = reader.readU32();
	
	let timer_enabled = false;
	let timer_divider = 0;
	if (version >= 6) {
		timer_enabled = reader.readBool();
		timer_divider = reader.readU32();
	}

	// Patterns
	const pattern_count = reader.readU32();
	const patterns: Pattern[] = [];
	
	for (let n = 0; n < pattern_count; n++) {
		let patternId: number;
		
		if (version >= 5) {
			patternId = reader.readU32();
		} else {
			patternId = n;
		}

		const rows: PatternCell[] = [];
		for (let m = 0; m < PATTERN_ROWS; m++) {
			rows.push(reader.readPatternCell(version));
		}

		// Handle duplicate pattern IDs in old GB Studio files (v5)
		if (version === 5 && patterns[patternId]) {
			patterns[n] = { id: n, rows };
		} else {
			patterns[patternId] = { id: patternId, rows };
		}
	}

	// Orders (pattern sequences for each channel)
	const orders_arrays: number[][] = [];
	
	for (let n = 0; n < NUM_CHANNELS; n++) {
		const order_count = reader.readU32(); // Has off-by-one
		const order_data: number[] = [];
		
		// Read order_count - 1 entries (off-by-one bug in format)
		for (let m = 0; m < order_count - 1; m++) {
			order_data.push(reader.readU32());
		}
		
		// Skip the last entry (off-by-one filler)
		reader.readU32();
		
		orders_arrays.push(order_data);
	}

	// Routines (v2+)
	const routines: string[] = [];
	if (version >= 2) {
		for (let n = 0; n < NUM_ROUTINES; n++) {
			routines.push(reader.readString());
		}
	}

	return {
		version,
		name,
		artist,
		comment,
		duty_instruments,
		wave_instruments,
		noise_instruments,
		wavetables,
		ticks_per_row,
		timer_enabled,
		timer_divider,
		patterns,
		orders: {
			pulse1: orders_arrays[0] || [],
			pulse2: orders_arrays[1] || [],
			wave: orders_arrays[2] || [],
			noise: orders_arrays[3] || [],
		},
		routines,
	};
}

/**
 * Read a UGE file from disk
 */
export function readUGEFile(filePath: string): UGESong {
	const buffer = readFileSync(filePath);
	return parseUGE(buffer.buffer);
}

/**
 * Convert a MIDI note number (0-127) to UGE note number (0-72, 90=empty)
 */
export function midiNoteToUGE(midiNote: number): number {
	if (midiNote < 0 || midiNote > 127) {
		return EMPTY_NOTE;
	}
	// UGE uses C-2 (MIDI 0) as note 0, up to B-7 (MIDI 95) as note 72
	// Map MIDI 0-95 to UGE 0-72 (8 octaves × 12 notes, but UGE only has ~6 octaves)
	const ugeNote = midiNote;
	return ugeNote > 72 ? EMPTY_NOTE : ugeNote;
}

/**
 * Convert UGE note number to note name string
 */
export function ugeNoteToString(note: number): string {
	if (note === EMPTY_NOTE || note < 0) {
		return '---';
	}
	
	const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
	const octave = Math.floor(note / 12) - 2; // UGE starts at C-2
	const noteName = noteNames[note % 12];
	
	return `${noteName}${octave}`;
}

/**
 * Get a human-readable summary of a UGE song
 */
export function getUGESummary(song: UGESong): string {
	const lines: string[] = [];
	
	lines.push(`=== UGE Song Summary ===`);
	lines.push(`Version: ${song.version}`);
	lines.push(`Name: ${song.name || '(unnamed)'}`);
	lines.push(`Artist: ${song.artist || '(unknown)'}`);
	lines.push(`Comment: ${song.comment || '(none)'}`);
	lines.push('');
	
	lines.push(`Tempo: ${song.ticks_per_row} ticks/row`);
	if (song.timer_enabled) {
		lines.push(`Timer: enabled (divider=${song.timer_divider})`);
	}
	lines.push('');
	
	lines.push(`Duty Instruments: ${song.duty_instruments.length}`);
	song.duty_instruments.forEach((inst, i) => {
		if (inst.name) {
			lines.push(`  ${i}: ${inst.name}`);
		}
	});
	lines.push('');
	
	lines.push(`Wave Instruments: ${song.wave_instruments.length}`);
	song.wave_instruments.forEach((inst, i) => {
		if (inst.name) {
			lines.push(`  ${i}: ${inst.name} (wave=${inst.wave_index})`);
		}
	});
	lines.push('');
	
	lines.push(`Noise Instruments: ${song.noise_instruments.length}`);
	song.noise_instruments.forEach((inst, i) => {
		if (inst.name) {
			lines.push(`  ${i}: ${inst.name}`);
		}
	});
	lines.push('');
	
	lines.push(`Patterns: ${song.patterns.length}`);
	lines.push(`Orders (Pulse1): ${song.orders.pulse1.length}`);
	lines.push(`Orders (Pulse2): ${song.orders.pulse2.length}`);
	lines.push(`Orders (Wave): ${song.orders.wave.length}`);
	lines.push(`Orders (Noise): ${song.orders.noise.length}`);
	
	return lines.join('\n');
}

export default {
	parseUGE,
	readUGEFile,
	midiNoteToUGE,
	ugeNoteToString,
	getUGESummary,
};
