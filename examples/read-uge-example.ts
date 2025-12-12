/**
 * Example usage of the UGE reader
 */

import { readUGEFile, getUGESummary, ugeNoteToString } from '@beatbax/engine';
import { existsSync } from 'fs';
import { join } from 'path';

// Read a UGE file
const filePath = join(process.cwd(), 'songs', 'chavez.uge');

if (!existsSync(filePath)) {
	console.log('chavez.uge not found. Please ensure the file exists in the songs directory.');
	process.exit(1);
}

console.log('Reading UGE file:', filePath);
console.log('');

const song = readUGEFile(filePath);

// Display summary
console.log(getUGESummary(song));
console.log('');

// Show instrument details
console.log('=== Duty Instruments ===');
song.duty_instruments.slice(0, 3).forEach((inst, i) => {
	console.log(`${i}: ${inst.name}`);
	console.log(`   Duty cycle: ${inst.duty_cycle} (${[12.5, 25, 50, 75][inst.duty_cycle]}%)`);
	console.log(`   Volume: ${inst.initial_volume}, Sweep: ${inst.volume_sweep_change}`);
	console.log(`   Length: ${inst.length_enabled ? inst.length : 'unlimited'}`);
	console.log('');
});

// Show first pattern with notes
console.log('=== First Pattern with Notes ===');
for (const pattern of song.patterns) {
	let hasNotes = false;
	const noteRows: string[] = [];
	
	pattern.rows.forEach((cell, i) => {
		if (cell.note !== 90) { // 90 = rest
			hasNotes = true;
			const noteStr = ugeNoteToString(cell.note);
			const instStr = cell.instrument > 0 ? `Inst ${cell.instrument}` : 'No inst';
			noteRows.push(`  Row ${i.toString().padStart(2, '0')}: ${noteStr.padEnd(5)} ${instStr}`);
			
			if (noteRows.length >= 10) return;
		}
	});
	
	if (hasNotes) {
		console.log(`Pattern ${pattern.id}:`);
		noteRows.forEach(row => console.log(row));
		console.log('');
		break;
	}
}

// Show order information
console.log('=== Channel Orders ===');
console.log(`Pulse 1: ${song.orders.pulse1.length} patterns`);
console.log(`  First 10: [${song.orders.pulse1.slice(0, 10).join(', ')}]`);
console.log(`Pulse 2: ${song.orders.pulse2.length} patterns`);
console.log(`  First 10: [${song.orders.pulse2.slice(0, 10).join(', ')}]`);
console.log(`Wave:    ${song.orders.wave.length} patterns`);
console.log(`  First 10: [${song.orders.wave.slice(0, 10).join(', ')}]`);
console.log(`Noise:   ${song.orders.noise.length} patterns`);
console.log(`  First 10: [${song.orders.noise.slice(0, 10).join(', ')}]`);
console.log('');

// Show wavetable information
console.log('=== Wavetables ===');
song.wavetables.slice(0, 3).forEach((wave, i) => {
	const waveHex = Array.from(wave).slice(0, 16).map(n => n.toString(16).toUpperCase()).join(' ');
	console.log(`Wave ${i}: ${waveHex}...`);
});
console.log('');

console.log('✓ Example completed successfully!');
