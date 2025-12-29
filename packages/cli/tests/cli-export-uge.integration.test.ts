/**
 * Integration test for CLI UGE export.
 * Tests the full workflow: parse .bax -> resolve -> export UGE -> validate with uge2source.exe
 */

import { describe, it, expect } from '@jest/globals';
import { execSync } from 'child_process';
import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_OUTPUT_DIR = join(__dirname, '..', '..', '..', 'tmp');
const TEST_UGE_PATH = join(TEST_OUTPUT_DIR, 'cli_test.uge');
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
  if (existsSync(TEST_UGE_PATH)) {
    unlinkSync(TEST_UGE_PATH);
  }
});

describe.skip('CLI UGE Export Integration', () => {
  it('should export a valid UGE file from CLI', () => {
    // Run CLI export command
    const output = execSync(
      `node "${CLI_PATH}" export uge "${SAMPLE_BAX}" "${TEST_UGE_PATH}"`,
      { encoding: 'utf-8' },
    );

    // Check output message
    expect(output).toContain('Exported UGE file');

    // Check file exists
    expect(existsSync(TEST_UGE_PATH)).toBe(true);

    // Read and validate file
    const buffer = readFileSync(TEST_UGE_PATH);

    // Check version
    const version = buffer.readUInt32LE(0);
    expect(version).toBe(6);

    // Check file size is reasonable (should be around 60-70KB for a full song)
    expect(buffer.length).toBeGreaterThan(60000);
    expect(buffer.length).toBeLessThan(80000);
  });

  it('should produce a file that can be processed by uge2source.exe', () => {
    // Skip this test if uge2source.exe is not available
    const UGE2SOURCE_PATH = 'C:\\Tools\\hUGETracker-1.0.11\\uge2source.exe';
    if (!existsSync(UGE2SOURCE_PATH)) {
      console.log('Skipping uge2source.exe test - tool not found');
      return;
    }

    // Export UGE file
    execSync(
      `node "${CLI_PATH}" export uge "${SAMPLE_BAX}" "${TEST_UGE_PATH}"`,
      { encoding: 'utf-8' },
    );

    // Run uge2source.exe
    const testCPath = join(TEST_OUTPUT_DIR, 'cli_test_output.c');
    try {
      execSync(
        `"${UGE2SOURCE_PATH}" "${TEST_UGE_PATH}" test_song "${testCPath}"`,
        { encoding: 'utf-8' },
      );

      // Check that C file was created
      expect(existsSync(testCPath)).toBe(true);

      // Clean up C file
      if (existsSync(testCPath)) {
        unlinkSync(testCPath);
      }
    } catch (err: any) {
      throw new Error(`uge2source.exe failed: ${err.message}`);
    }
  });

  it('should handle output path without .uge extension', () => {
    const outputPathWithoutExt = join(TEST_OUTPUT_DIR, 'cli_test_no_ext');

    execSync(
      `node "${CLI_PATH}" export uge "${SAMPLE_BAX}" "${outputPathWithoutExt}"`,
      { encoding: 'utf-8' },
    );

    // Should create file with .uge extension added or without it
    // Check both possibilities
    const fileExists = existsSync(outputPathWithoutExt) || existsSync(outputPathWithoutExt + '.uge');
    expect(fileExists).toBe(true);

    // Clean up
    if (existsSync(outputPathWithoutExt)) {
      unlinkSync(outputPathWithoutExt);
    }
    if (existsSync(outputPathWithoutExt + '.uge')) {
      unlinkSync(outputPathWithoutExt + '.uge');
    }
  });
});
