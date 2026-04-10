/**
 * Bundled NES DMC sample library.
 *
 * Each sample is stored as a base64-encoded raw DMC byte stream.
 * These are synthetic minimal samples for testing and demonstration.
 * Real production samples should be sourced from copyright-free libraries.
 *
 * Supported names (via '@nes/<name>' references):
 *   - kick    — short low-frequency kick drum hit
 *   - snare   — short snare hit
 *   - hihat   — short closed hi-hat
 *   - crash   — crash cymbal
 *   - bass_c2 — short bass note (C2, ~65 Hz)
 */

// Helper: generate a minimal synthetic DMC sample encoded as base64.
// DMC byte stream: each bit = ±2 step from DAC level (starts at 64).
// We use a simple pattern to produce each sample character.

function makeSyntheticDMC(pattern: number[], bytes: number): string {
  // Each number in pattern is a byte (0-255) for the DMC byte stream.
  // Repeat/truncate to `bytes` bytes.
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    arr[i] = pattern[i % pattern.length];
  }
  // Convert to base64
  let binaryStr = '';
  for (let i = 0; i < arr.length; i++) {
    binaryStr += String.fromCharCode(arr[i]);
  }
  return btoa(binaryStr);
}

// These patterns produce simple synthetic audio events:
// - kick: starts high, decays down (alternating 0xFF, 0x00 pattern)
// - snare: mid-range noise (0xAA = 10101010)
// - hihat: high-frequency buzz (0xCC = 11001100)
// - crash: dense noise (0x69 = 01101001)
// - bass_c2: slow triangle-like rising pattern

const KICK_PATTERN   = [0xFF, 0xFE, 0xFC, 0xF8, 0xF0, 0xE0, 0xC0, 0x80, 0x00, 0x00];
const SNARE_PATTERN  = [0xAA, 0x55, 0xA5, 0x5A, 0xAA, 0x55];
const HIHAT_PATTERN  = [0xCC, 0x33, 0xCC, 0x33];
const CRASH_PATTERN  = [0x69, 0x96, 0x66, 0x99, 0x69, 0x96];
const BASS_C2_PATTERN = [0xFF, 0xFF, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00];

/**
 * Bundled sample library.
 * Keys are sample names (without the '@nes/' prefix).
 * Values are base64-encoded DMC byte streams.
 */
export const BUNDLED_SAMPLES: Record<string, string> = {
  kick:    makeSyntheticDMC(KICK_PATTERN, 32),
  snare:   makeSyntheticDMC(SNARE_PATTERN, 24),
  hihat:   makeSyntheticDMC(HIHAT_PATTERN, 16),
  crash:   makeSyntheticDMC(CRASH_PATTERN, 48),
  bass_c2: makeSyntheticDMC(BASS_C2_PATTERN, 64),
};
