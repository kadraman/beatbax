/**
 * Minimal MIDI export placeholder.
 * Real implementation will convert song model to MIDI tracks.
 */
import { writeFileSync } from 'fs';

/**
 * Export a resolved song model to MIDI. Backward-compatible: if called
 * with a single string it writes a placeholder file.
 */
export async function exportMIDI(songOrPath: any, maybePath?: string) {
	let out = maybePath;
	if (typeof songOrPath === 'string' && !maybePath) {
		out = songOrPath.endsWith('.mid') ? songOrPath : `${songOrPath}.mid`;
		writeFileSync(out, 'MThd', 'utf8');
		console.log('Wrote MIDI placeholder to', out);
		return;
	}

	if (!out) out = 'song.mid';
	// TODO: serialize `songOrPath` into real MIDI. For now write a placeholder header.
	writeFileSync(out, 'MThd', 'utf8');
	console.log('Wrote MIDI (placeholder) to', out);
}
