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
   * Update the channel frequency without resetting envelope or phase state.
   * Used by the arpeggio effect on PCM-based backends (e.g. NES plugin) to
   * cycle through chord tones at the chip frame rate without re-triggering
   * the amplitude envelope on each step.
   *
   * Optional — backends that do not support mid-note frequency changes may
   * omit this method; the engine will fall back to `noteOn` if absent.
   */
  setFrequency?(frequency: number): void;

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

  /**
   * Create Web Audio nodes for real-time browser playback of a single note.
   *
   * When present, the engine uses these nodes instead of the PCM `render()` path.
   * This allows the full effects system (arp, vib, portamento, retrigger, echo,
   * etc.) to work via `AudioParam` automation — exactly as it does for the
   * built-in Game Boy channels.
   *
   * Implementations should:
   *   1. Create an `OscillatorNode` (or `AudioBufferSourceNode` for samples).
   *   2. Create a `GainNode` and schedule the instrument's amplitude envelope.
   *   3. Connect: oscillator → gain → `destination`.
   *   4. Call `oscillator.start(start)` and `oscillator.stop(start + dur + 0.02)`.
   *   5. Store the base frequency as `(osc as any)._baseFreq` so the arp effect
   *      can read it before automating `osc.frequency`.
   *   6. Return `[oscillatorNode, gainNode]` so the engine can apply effects.
   *
   * Optional — backends that omit this method fall back to PCM rendering.
   * Percussion and sample channels (noise, DMC) typically omit it; melodic
   * channels (pulse, triangle) implement it to gain full effect support.
   *
   * @param ctx      - The current BaseAudioContext.
   * @param freq     - Note frequency in Hz.
   * @param start    - Absolute AudioContext time when the note begins.
   * @param dur      - Note duration in seconds.
   * @param inst     - The resolved instrument node.
   * @param scheduler - The engine tick scheduler (for aligned scheduling).
   * @param destination - AudioNode to connect the gain output to.
   * @returns `[oscillatorNode, gainNode]`, or `null` to fall back to PCM.
   */
  createPlaybackNodes?(
    ctx: BaseAudioContext,
    freq: number,
    start: number,
    dur: number,
    inst: InstrumentNode,
    scheduler: any,
    destination: AudioNode
  ): AudioNode[] | null;
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
