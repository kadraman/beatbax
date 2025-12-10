/**
 * Tests for UGE v6 binary export.
 * Validates that exported files match the UGE v6 format specification.
 */

import { describe, it, expect } from '@jest/globals';
import { exportUGE } from '../src/export/ugeWriter';
import { SongModel } from '../src/song/songModel';
import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_OUTPUT_DIR = join(__dirname, '..', 'tmp');
const TEST_UGE_PATH = join(TEST_OUTPUT_DIR, 'test_export.uge');

// Ensure tmp directory exists before tests
beforeAll(() => {
	if (!existsSync(TEST_OUTPUT_DIR)) {
		mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
	}
});

// Clean up test file after each test
afterEach(() => {
	if (existsSync(TEST_UGE_PATH)) {
		unlinkSync(TEST_UGE_PATH);
	}
});

describe('UGE v6 Export', () => {
	it('should export a minimal empty song', async () => {
		const song: SongModel = {
			pats: {},
			insts: {},
			seqs: {},
			channels: [],
		};

		await exportUGE(song, TEST_UGE_PATH);

		expect(existsSync(TEST_UGE_PATH)).toBe(true);
		const buffer = readFileSync(TEST_UGE_PATH);

		// Check file size (should be around 64KB for minimal file with all instruments)
		expect(buffer.length).toBeGreaterThan(60000);
		expect(buffer.length).toBeLessThan(70000);

		// Check version (first 4 bytes should be 6)
		const version = buffer.readUInt32LE(0);
		expect(version).toBe(6);
	});

	it('should export a song with a single note', async () => {
		const song: SongModel = {
			pats: {},
			insts: {
				lead: {
					type: 'pulse1',
					duty: '50',
					env: '12,down',
				},
			},
			seqs: {},
			channels: [
				{
					id: 1,
					events: [
						{ type: 'note', token: 'C4', instrument: 'lead' },
					],
					defaultInstrument: 'lead',
				},
			],
		};

		await exportUGE(song, TEST_UGE_PATH);

		expect(existsSync(TEST_UGE_PATH)).toBe(true);
		const buffer = readFileSync(TEST_UGE_PATH);

		// Validate version
		const version = buffer.readUInt32LE(0);
		expect(version).toBe(6);

		// File should be valid UGE format
		expect(buffer.length).toBeGreaterThan(60000);
	});

	it('should export a song with multiple channels', async () => {
		const song: SongModel = {
			pats: {},
			insts: {
				lead: { type: 'pulse1', duty: '50' },
				bass: { type: 'pulse2', duty: '25' },
				wave1: { type: 'wave' },
				kick: { type: 'noise' },
			},
			seqs: {},
			channels: [
				{
					id: 1,
					events: [
						{ type: 'note', token: 'C4' },
						{ type: 'note', token: 'E4' },
						{ type: 'note', token: 'G4' },
					],
				},
				{
					id: 2,
					events: [
						{ type: 'note', token: 'C3' },
						{ type: 'rest' },
						{ type: 'note', token: 'G2' },
					],
				},
				{
					id: 3,
					events: [
						{ type: 'note', token: 'C5' },
					],
				},
				{
					id: 4,
					events: [
						{ type: 'named', token: 'kick' },
						{ type: 'rest' },
						{ type: 'named', token: 'kick' },
					],
				},
			],
		};

		await exportUGE(song, TEST_UGE_PATH);

		expect(existsSync(TEST_UGE_PATH)).toBe(true);
		const buffer = readFileSync(TEST_UGE_PATH);

		// Validate version
		const version = buffer.readUInt32LE(0);
		expect(version).toBe(6);

		// Should have valid file size
		expect(buffer.length).toBeGreaterThan(60000);
	});

	it('should handle rest events correctly', async () => {
		const song: SongModel = {
			pats: {},
			insts: {},
			seqs: {},
			channels: [
				{
					id: 1,
					events: [
						{ type: 'note', token: 'C4' },
						{ type: 'rest' },
						{ type: 'rest' },
						{ type: 'note', token: 'E4' },
					],
				},
			],
		};

		await exportUGE(song, TEST_UGE_PATH);

		expect(existsSync(TEST_UGE_PATH)).toBe(true);
		const buffer = readFileSync(TEST_UGE_PATH);

		expect(buffer.readUInt32LE(0)).toBe(6);
	});

	it('should handle notes with octaves correctly', async () => {
		const song: SongModel = {
			pats: {},
			insts: {},
			seqs: {},
			channels: [
				{
					id: 1,
					events: [
						{ type: 'note', token: 'C3' },
						{ type: 'note', token: 'C4' },
						{ type: 'note', token: 'C5' },
						{ type: 'note', token: 'C6' },
					],
				},
			],
		};

		await exportUGE(song, TEST_UGE_PATH);

		expect(existsSync(TEST_UGE_PATH)).toBe(true);
		const buffer = readFileSync(TEST_UGE_PATH);

		expect(buffer.readUInt32LE(0)).toBe(6);
	});

	it('should handle sharps and flats in note names', async () => {
		const song: SongModel = {
			pats: {},
			insts: {},
			seqs: {},
			channels: [
				{
					id: 1,
					events: [
						{ type: 'note', token: 'C#4' },
						{ type: 'note', token: 'D#4' },
						{ type: 'note', token: 'F#4' },
						{ type: 'note', token: 'G#4' },
						{ type: 'note', token: 'A#4' },
					],
				},
			],
		};

		await exportUGE(song, TEST_UGE_PATH);

		expect(existsSync(TEST_UGE_PATH)).toBe(true);
		const buffer = readFileSync(TEST_UGE_PATH);

		expect(buffer.readUInt32LE(0)).toBe(6);
	});
});
