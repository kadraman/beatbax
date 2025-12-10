#!/usr/bin/env node
/**
 * CLI tool to inspect UGE files
 * Usage: node src/cli-uge-inspect.ts <file.uge>
 */

import { readUGEFile, getUGESummary } from './import/uge/uge.reader';

const args = process.argv.slice(2);

if (args.length === 0) {
	console.log('Usage: node src/cli-uge-inspect.ts <file.uge>');
	console.log('');
	console.log('Inspects a UGE file and displays its contents.');
	process.exit(1);
}

const filePath = args[0];

try {
	console.log(`Reading UGE file: ${filePath}`);
	const song = readUGEFile(filePath);
	
	console.log('');
	console.log(getUGESummary(song));
	console.log('');
	
	// Show pattern details
	if (args.includes('--patterns') || args.includes('-p')) {
		console.log('=== Pattern Details ===');
		song.patterns.slice(0, 5).forEach((pattern) => {
			console.log(`Pattern ${pattern.id}:`);
			
			// Show first few non-empty rows
			let shownRows = 0;
			pattern.rows.forEach((cell, i) => {
				if (shownRows < 10 && (cell.note !== 90 || cell.instrument !== 0)) {
					const noteStr = cell.note === 90 ? '---' : cell.note.toString().padStart(3, ' ');
					const instStr = cell.instrument === 0 ? '--' : cell.instrument.toString().padStart(2, '0');
					const effStr = cell.effectcode === 0 ? '---' : cell.effectcode.toString(16).toUpperCase().padStart(2, '0') + cell.effectparam.toString(16).toUpperCase().padStart(2, '0');
					console.log(`  Row ${i.toString().padStart(2, '0')}: ${noteStr} ${instStr} ${effStr}`);
					shownRows++;
				}
			});
			console.log('');
		});
	}
	
	// Show wavetable details
	if (args.includes('--waves') || args.includes('-w')) {
		console.log('=== Wavetable Details ===');
		song.wavetables.forEach((wave, i) => {
			const waveStr = Array.from(wave).map(n => n.toString(16).toUpperCase()).join(' ');
			console.log(`Wave ${i.toString().padStart(2, '0')}: ${waveStr}`);
		});
		console.log('');
	}
	
	// Show order details
	if (args.includes('--orders') || args.includes('-o')) {
		console.log('=== Order Details ===');
		console.log(`Pulse1: ${song.orders.pulse1.join(', ')}`);
		console.log(`Pulse2: ${song.orders.pulse2.join(', ')}`);
		console.log(`Wave:   ${song.orders.wave.join(', ')}`);
		console.log(`Noise:  ${song.orders.noise.join(', ')}`);
		console.log('');
	}
	
	console.log('✓ File read successfully');
} catch (err) {
	console.error('Error reading UGE file:', err);
	process.exit(1);
}
