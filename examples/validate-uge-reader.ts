/**
 * Validation test: Read a self-generated UGE file and verify structure
 */

import { readUGEFile } from '@beatbax/engine';
import { existsSync } from 'fs';

console.log('=== UGE Reader Validation Test ===\n');

const testFiles = [
	{ path: 'demo_export_test.uge', expectedVersion: 6 },
	{ path: 'sample_export.uge', expectedVersion: 6 },
	{ path: 'songs/chavez.uge', expectedVersion: 5 },
	{ path: 'songs/tempest.uge', expectedVersion: 6 },
	{ path: 'songs/cognition.uge', expectedVersion: 1 },
];

let passed = 0;
let failed = 0;

testFiles.forEach(({ path, expectedVersion }) => {
	if (!existsSync(path)) {
		console.log(`⚠️  SKIP: ${path} (file not found)`);
		return;
	}

	try {
		const song = readUGEFile(path);
		
		// Basic validations
		const checks = [
			{ name: 'Version matches', pass: song.version === expectedVersion },
			{ name: 'Has duty instruments', pass: song.duty_instruments.length > 0 },
			{ name: 'Has wave instruments', pass: song.wave_instruments.length > 0 },
			{ name: 'Has noise instruments', pass: song.noise_instruments.length > 0 },
			{ name: 'Has 16 wavetables', pass: song.wavetables.length === 16 },
			{ name: 'Wavetables have 32 nibbles', pass: song.wavetables.every(w => w.length === 32) },
			{ name: 'Has patterns', pass: song.patterns.length > 0 },
			{ name: 'Patterns have 64 rows', pass: song.patterns.every(p => p.rows.length === 64) },
			{ name: 'Has orders', pass: song.orders.pulse1 !== undefined },
			{ name: 'Ticks per row defined', pass: song.ticks_per_row >= 0 }, // 0 is valid (though unusual)
		];

		const allPassed = checks.every(c => c.pass);
		
		if (allPassed) {
			console.log(`✅ PASS: ${path} (v${song.version})`);
			console.log(`   ${song.patterns.length} patterns, ${song.duty_instruments.length}/${song.wave_instruments.length}/${song.noise_instruments.length} instruments`);
			passed++;
		} else {
			console.log(`❌ FAIL: ${path}`);
			checks.filter(c => !c.pass).forEach(c => {
				console.log(`   - ${c.name} failed`);
			});
			failed++;
		}
	} catch (err) {
		console.log(`❌ ERROR: ${path}`);
		console.log(`   ${err}`);
		failed++;
	}
	console.log('');
});

console.log('=== Summary ===');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log('');

if (failed === 0) {
	console.log('🎉 All validations passed!');
	process.exit(0);
} else {
	console.log('⚠️  Some validations failed');
	process.exit(1);
}
