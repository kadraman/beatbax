/*
 * Minimal but functional MIDI exporter.
 * - Accepts a resolved SongModel (as produced by `resolveSong`) and writes
 *   a Type-1 SMF with one MIDI track per channel (up to 16 channels).
 * - If called with a single string path, writes a small empty MIDI file.
 */
import { writeFileSync } from 'fs';
import { noteNameToMidi } from '../audio/playback.js';

function writeVarLen(n: number) {
	const bytes: number[] = [];
	let val = n & 0xffffffff;
	let buffer = val & 0x7f;
	val >>= 7;
	while (val > 0) {
		buffer <<= 8;
		buffer |= ((val & 0x7f) | 0x80);
		val >>= 7;
	}
	// Emit bytes from buffer
	while (true) {
		bytes.push(buffer & 0xff);
		if (buffer & 0x80) buffer >>= 8; else break;
	}
	return bytes;
}

function vlq(n: number) {
	// Simpler VLQ writer that builds bytes MSB-first
	const out: number[] = [];
	let value = n & 0xffffffff;
	let buffer = value & 0x7f;
	value >>= 7;
	while (value > 0) {
		buffer |= ((value & 0x7f) << ((out.length + 1) * 8));
		value >>= 7;
	}
	// Fallback: use common algorithm
	const parts: number[] = [];
	let v = n;
	parts.push(v & 0x7f);
	v >>= 7;
	while (v > 0) {
		parts.push((v & 0x7f) | 0x80);
		v >>= 7;
	}
	return parts.reverse();
}

function writeChunk(id: string, data: number[]) {
	const header = Buffer.from(id, 'ascii');
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const body = Buffer.from(data);
	return Buffer.concat([header, len, body]);
}

function pushMetaText(data: number[], delta: number, text: string) {
	const dbytes = vlq(delta);
	for (const b of dbytes) data.push(b);
	const txt = Buffer.from(text, 'utf8');
	data.push(0xff, 0x01);
	const lenBytes = vlq(txt.length);
	for (const b of lenBytes) data.push(b);
	for (const byte of txt) data.push(byte);
}

