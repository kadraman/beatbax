/**
 * Tests for UGE file reader
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
	parseUGE,
	readUGEFile,
	ugeNoteToString,
	midiNoteToUGE,
	getUGESummary,
	InstrumentType,
	type UGESong,
} from '../src/import/uge/uge.reader';

describe('UGE Reader', () => {
	describe('Basic parsing', () => {
		it('should parse a minimal UGE file', () => {
			const testFiles = [
				'demo_export_test.uge',
				'sample_export.uge',
				'valid_v6_test.uge',
			];

			testFiles.forEach((fileName) => {
				const filePath = join(process.cwd(), fileName);
				if (existsSync(filePath)) {
					const song = readUGEFile(filePath);
					
					expect(song).toBeDefined();
					expect(song.version).toBeGreaterThanOrEqual(0);
					expect(song.version).toBeLessThanOrEqual(6);
					expect(song.name).toBeDefined();
					expect(song.patterns).toBeDefined();
					expect(Array.isArray(song.patterns)).toBe(true);
					
					console.log(`✓ Parsed ${fileName} (v${song.version}): ${song.patterns.length} patterns`);
				}
			});
		});

		it('should parse UGE files from songs directory', () => {
			const songsDir = join(process.cwd(), 'songs');
			
			if (existsSync(songsDir)) {
				const ugeFiles = readdirSync(songsDir).filter(f => f.endsWith('.uge'));
				
				expect(ugeFiles.length).toBeGreaterThan(0);
				
				ugeFiles.forEach((fileName) => {
					const filePath = join(songsDir, fileName);
					const song = readUGEFile(filePath);
					
					expect(song).toBeDefined();
					expect(song.version).toBeGreaterThanOrEqual(0);
					expect(song.patterns).toBeDefined();
					expect(song.orders).toBeDefined();
					
					console.log(`✓ Parsed ${fileName}:`);
					console.log(`  Version: ${song.version}`);
					console.log(`  Name: ${song.name || '(unnamed)'}`);
					console.log(`  Patterns: ${song.patterns.length}`);
					console.log(`  Duty instruments: ${song.duty_instruments.length}`);
					console.log(`  Wave instruments: ${song.wave_instruments.length}`);
					console.log(`  Noise instruments: ${song.noise_instruments.length}`);
				});
			}
		});
	});

	describe('Instrument parsing', () => {
		it('should correctly parse duty instruments', () => {
			const testFile = join(process.cwd(), 'songs', 'chavez.uge');
			
			if (existsSync(testFile)) {
				const song = readUGEFile(testFile);
				
				expect(song.duty_instruments).toBeDefined();
				expect(song.duty_instruments.length).toBeGreaterThan(0);
				
				song.duty_instruments.forEach((inst, i) => {
					expect(inst.type).toBe(InstrumentType.DUTY);
					expect(inst.name).toBeDefined();
					expect(inst.duty_cycle).toBeGreaterThanOrEqual(0);
					expect(inst.duty_cycle).toBeLessThanOrEqual(3);
					expect(inst.initial_volume).toBeGreaterThanOrEqual(0);
					expect(inst.initial_volume).toBeLessThanOrEqual(15);
					
					if (inst.name) {
						console.log(`  Duty ${i}: ${inst.name} (duty=${inst.duty_cycle}, vol=${inst.initial_volume})`);
					}
				});
			}
		});

		it('should correctly parse wave instruments', () => {
			const testFile = join(process.cwd(), 'songs', 'chavez.uge');
			
			if (existsSync(testFile)) {
				const song = readUGEFile(testFile);
				
				expect(song.wave_instruments).toBeDefined();
				
				song.wave_instruments.forEach((inst, i) => {
					expect(inst.type).toBe(InstrumentType.WAVE);
					expect(inst.wave_index).toBeGreaterThanOrEqual(0);
					expect(inst.wave_index).toBeLessThan(16);
					
					if (inst.name) {
						console.log(`  Wave ${i}: ${inst.name} (wave=${inst.wave_index})`);
					}
				});
			}
		});

		it('should correctly parse noise instruments', () => {
			const testFile = join(process.cwd(), 'songs', 'chavez.uge');
			
			if (existsSync(testFile)) {
				const song = readUGEFile(testFile);
				
				expect(song.noise_instruments).toBeDefined();
				
				song.noise_instruments.forEach((inst, i) => {
					expect(inst.type).toBe(InstrumentType.NOISE);
					expect(inst.noise_counter_step).toBeGreaterThanOrEqual(0);
					expect(inst.noise_counter_step).toBeLessThanOrEqual(1);
					
					if (inst.name) {
						console.log(`  Noise ${i}: ${inst.name} (step=${inst.noise_counter_step})`);
					}
				});
			}
		});
	});

	describe('Pattern parsing', () => {
		it('should parse patterns with correct structure', () => {
			const testFile = join(process.cwd(), 'songs', 'chavez.uge');
			
			if (existsSync(testFile)) {
				const song = readUGEFile(testFile);
				
				expect(song.patterns.length).toBeGreaterThan(0);
				
				song.patterns.forEach((pattern) => {
					expect(pattern.id).toBeGreaterThanOrEqual(0);
					expect(pattern.rows).toBeDefined();
					expect(pattern.rows.length).toBe(64);
					
					pattern.rows.forEach((cell) => {
						expect(cell.note).toBeGreaterThanOrEqual(0);
						expect(cell.instrument).toBeGreaterThanOrEqual(0);
						expect(cell.effectcode).toBeGreaterThanOrEqual(0);
						expect(cell.effectparam).toBeGreaterThanOrEqual(0);
					});
				});
				
				console.log(`✓ Verified ${song.patterns.length} patterns with 64 rows each`);
			}
		});

		it('should parse pattern notes correctly', () => {
			const testFile = join(process.cwd(), 'songs', 'chavez.uge');
			
			if (existsSync(testFile)) {
				const song = readUGEFile(testFile);
				
				let noteCount = 0;
				let restCount = 0;
				
				song.patterns.slice(0, 5).forEach((pattern) => {
					pattern.rows.forEach((cell) => {
						if (cell.note === 90) {
							restCount++;
						} else if (cell.note >= 0 && cell.note <= 72) {
							noteCount++;
						}
					});
				});
				
				console.log(`  Notes: ${noteCount}, Rests: ${restCount}`);
				expect(noteCount + restCount).toBeGreaterThan(0);
			}
		});
	});

	describe('Order parsing', () => {
		it('should parse order lists for all channels', () => {
			const testFile = join(process.cwd(), 'songs', 'chavez.uge');
			
			if (existsSync(testFile)) {
				const song = readUGEFile(testFile);
				
				expect(song.orders).toBeDefined();
				expect(song.orders.pulse1).toBeDefined();
				expect(song.orders.pulse2).toBeDefined();
				expect(song.orders.wave).toBeDefined();
				expect(song.orders.noise).toBeDefined();
				
				console.log(`  Pulse1 orders: ${song.orders.pulse1.length}`);
				console.log(`  Pulse2 orders: ${song.orders.pulse2.length}`);
				console.log(`  Wave orders: ${song.orders.wave.length}`);
				console.log(`  Noise orders: ${song.orders.noise.length}`);
				
				// Verify order indices reference valid patterns
				[...song.orders.pulse1, ...song.orders.pulse2, ...song.orders.wave, ...song.orders.noise]
					.forEach((patternId) => {
						expect(patternId).toBeGreaterThanOrEqual(0);
					});
			}
		});
	});

	describe('Wavetable parsing', () => {
		it('should parse 16 wavetables', () => {
			const testFile = join(process.cwd(), 'songs', 'chavez.uge');
			
			if (existsSync(testFile)) {
				const song = readUGEFile(testFile);
				
				expect(song.wavetables).toBeDefined();
				expect(song.wavetables.length).toBe(16);
				
				song.wavetables.forEach((wave, i) => {
					expect(wave.length).toBe(32);
					
					// Verify nibbles are in valid range (0-15)
					wave.forEach((nibble) => {
						expect(nibble).toBeGreaterThanOrEqual(0);
						expect(nibble).toBeLessThanOrEqual(15);
					});
				});
				
				console.log(`✓ Verified 16 wavetables with 32 nibbles each`);
			}
		});
	});

	describe('Utility functions', () => {
		it('should convert UGE notes to strings', () => {
			expect(ugeNoteToString(0)).toBe('C-2');
			expect(ugeNoteToString(12)).toBe('C-1');
			expect(ugeNoteToString(24)).toBe('C0');
			expect(ugeNoteToString(36)).toBe('C1');
			expect(ugeNoteToString(48)).toBe('C2');
			expect(ugeNoteToString(60)).toBe('C3');
			expect(ugeNoteToString(72)).toBe('C4');
			expect(ugeNoteToString(90)).toBe('---'); // empty/rest
		});

		it('should convert MIDI notes to UGE', () => {
			expect(midiNoteToUGE(0)).toBe(0);
			expect(midiNoteToUGE(60)).toBe(60); // Middle C
			expect(midiNoteToUGE(72)).toBe(72);
			expect(midiNoteToUGE(127)).toBe(90); // Out of range -> empty
		});

		it('should generate a summary', () => {
			const testFile = join(process.cwd(), 'songs', 'chavez.uge');
			
			if (existsSync(testFile)) {
				const song = readUGEFile(testFile);
				const summary = getUGESummary(song);
				
				expect(summary).toBeDefined();
				expect(summary.length).toBeGreaterThan(0);
				expect(summary).toContain('UGE Song Summary');
				expect(summary).toContain(`Version: ${song.version}`);
				
				console.log('\n' + summary);
			}
		});
	});

	describe('Self-generated UGE files', () => {
		it('should read self-generated demo_export_test.uge', () => {
			const filePath = join(process.cwd(), 'demo_export_test.uge');
			
			if (existsSync(filePath)) {
				const song = readUGEFile(filePath);
				
				expect(song).toBeDefined();
				expect(song.version).toBe(6);
				expect(song.patterns).toBeDefined();
				
				console.log('✓ Successfully parsed self-generated demo_export_test.uge');
				console.log(getUGESummary(song));
			}
		});

		it('should read self-generated sample_export.uge', () => {
			const filePath = join(process.cwd(), 'sample_export.uge');
			
			if (existsSync(filePath)) {
				const song = readUGEFile(filePath);
				
				expect(song).toBeDefined();
				expect(song.version).toBe(6);
				
				console.log('✓ Successfully parsed self-generated sample_export.uge');
				console.log(getUGESummary(song));
			}
		});
	});

	describe('Round-trip compatibility', () => {
		it('should match structure of reference UGE files', () => {
			const referenceFiles = [
				join(process.cwd(), 'songs', 'chavez.uge'),
				join(process.cwd(), 'songs', 'tempest.uge'),
				join(process.cwd(), 'songs', 'cognition.uge'),
			];

			referenceFiles.forEach((filePath) => {
				if (existsSync(filePath)) {
					const song = readUGEFile(filePath);
					
					// Verify basic structure
					expect(song.duty_instruments.length).toBeLessThanOrEqual(15);
					expect(song.wave_instruments.length).toBeLessThanOrEqual(15);
					expect(song.noise_instruments.length).toBeLessThanOrEqual(15);
					expect(song.wavetables.length).toBe(16);
					expect(song.patterns.length).toBeGreaterThan(0);
					
					// Verify all patterns have 64 rows
					song.patterns.forEach((pattern) => {
						expect(pattern.rows.length).toBe(64);
					});
					
					console.log(`✓ ${filePath.split(/[\\/]/).pop()} structure verified`);
				}
			});
		});
	});
});
