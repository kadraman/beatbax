/**
 * Integration test for CLI JSON and MIDI export.
 */

import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import { unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_OUTPUT_DIR = join(__dirname, '..', '..', '..', 'tmp');
const TEST_JSON_PATH = join(TEST_OUTPUT_DIR, 'cli_test.json');
const TEST_MIDI_PATH = join(TEST_OUTPUT_DIR, 'cli_test.mid');
const SAMPLE_BAX = join(__dirname, '..', '..', '..', 'songs', 'sample.bax');
const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');

// Ensure tmp directory exists before tests
beforeAll(() => {
  if (!existsSync(TEST_OUTPUT_DIR)) {
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

// Clean up test files after each test
afterEach(() => {
  if (existsSync(TEST_JSON_PATH)) unlinkSync(TEST_JSON_PATH);
  if (existsSync(TEST_MIDI_PATH)) unlinkSync(TEST_MIDI_PATH);
});

describe('CLI Other Export Integration', () => {
  it('should export a valid JSON file from CLI with success message', () => {
    const output = execSync(
      `node "${CLI_PATH}" export json "${SAMPLE_BAX}" "${TEST_JSON_PATH}"`,
      { encoding: 'utf-8' },
    );

    expect(output).toContain('[OK] Exported JSON file');
    expect(output).toContain(TEST_JSON_PATH);
    expect(existsSync(TEST_JSON_PATH)).toBe(true);
  });

  it('should export a valid MIDI file from CLI with success message', () => {
    const output = execSync(
      `node "${CLI_PATH}" export midi "${SAMPLE_BAX}" "${TEST_MIDI_PATH}" --duration 0.1`,
      { encoding: 'utf-8' },
    );

    expect(output).toContain('[OK] Exported MIDI file');
    expect(output).toContain(TEST_MIDI_PATH);
    expect(existsSync(TEST_MIDI_PATH)).toBe(true);
  });
});
