/**
 * Integration test for CLI audio export.
 */

import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_OUTPUT_DIR = join(__dirname, '..', '..', '..', 'tmp');
const TEST_WAV_PATH = join(TEST_OUTPUT_DIR, 'cli_test.wav');
const SAMPLE_BAX = join(__dirname, '..', '..', '..', 'songs', 'sample.bax');
const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');

// Ensure tmp directory exists before tests
beforeAll(() => {
  if (!existsSync(TEST_OUTPUT_DIR)) {
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

// Clean up test file after each test
afterEach(() => {
  if (existsSync(TEST_WAV_PATH)) {
    unlinkSync(TEST_WAV_PATH);
  }
});

describe('CLI Audio Export Integration', () => {
  it('should export a valid WAV file from CLI', () => {
    // Run CLI export command
    // We use --duration 0.1 to keep the test fast
    const output = execSync(
      `node "${CLI_PATH}" export wav "${SAMPLE_BAX}" "${TEST_WAV_PATH}" --duration 0.1`,
      { encoding: 'utf-8' },
    );

    // Check output message
    expect(output).toContain('Exported WAV file');

    // Check file exists
    expect(existsSync(TEST_WAV_PATH)).toBe(true);

    // Read and validate WAV header
    const buffer = readFileSync(TEST_WAV_PATH);

    // RIFF header
    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buffer.toString('ascii', 8, 12)).toBe('WAVE');
    expect(buffer.toString('ascii', 12, 16)).toBe('fmt ');

    // Check bit depth (default 16)
    expect(buffer.readUInt16LE(34)).toBe(16);
    
    // Check data chunk
    expect(buffer.toString('ascii', 36, 40)).toBe('data');
    
    // Data size should be > 0
    const dataSize = buffer.readUInt32LE(40);
    expect(dataSize).toBeGreaterThan(0);
  });

  it('should handle custom output path via -o flag', () => {
    const customPath = join(TEST_OUTPUT_DIR, 'custom_output.wav');
    if (existsSync(customPath)) unlinkSync(customPath);

    execSync(
      `node "${CLI_PATH}" export wav "${SAMPLE_BAX}" -o "${customPath}" --duration 0.1`,
      { encoding: 'utf-8' },
    );

    expect(existsSync(customPath)).toBe(true);
    unlinkSync(customPath);
  });
});
