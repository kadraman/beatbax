/**
 * Plugin interface types for BeatBax chip backends.
 *
 * Third-party chip plugins implement `ChipPlugin` and expose individual
 * channel audio backends through `ChipChannelBackend`. The Game Boy chip
 * is built-in; all other chips are loaded via the plugin system.
 */
import { InstrumentNode } from '../parser/ast.js';
import { SongModel } from '../song/songModel.js';

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

// ─── Channel backend ─────────────────────────────────────────────────────────

/**
 * A single audio channel backend produced by a chip plugin.
 * Each channel maps to one hardware voice (e.g. Pulse 1, Triangle, Noise).
 */
export interface ChipChannelBackend {
  /** Reset channel state (called on song stop/restart). */
  reset(): void;

  /** Trigger a note-on event for this channel. */
  noteOn(frequency: number, instrument: InstrumentNode): void;

  /** Trigger a note-off event (release). */
  noteOff(): void;

  /**
   * Advance per-frame envelope/sweep automation.
   * @param frame - Frame counter (incremented each audio frame).
   */
  applyEnvelope(frame: number): void;

  /**
   * Render audio samples into `buffer`.
   * Implementations should ADD their output to the existing buffer contents
   * rather than replacing them, so multiple channels can be mixed.
   * @param buffer - Output sample buffer (mono Float32Array).
   * @param sampleRate - Audio context sample rate in Hz.
   */
  render(buffer: Float32Array, sampleRate: number): void;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

/**
 * A BeatBax chip plugin.
 *
 * Plugins are plain JavaScript/TypeScript modules with a default export that
 * implements this interface. They are registered with the `ChipRegistry` either
 * at startup (built-ins) or dynamically via `engine.registerChipPlugin()`.
 *
 * @example
 * ```typescript
 * import nesPlugin from '@beatbax/plugin-chip-nes';
 * engine.registerChipPlugin(nesPlugin);
 * ```
 */
export interface ChipPlugin {
  /** Chip identifier used in the `chip` directive (e.g. `'gameboy'`, `'nes'`). */
  name: string;

  /** Semver version string (e.g. `'1.0.0'`). */
  version: string;

  /** Number of audio channels this chip exposes. */
  channels: number;

  /**
   * Validate a parsed instrument definition for this chip.
   * Return an empty array when the instrument is valid.
   */
  validateInstrument(inst: InstrumentNode): ValidationError[];

  /**
   * Create a channel backend instance for the given channel index.
   * @param channelIndex - Zero-based channel index (0 = first channel).
   * @param audioContext - The WebAudio context to create nodes on (may be a
   *   mock/offline context in tests).
   */
  createChannel(channelIndex: number, audioContext: BaseAudioContext): ChipChannelBackend;

  /**
   * Optionally resolve a named sample asset to raw bytes.
   * Required by chips that support sampled audio (e.g. NES DMC).
   * Follows the same multi-environment conventions as BeatBax imports:
   *   - `"@<chip>/<name>"` — bundled library (always available)
   *   - `"local:<path>"`   — file-system (CLI/Node.js only)
   *   - `"https://..."`    — remote fetch (browser + Node.js 18+)
   */
  resolveSampleAsset?(ref: string): Promise<ArrayBuffer>;

  /**
   * Optional built-in named sample library (for `@<chip>/<name>` references).
   * Keys are sample names; values are base64-encoded binary content.
   */
  bundledSamples?: Record<string, string>;

  /**
   * Optional conversion of an instrument to the chip's native format.
   * Used for native format export (e.g. NSF, FTM).
   */
  instrumentToNative?(inst: InstrumentNode): unknown;

  /**
   * Optional native format export (e.g. NSF for NES, FMS for FamiStudio).
   * @param song - Fully-resolved song model.
   * @param format - Target format name (plugin-defined, e.g. `'nsf'`).
   */
  exportToNative?(song: SongModel, format?: string): Uint8Array;
}
