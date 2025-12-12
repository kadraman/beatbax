/*
 * Minimal but functional MIDI exporter.
 * - Accepts a resolved SongModel (as produced by `resolveSong`) and writes
 *   a Type-1 SMF with one MIDI track per channel (up to 16 channels, we use 4).
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

/** Export a resolved song model to MIDI. */
export async function exportMIDI(songOrPath: any, maybePath?: string) {
	let outPath = maybePath as string | undefined;

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
		console.log('Wrote empty MIDI to', outPath);
		return;
	}

	const song = songOrPath;
	if (!outPath) outPath = 'song.mid';

	// Basic SMF parameters
	const ticksPerQuarter = 480; // PPQ
	const ticksPerToken = Math.floor(ticksPerQuarter / 4); // assume token = 16th note
	const bpm = (song && typeof song.bpm === 'number') ? song.bpm : 120;

	// Build header: format 1, N tracks = channels.length (clamped to 16)
	const channels = Array.isArray(song.channels) ? song.channels : [];
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

		for (let ti = 0; ti < events.length; ti++) {
			const ev = events[ti];
			const currTick = ti * ticksPerToken;
			let delta = currTick - lastTick;
			if (delta < 0) delta = 0;

			if (!ev || ev.type === 'rest') {
				lastTick = currTick;
				continue;
			}

			if (ev.type === 'note' || ev.type === 'named') {
				const token = String(ev.token || '');

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
	writeFileSync(outPath, out);
	console.log('Wrote MIDI to', outPath);
}
