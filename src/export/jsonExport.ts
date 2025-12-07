/**
 * Minimal JSON export for BeatBax song model.
 * Currently a placeholder that writes a validated JSON file.
 */
import { writeFileSync } from 'fs';
import { resolveSong } from '../song/resolver';
import { SongModel } from '../song/songModel';

/**
 * Validate a parsed song model (AST) for basic correctness.
 * Throws an Error with details if validation fails.
 */
function validateSongModel(song: any) {
	const errors: string[] = [];
	if (!song || typeof song !== 'object') errors.push('song must be an object');

	// pats: record of name -> string[] (for AST or resolved model)
	if (!song.pats || typeof song.pats !== 'object') errors.push('missing or invalid `pats` object');
	else {
		for (const [k, v] of Object.entries(song.pats)) {
			if (!Array.isArray(v)) errors.push(`pat '${k}' must be an array`);
			else if (v.length === 0) errors.push(`pat '${k}' is empty`);
			else {
				for (let i = 0; i < v.length; i++) {
					if (typeof (v as any)[i] !== 'string') errors.push(`pat '${k}' token at ${i} is not a string`);
				}
			}
		}
	}

	// insts: record of name -> props
	if (!song.insts || typeof song.insts !== 'object') errors.push('missing or invalid `insts` object');

	// channels: array for resolved ISM (ChannelModel) or raw AST channel nodes
	if (!Array.isArray(song.channels)) errors.push('missing or invalid `channels` array');
	else {
		for (const ch of song.channels) {
			if (typeof ch.id !== 'number') errors.push(`channel has invalid id: ${JSON.stringify(ch)}`);
			if (ch.inst && typeof ch.inst !== 'string') errors.push(`channel ${ch.id} inst must be a string`);
			// If channel.events is present (resolved ISM), validate events
			if (ch.events) {
				if (!Array.isArray(ch.events)) errors.push(`channel ${ch.id} events must be an array`);
				else {
					for (const ev of ch.events) {
						if (!ev || typeof ev !== 'object' || !ev.type) errors.push(`channel ${ch.id} has invalid event ${JSON.stringify(ev)}`);
					}
				}
			} else if (ch.pat) {
				if (typeof ch.pat === 'string') {
					errors.push(`channel ${ch.id} has unresolved pat reference '${ch.pat}'`);
				} else if (!Array.isArray(ch.pat)) {
					errors.push(`channel ${ch.id} pat must be an array or unresolved string`);
				} else {
					for (let i = 0; i < ch.pat.length; i++) {
						if (typeof ch.pat[i] !== 'string') errors.push(`channel ${ch.id} pat token at ${i} is not a string`);
					}
				}
			}
			if (ch.bpm !== undefined && typeof ch.bpm !== 'number') errors.push(`channel ${ch.id} bpm must be a number`);
		}
	}

	if (errors.length > 0) throw new Error('Song validation failed:\n' + errors.map(e => ` - ${e}`).join('\n'));
}

/**
 * Export a resolved song model to JSON. Backward-compatible overload: if
 * called with a single string, write a small metadata JSON file.
 */
export async function exportJSON(songOrPath: any, maybePath?: string) {
	let song = songOrPath;
	let outPath = maybePath;

	if (typeof songOrPath === 'string' && !maybePath) {
		// legacy call: exportJSON(filePath)
		const dummy = { exportedAt: new Date().toISOString(), source: songOrPath };
		outPath = songOrPath.endsWith('.json') ? songOrPath : `${songOrPath}.json`;
		writeFileSync(outPath, JSON.stringify(dummy, null, 2), 'utf8');
		console.log('Wrote JSON to', outPath);
		return;
	}

	if (!outPath) outPath = 'song.json';
	else if (!outPath.toLowerCase().endsWith('.json')) outPath = `${outPath}.json`;

	// If caller passed an AST (pats + seqs + insts + channels), resolve into ISM
	try {
		// Heuristic: ASTs will have `seqs` and `pats` and `insts` keys
		if (song && typeof song === 'object' && song.pats && song.insts && song.seqs) {
			// resolve into SongModel
			song = resolveSong(song);
		}
		validateSongModel(song);
	} catch (err: any) {
		console.error('Validation error:');
		console.error(err.message || err);
		throw err;
	}

	// Write normalized JSON with metadata
	const outObj = {
		exportedAt: new Date().toISOString(),
		version: 1,
		song,
	};

	writeFileSync(outPath, JSON.stringify(outObj, null, 2), 'utf8');
	console.log('Wrote validated JSON song to', outPath);
}