/** Export a resolved song model to MIDI. */
export async function exportMIDI(songOrPath: any, maybePath?: string, options: { duration?: number, channels?: number[] } = {}, opts?: { debug?: boolean; verbose?: boolean }) {
	let outPath = maybePath as string | undefined;
	const verbose = opts && opts.verbose === true;

	// If caller passed just a path string, write an empty MIDI file
	if (typeof songOrPath === 'string' && !maybePath) {
		outPath = songOrPath.endsWith('.mid') ? songOrPath : `${songOrPath}.mid`;
		// simple empty type-1 MIDI with one empty track
		const header = Buffer.alloc(14);
		header.write('MThd', 0, 4, 'ascii');
		header.writeUInt32BE(6, 4);
		header.writeUInt16BE(1, 8); // format 1
		header.writeUInt16BE(1, 10); // 1 track
		header.writeUInt16BE(480, 12); // ticks per quarter
		const track = writeChunk('MTrk', [0x00, 0xff, 0x2f, 0x00]);
		writeFileSync(outPath, Buffer.concat([header, track]));
		if (opts && opts.debug) console.log('Wrote empty MIDI to', outPath);
		return;
	}

	const song = songOrPath;
	if (!outPath) outPath = 'song.mid';

	if (verbose) {
		console.log(`Exporting to MIDI (Standard MIDI File): ${outPath}`);
	}

	// Basic SMF parameters
	const ticksPerQuarter = 480; // PPQ
	const ticksPerToken = Math.floor(ticksPerQuarter / 4); // assume token = 16th note
	const bpm = (song && typeof song.bpm === 'number') ? song.bpm : 128;

	// Build header: format 1, N tracks = channels.length (clamped to 16)
	const allChannels = Array.isArray(song.channels) ? song.channels : [];
	const channels = options.channels
		? allChannels.filter((ch: any) => options.channels!.includes(ch.id))
		: allChannels;

	const ntracks = Math.max(1, Math.min(16, channels.length));
	const header = Buffer.alloc(14);
	header.write('MThd', 0, 4, 'ascii');
	header.writeUInt32BE(6, 4);
	header.writeUInt16BE(1, 8); // format 1
	header.writeUInt16BE(ntracks, 10);
	header.writeUInt16BE(ticksPerQuarter, 12);

	const trackBuffers: Buffer[] = [];

	// GB type -> GM program defaults and drum mapping
	const GB_TO_GM_PROGRAM: Record<string, number> = {
		pulse1: 80, // Lead 1 (square-like)
		pulse2: 34, // Electric Bass (example)
		wave: 81, // Lead 2 (saw-ish)
		noise: 0
	};

	const NOISE_TO_DRUM: Record<string, number> = {
		hh: 42, // closed hi-hat
		sn: 38, // acoustic snare
		kick: 36, // bass drum
		default: 39
	};

	function resolveProgramForInstrumentName(instName: string | undefined, ch: any, ev?: any) {
		// priority: ev.instProps?.gm -> song.insts[instName]?.gm -> GB_TO_GM_PROGRAM based on type -> 0
		if (ev && ev.instProps && typeof ev.instProps.gm === 'number') return ev.instProps.gm & 0x7f;
		if (ev && ev.instProps && typeof ev.instProps.gm === 'string') {
			const parsed = parseInt(ev.instProps.gm as any, 10);
			if (!isNaN(parsed)) return parsed & 0x7f;
		}
		if (instName && song && song.insts && song.insts[instName]) {
			const inst = song.insts[instName];
			if (inst && typeof inst.gm === 'number') return inst.gm & 0x7f;
			if (inst && typeof inst.gm === 'string') {
				const parsed = parseInt(inst.gm as any, 10);
				if (!isNaN(parsed)) return parsed & 0x7f;
			}
			if (inst && typeof inst.type === 'string') {
				const t = String(inst.type).toLowerCase();
				if (t.includes('pulse1')) return GB_TO_GM_PROGRAM.pulse1;
				if (t.includes('pulse2')) return GB_TO_GM_PROGRAM.pulse2;
				if (t.includes('wave')) return GB_TO_GM_PROGRAM.wave;
				if (t.includes('noise')) return GB_TO_GM_PROGRAM.noise;
			}
		}
		// Channel-level default instrument may have type data
		if (ch && ch.defaultInstrument && song && song.insts && song.insts[ch.defaultInstrument]) {
			const inst = song.insts[ch.defaultInstrument];
			if (inst && typeof inst.type === 'string') {
				const t = String(inst.type).toLowerCase();
				if (t.includes('pulse1')) return GB_TO_GM_PROGRAM.pulse1;
				if (t.includes('pulse2')) return GB_TO_GM_PROGRAM.pulse2;
				if (t.includes('wave')) return GB_TO_GM_PROGRAM.wave;
				if (t.includes('noise')) return GB_TO_GM_PROGRAM.noise;
			}
		}
		return GB_TO_GM_PROGRAM.pulse1;
	}

	// For each channel produce a track of note on/off events, emitting Program Change when needed
	for (let ci = 0; ci < ntracks; ci++) {
		const ch = channels[ci];
		const events = (ch && Array.isArray(ch.events)) ? ch.events : (ch && Array.isArray(ch.pat) ? ch.pat : []);
		const data: number[] = [];
		let lastTick = 0;

		// choose a MIDI channel for this GB channel (prefer mapping noise -> 9)
		let midiChannel = Math.max(0, Math.min(15, (ci % 16)));
		// if channel default instrument is noise, map to GM percussion channel 9
		if (ch && ch.defaultInstrument && song && song.insts && song.insts[ch.defaultInstrument]) {
			const tinst = song.insts[ch.defaultInstrument];
			if (tinst && typeof tinst.type === 'string' && String(tinst.type).toLowerCase().includes('noise')) midiChannel = 9;
		}

		// initial program based on channel default
		let currentProgram = resolveProgramForInstrumentName(ch && ch.defaultInstrument, ch);
		if (midiChannel !== 9) {
			const d0 = vlq(0);
			for (const b of d0) data.push(b);
			data.push(0xC0 | midiChannel, currentProgram & 0x7f);
		}

		// Optional: set tempo meta event in track 0 only
		if (ci === 0) {
			// delta 0, set tempo (microseconds per quarter)
			const mpq = Math.round(60000000 / bpm);
			data.push(0x00, 0xff, 0x51, 0x03, (mpq >> 16) & 0xff, (mpq >> 8) & 0xff, mpq & 0xff);
		}

		const secondsPerBeat = 60 / bpm;
		const tickSeconds = secondsPerBeat / 4; // 16th note
		const maxEvents = options.duration ? Math.floor(options.duration / tickSeconds) : events.length;
		const truncatedEvents = events.slice(0, maxEvents);

		for (let ti = 0; ti < truncatedEvents.length; ti++) {
			const ev = truncatedEvents[ti];
			const currTick = ti * ticksPerToken;
			let delta = currTick - lastTick;
			if (delta < 0) delta = 0;

			if (!ev || ev.type === 'rest') {
				lastTick = currTick;
				continue;
			}

			if (ev.type === 'note' || ev.type === 'named') {
				const token = String(ev.token || '');

				// If this event has effects (vibrato, portamento, volume slide), emit MIDI text meta events or CCs describing them
				if (Array.isArray(ev.effects)) {
					for (const fx of ev.effects) {
						const fxType = String(fx.type).toLowerCase();
						if (fxType === 'vib') {
							const depth = (Array.isArray(fx.params) && fx.params.length > 0) ? fx.params[0] : undefined;
							const rate = (Array.isArray(fx.params) && fx.params.length > 1) ? fx.params[1] : undefined;
							const shape = (Array.isArray(fx.params) && fx.params.length > 2) ? fx.params[2] : undefined;
							pushMetaText(data, delta, `vib:depth=${depth !== undefined ? depth : ''},rate=${rate !== undefined ? rate : ''},shape=${shape !== undefined ? shape : ''}`);
							delta = 0;
							break;
						} else if (fxType === 'port') {
							const speed = (Array.isArray(fx.params) && fx.params.length > 0) ? fx.params[0] : undefined;
							const duration = (Array.isArray(fx.params) && fx.params.length > 1) ? fx.params[1] : undefined;
							pushMetaText(data, delta, `port:speed=${speed !== undefined ? speed : ''},duration=${duration !== undefined ? duration : ''}`);
							delta = 0;
							break;
						} else if (fxType === 'trem') {
							// Tremolo: document via text meta event
							// Note: MIDI doesn't have native tremolo support
							// Effect parameters are preserved for reference/import
							const depth = (Array.isArray(fx.params) && fx.params.length > 0) ? fx.params[0] : undefined;
							const rate = (Array.isArray(fx.params) && fx.params.length > 1) ? fx.params[1] : undefined;
							const waveform = (Array.isArray(fx.params) && fx.params.length > 2) ? fx.params[2] : undefined;
							pushMetaText(data, delta, `trem:depth=${depth !== undefined ? depth : ''},rate=${rate !== undefined ? rate : ''},waveform=${waveform !== undefined ? waveform : 'sine'}`);
							delta = 0;
							break;
						} else if (fxType === 'volslide') {
							// Volume slide: emit MIDI CC #7 (Volume) event
							const deltaVal = (Array.isArray(fx.params) && fx.params.length > 0) ? Number(fx.params[0]) : 0;
							const steps = (Array.isArray(fx.params) && fx.params.length > 1) ? Number(fx.params[1]) : undefined;
							// Map BeatBax delta (±10 typical range) to MIDI volume (0-127)
							// Start at mid-volume (64), apply scaled delta
							const startVol = 64;
							const scaledDelta = Math.round(deltaVal * 6.4); // Scale ±10 to ±64
							const targetVol = Math.max(0, Math.min(127, startVol + scaledDelta));

							// Emit initial CC#7 for volume change
							const dbytes = vlq(delta);
							for (const b of dbytes) data.push(b);
							data.push(0xB0 | midiChannel, 0x07, targetVol & 0x7f);

							// Add text meta event for reference
							pushMetaText(data, 0, `volSlide:delta=${deltaVal},steps=${steps !== undefined ? steps : 'smooth'}`);
							delta = 0;
							break;
						} else if (fxType === 'bend') {
							// Pitch bend: emit MIDI pitch wheel events
							// MIDI pitch wheel range: 0x0000 to 0x3FFF (0-16383), center = 0x2000 (8192)
							// Standard range: ±2 semitones, but we'll map based on actual semitones requested
							const semitones = (Array.isArray(fx.params) && fx.params.length > 0) ? Number(fx.params[0]) : 0;
							const curve = (Array.isArray(fx.params) && fx.params.length > 1) ? String(fx.params[1]) : 'linear';
							const delay = (Array.isArray(fx.params) && fx.params.length > 2) ? Number(fx.params[2]) : undefined;
							const bendTime = (Array.isArray(fx.params) && fx.params.length > 3) ? Number(fx.params[3]) : undefined;

							// MIDI pitch bend range: ±8192 units = ±2 semitones (standard)
							// Map semitones to pitch bend value: value = 8192 + (semitones / 2) * 8192
							// For semitones outside ±2 range, clamp or use RPN to set bend range
							const bendValue = Math.round(8192 + (semitones / 2) * 8192);
							const clampedValue = Math.max(0, Math.min(16383, bendValue));

							// Split 14-bit value into LSB and MSB
							const lsb = clampedValue & 0x7F;
							const msb = (clampedValue >> 7) & 0x7F;

							// Emit pitch bend event (0xE0 | channel)
							const dbytes = vlq(delta);
							for (const b of dbytes) data.push(b);
							data.push(0xE0 | midiChannel, lsb, msb);

							// Add text meta event for curve, delay and time (for re-import/reference)
							pushMetaText(data, 0, `bend:semitones=${semitones},curve=${curve},delay=${delay !== undefined ? delay : 'default'},time=${bendTime !== undefined ? bendTime : 'remaining'}`);
							delta = 0;
							break;
						}
					}
				}

				// determine instrument name for this event (fallback to channel default)
				const instName = ev.instrument || (ch && ch.defaultInstrument) || undefined;
				const evProg = resolveProgramForInstrumentName(instName, ch, ev);

				// if program changed and this is melodic channel, emit Program Change
				if (midiChannel !== 9 && evProg !== currentProgram) {
					const dbytes = vlq(delta);
					for (const b of dbytes) data.push(b);
					data.push(0xC0 | midiChannel, evProg & 0x7f);
					currentProgram = evProg;
					// reset delta accounting
					lastTick = currTick;
					delta = 0;
				}

				// If this track is mapped to percussion, map named tokens to drum keys
				if (midiChannel === 9) {
					// map known names or fall back to default
					const key = (token && NOISE_TO_DRUM[token.toLowerCase()]) || NOISE_TO_DRUM.default;
					const dbytes = vlq(delta);
					for (const b of dbytes) data.push(b);
					data.push(0x99, key & 0xff, 0x64);
					const offDelta = vlq(ticksPerToken);
					for (const b of offDelta) data.push(b);
					data.push(0x89, key & 0xff, 0x40);
					lastTick = currTick + ticksPerToken;
					continue;
				}

				// melodic mapping: parse pitch
				const m = token.match(/^([A-G][#bB]?)(-?\d+)$/i);
				if (m) {
					const name = m[1].toUpperCase();
					const octave = parseInt(m[2], 10);
					const midi = noteNameToMidi(name, octave);
					if (midi !== null && typeof midi === 'number') {
						const dbytes = vlq(delta);
						for (const b of dbytes) data.push(b);
						data.push(0x90 | midiChannel, midi & 0xff, 0x64);
						const offDeltaBytes = vlq(ticksPerToken);
						for (const b of offDeltaBytes) data.push(b);
						data.push(0x80 | midiChannel, midi & 0xff, 0x40);
						lastTick = currTick + ticksPerToken;
						continue;
					}
				}

				lastTick = currTick;
				continue;
			}

			// other event types ignored for MIDI
			lastTick = currTick;
		}

		// End of track meta event
		const endDelta = vlq(0);
		for (const b of endDelta) data.push(b);
		data.push(0xff, 0x2f, 0x00);

		const trackBuf = writeChunk('MTrk', data);
		trackBuffers.push(trackBuf);
	}

	// Write file
	const out = Buffer.concat([header, ...trackBuffers]);
	if (opts && opts.debug) {
		console.log(`[DEBUG] MIDI: ${ntracks} tracks, ${ticksPerQuarter} PPQ`);
	}

	if (verbose) {
		console.log(`  MIDI configuration:`);
		console.log(`    - Format: Type 1 (multi-track)`);
		console.log(`    - Tracks: ${ntracks} (1 per channel)`);
		console.log(`    - Tempo: ${bpm} BPM`);
		console.log(`    - Resolution: ${ticksPerQuarter} PPQ`);
		if (options.channels) {
			console.log(`    - Channels exported: ${options.channels.join(', ')}`);
		}
		if (options.duration) {
			console.log(`    - Duration: ${options.duration}s`);
		}
	}

	writeFileSync(outPath, out);

	if (verbose) {
		const sizeKB = (out.length / 1024).toFixed(2);
		console.log(`Export complete: ${out.length.toLocaleString()} bytes (${sizeKB} KB) written`);
	}
}
