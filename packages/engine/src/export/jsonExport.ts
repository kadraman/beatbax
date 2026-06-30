/*
 * Minimal JSON export for BeatBax song model.
 */
import { resolveSong } from '../song/resolver.js';
import { error } from '../util/diag.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('export:json');

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
			if (ch.bpm !== undefined) errors.push(`channel ${ch.id} contains a top-level bpm which is not supported; use top-level 'bpm' or sequence transforms (fast/slow) instead`);
		}
	}

	if (errors.length > 0) throw new Error('Song validation failed:\n' + errors.map(e => ` - ${e}`).join('\n'));
}

function attachEffectMetadata(song: any) {
	const clonedSong = JSON.parse(JSON.stringify(song));
	for (const ch of (clonedSong.channels || [])) {
		if (!Array.isArray(ch.events)) continue;
		for (const ev of ch.events) {
			if (!ev || !Array.isArray(ev.effects) || ev.effects.length === 0) continue;
			ev.effectMeta = ev.effectMeta || [];
			for (const fx of ev.effects) {
				if (!fx || !fx.type) continue;
				const t = String(fx.type).toLowerCase();
				if (t === 'vib') {
					const depth = (Array.isArray(fx.params) && fx.params.length > 0) ? Number(fx.params[0]) : undefined;
					const rate = (Array.isArray(fx.params) && fx.params.length > 1) ? Number(fx.params[1]) : undefined;
					const shape = (Array.isArray(fx.params) && fx.params.length > 2) ? fx.params[2] : undefined;
					ev.effectMeta.push({ type: 'vib', depth: Number.isFinite(depth) ? depth : undefined, rate: Number.isFinite(rate) ? rate : undefined, shape: shape });
				} else if (t === 'port' || t === 'portamento') {
					const speed = (Array.isArray(fx.params) && fx.params.length > 0) ? Number(fx.params[0]) : undefined;
					const duration = (Array.isArray(fx.params) && fx.params.length > 1) ? Number(fx.params[1]) : undefined;
					ev.effectMeta.push({ type: 'port', speed: Number.isFinite(speed) ? speed : undefined, duration: Number.isFinite(duration) ? duration : undefined });
				} else {
					ev.effectMeta.push({ type: fx.type, params: fx.params });
				}
			}
		}
	}
	return clonedSong;
}

/**
 * Build normalized ISM JSON for a resolved song model.
 */
export function buildJSON(song: any, opts?: { debug?: boolean; verbose?: boolean }): string {
	validateSongModel(song);
	const clonedSong = attachEffectMetadata(song);
	const outObj = {
		exportedAt: new Date().toISOString(),
		version: 1,
		song: clonedSong,
	};

	if (opts?.debug) {
		log.debug(`JSON: version ${outObj.version}, ${song.channels.length} channels`);
	}

	if (opts?.verbose) {
		log.info(`  Song structure:`);
		log.info(`    - Channels: ${song.channels.length}`);
		log.info(`    - Patterns: ${Object.keys(song.pats || {}).length}`);
		log.info(`    - Instruments: ${Object.keys(song.insts || {}).length}`);
		if (song.bpm) log.info(`    - Tempo: ${song.bpm} BPM`);
	}

	return JSON.stringify(outObj, null, 2);
}

function isUnresolvedAst(song: any): boolean {
	if (!song || typeof song !== 'object' || !song.pats || !song.insts || !song.seqs ||
		!Array.isArray(song.channels) || song.channels.length === 0) {
		return false;
	}
	const firstCh = song.channels[0];
	if (typeof firstCh.pat === 'string') return true;
	if (Array.isArray(firstCh.pat) && firstCh.pat.length > 0 && typeof firstCh.pat[0] === 'string') return true;
	return false;
}

/**
 * Export a resolved song model to JSON. Backward-compatible overload: if
 * called with a single string, write a small metadata JSON file.
 */
export async function exportJSON(songOrPath: any, maybePath?: string, opts?: { debug?: boolean; verbose?: boolean }) {
	let song = songOrPath;
	let outPath = maybePath;
	const verbose = opts && opts.verbose === true;

	if (typeof songOrPath === 'string' && !maybePath) {
		// legacy call: exportJSON(filePath)
		const dummy = { exportedAt: new Date().toISOString(), source: songOrPath };
		outPath = songOrPath.endsWith('.json') ? songOrPath : `${songOrPath}.json`;
		const { writeFileSync } = await import('fs');
		writeFileSync(outPath, JSON.stringify(dummy, null, 2), 'utf8');
		if (opts && opts.debug) log.debug('Wrote JSON to', outPath);
		return;
	}

	if (!outPath) outPath = 'song.json';
	else if (!outPath.toLowerCase().endsWith('.json')) outPath = `${outPath}.json`;

	if (verbose) {
		log.info(`Exporting to JSON (ISM format): ${outPath}`);
	}

	// If caller passed an AST (pats + seqs + insts + channels), resolve into ISM
	try {
		if (isUnresolvedAst(song)) {
			song = resolveSong(song);
		}
	} catch (err: any) {
		error('export', 'Validation error: ' + (err && (err as any).message ? (err as any).message : String(err)));
		throw err;
	}

	const json = buildJSON(song, opts);
	const { writeFileSync } = await import('fs');
	writeFileSync(outPath, json, 'utf8');

	if (verbose) {
		const { statSync } = await import('fs');
		const stats = statSync(outPath);
		const sizeKB = (stats.size / 1024).toFixed(2);
		log.info(`Export complete: ${stats.size.toLocaleString()} bytes (${sizeKB} KB) written`);
	}
}
