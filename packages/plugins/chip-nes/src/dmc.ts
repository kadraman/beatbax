/**
 * NES DMC (Delta Modulation Channel) backend.
 *
 * The DMC channel plays 1-bit delta-encoded samples (`.dmc` format) at a
 * rate indexed from a 16-entry NTSC table. It does not produce a pitched
 * waveform — `noteOn` triggers sample playback from the beginning.
 *
 * Sample resolution (multi-environment):
 *   - `"@nes/<name>"` — bundled library (always safe; embedded in plugin)
 *   - `"local:<path>"` — file system (CLI/Node.js only; blocked in browser)
 *   - `"https://..."`  — remote fetch (browser + Node.js 18+)
 */
import type { ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { DMC_RATE_TABLE, NES_CLOCK } from './periodTables.js';
import { NES_MIX_GAIN } from './mixer.js';
import { BUNDLED_SAMPLES } from './dmcSamples.js';

// ─── GitHub URL resolution ─────────────────────────────────────────────────────

/**
 * Convert a `github:` shorthand or a `https://github.com/` blob/raw URL to a
 * fetchable `https://raw.githubusercontent.com/` URL.
 *
 * Supported forms:
 *   - `github:owner/repo/path/to/file.dmc`
 *       → `https://raw.githubusercontent.com/owner/repo/main/path/to/file.dmc`
 *   - `https://github.com/owner/repo/blob/branch/path/to/file.dmc`
 *       → `https://raw.githubusercontent.com/owner/repo/branch/path/to/file.dmc`
 *   - `https://github.com/owner/repo/raw/branch/path/to/file.dmc`
 *       → `https://raw.githubusercontent.com/owner/repo/branch/path/to/file.dmc`
 *   - Any other URL is returned unchanged.
 */
export function resolveGitHubUrl(ref: string): string {
  if (ref.startsWith('github:')) {
    // Format: github:owner/repo/path/to/file  (branch defaults to 'main')
    const rest = ref.slice('github:'.length);
    const parts = rest.split('/');
    if (parts.length < 3) {
      throw new Error(`NES DMC: invalid 'github:' reference '${ref}'. Expected 'github:owner/repo/path/to/file'`);
    }
    const owner = parts[0];
    const repo  = parts[1];
    const filePath = parts.slice(2).join('/');
    return `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`;
  }

  if (ref.startsWith('https://github.com/')) {
    // Rewrite blob/raw viewer URLs to raw.githubusercontent.com
    const blobMatch = ref.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(blob|raw)\/([^/]+)\/(.+)$/);
    if (blobMatch) {
      const [, owner, repo, , branch, filePath] = blobMatch;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    }
  }

  return ref; // already a raw or other URL — return unchanged
}

// ─── DMC decoding ─────────────────────────────────────────────────────────────

/**
 * Decode a raw NES DMC byte stream into a Float32Array.
 * The DMC format uses 1-bit delta encoding: each bit adjusts the DAC level
 * by ±2 (clamped to 0–127), matching NES hardware behaviour.
 */
export function decodeDMC(data: Uint8Array): Float32Array {
  const samples: number[] = [];
  let level = 64; // start at mid-scale

  for (let byte = 0; byte < data.length; byte++) {
    for (let bit = 0; bit < 8; bit++) {
      const delta = (data[byte] >> bit) & 1;
      if (delta) {
        if (level <= 125) level += 2;
      } else {
        if (level >= 2) level -= 2;
      }
      samples.push(level);
    }
  }

  // Normalise to [-1, 1]
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = (samples[i] - 64) / 64;
  }
  return out;
}

/**
 * Resolve a DMC sample reference to the raw NES DMC byte stream (no decoding).
 *
 * This is the correct format for `ChipPlugin.resolveSampleAsset()` — the engine
 * receives raw asset bytes and passes them to the backend for decoding.
 */
export async function resolveRawDMCSample(ref: string): Promise<ArrayBuffer> {
  if (ref.startsWith('@nes/')) {
    const name = ref.slice(5);
    const b64 = BUNDLED_SAMPLES[name];
    if (!b64) {
      throw new Error(`NES DMC: bundled sample '@nes/${name}' not found. Available: ${Object.keys(BUNDLED_SAMPLES).join(', ')}`);
    }
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    return bytes.buffer;
  }

  if (ref.startsWith('github:') || ref.startsWith('https://')) {
    const url = resolveGitHubUrl(ref);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NES DMC: failed to fetch '${ref}' (resolved: ${url}): HTTP ${res.status}`);
    return res.arrayBuffer();
  }

  if (ref.startsWith('local:')) {
    if (isBrowser) {
      throw new Error(`NES DMC: 'local:' sample references are blocked in browser contexts for security. Use '@nes/<name>', 'https://', or 'github:' instead.`);
    }
    const path = ref.slice(6);
    // Normalise separators then check for '..' as a path segment (not as part of
    // a filename like 'file..dmc'). Mirrors the check in importResolver.ts.
    const normalized = path.replace(/\\/g, '/');
    if (/(^|\/)\.\.($|\/)/.test(normalized)) {
      throw new Error(`NES DMC: path traversal detected in sample reference '${ref}'`);
    }
    const { readFileSync } = await import('fs');
    const bytes = readFileSync(path);
    return new Uint8Array(bytes).buffer;
  }

  throw new Error(`NES DMC: unsupported sample reference scheme '${ref}'. Use '@nes/<name>', 'https://', 'github:', or 'local:'`);
}

// ─── Sample resolver ──────────────────────────────────────────────────────────

const isBrowser = typeof window !== 'undefined';

/**
 * Resolve a DMC sample reference to decoded Float32Array.
 *
 * Supports:
 *   - `"@nes/<name>"` — bundled sample library
 *   - `"https://..."`  — remote fetch
 *   - `"local:<path>"` — file system (Node.js only; throws in browser)
 */
export async function resolveDMCSample(ref: string): Promise<Float32Array> {
  if (ref.startsWith('@nes/')) {
    const name = ref.slice(5);
    const b64 = BUNDLED_SAMPLES[name];
    if (!b64) {
      throw new Error(`NES DMC: bundled sample '@nes/${name}' not found. Available: ${Object.keys(BUNDLED_SAMPLES).join(', ')}`);
    }
    // Decode base64 → Uint8Array → DMC
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    return decodeDMC(bytes);
  }

  if (ref.startsWith('github:') || ref.startsWith('https://') || ref.startsWith('http://')) {
    const url = resolveGitHubUrl(ref);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NES DMC: failed to fetch '${ref}' (resolved: ${url}): HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return decodeDMC(new Uint8Array(buf));
  }

  if (ref.startsWith('local:')) {
    if (isBrowser) {
      throw new Error(`NES DMC: 'local:' sample references are blocked in browser contexts for security. Use '@nes/<name>', 'https://', or 'github:' instead.`);
    }
    const path = ref.slice(6);
    // Normalise separators then check for '..' as a path segment (not as part of
    // a filename like 'file..dmc'). Mirrors the check in importResolver.ts.
    const normalized = path.replace(/\\/g, '/');
    if (/(^|\/)\.\.($|\/)/.test(normalized)) {
      throw new Error(`NES DMC: path traversal detected in sample reference '${ref}'`);
    }
    // Dynamic import of 'fs' so this module stays browser-safe at parse time
    const { readFileSync } = await import('fs');
    const bytes = readFileSync(path);
    return decodeDMC(new Uint8Array(bytes));
  }

  throw new Error(`NES DMC: unsupported sample reference scheme '${ref}'. Use '@nes/<name>', 'https://', 'github:', or 'local:'`);
}

// ─── DMC backend ──────────────────────────────────────────────────────────────

export class NESDMCBackend implements ChipChannelBackend {
  private active: boolean = false;
  private currentInst: InstrumentNode | null = null;
  private sampleData: Float32Array | null = null;
  private samplePos: number = 0;
  private rateHz: number = DMC_RATE_TABLE[7]; // default ~525 Hz
  private loop: boolean = false;
  private phase: number = 0;

  // Cache loaded samples by reference to avoid redundant I/O
  private static sampleCache = new Map<string, Float32Array>();

  /** Insert a decoded sample into the shared cache (used by preloading). */
  static setCached(ref: string, data: Float32Array): void {
    NESDMCBackend.sampleCache.set(ref, data);
  }

  /** Check whether a ref is already in the shared cache. */
  static hasCached(ref: string): boolean {
    return NESDMCBackend.sampleCache.has(ref);
  }

  reset(): void {
    this.active = false;
    this.currentInst = null;
    this.sampleData = null;
    this.samplePos = 0;
    this.phase = 0;
  }

  noteOn(_frequency: number, instrument: InstrumentNode): void {
    this.currentInst = instrument;
    this.active = true;
    this.samplePos = 0;
    this.phase = 0;

    // Playback rate
    const rateIdx = Math.max(0, Math.min(15, Number(instrument.dmc_rate ?? 7)));
    this.rateHz = DMC_RATE_TABLE[rateIdx];

    // Loop flag
    this.loop = instrument.dmc_loop === true || instrument.dmc_loop === 'true';

    // Load sample asynchronously if needed (for real playback contexts).
    // In tests, inject `sampleData` directly via `_loadSampleSync`.
    const sampleRef = instrument.dmc_sample;
    if (typeof sampleRef === 'string') {
      this._loadSampleAsync(sampleRef);
    }
  }

  noteOff(): void {
    this.active = false;
  }

  applyEnvelope(_frame: number): void {
    // DMC has no amplitude envelope
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active || !this.sampleData) return;

    const data = this.sampleData;
    const phaseInc = this.rateHz / sampleRate;
    const gain = NES_MIX_GAIN.dmc * 127; // 127 = max DMC amplitude

    for (let i = 0; i < buffer.length; i++) {
      if (this.samplePos >= data.length) {
        if (this.loop) {
          this.samplePos = 0;
        } else {
          break;
        }
      }
      buffer[i] += data[Math.floor(this.samplePos)] * gain;
      this.phase += phaseInc;
      const steps = Math.floor(this.phase);
      if (steps > 0) {
        this.samplePos += steps;
        this.phase -= steps;
      }
    }
  }

  /** Inject pre-loaded sample data (used in tests to avoid async loading). */
  loadSampleForTest(data: Float32Array): void {
    this.sampleData = data;
  }

  // ── Web Audio path ──────────────────────────────────────────────────────────

  /**
   * Create Web Audio nodes for browser playback.
   * Returns [BufferSourceNode, GainNode] with the decoded DMC sample upsampled
   * to ctx.sampleRate. Sample is sourced synchronously from the cache/bundled
   * library so it plays immediately on the first trigger.
   */
  createPlaybackNodes(
    ctx: BaseAudioContext,
    _freq: number,
    start: number,
    dur: number,
    inst: InstrumentNode,
    _scheduler: any,
    destination: AudioNode
  ): AudioNode[] | null {
    if (typeof (ctx as any).createBuffer !== 'function') return null;

    const rateIdx = Math.max(0, Math.min(15, Number(inst.dmc_rate ?? 7)));
    const dmcHz = DMC_RATE_TABLE[rateIdx];
    const loopSample = inst.dmc_loop === true || inst.dmc_loop === 'true';

    // Get sample data synchronously: check cache first, then decode bundled sample
    const sampleRef = inst.dmc_sample;
    let sampleData: Float32Array | null = this.sampleData;
    if (!sampleData && typeof sampleRef === 'string') {
      const cached = NESDMCBackend.sampleCache.get(sampleRef);
      if (cached) {
        sampleData = cached;
      } else if (sampleRef.startsWith('@nes/')) {
        sampleData = decodeDMCSampleSync(sampleRef) ?? null;
        if (sampleData) NESDMCBackend.sampleCache.set(sampleRef, sampleData);
      }
    }
    if (!sampleData) return null;

    const sampleRate = ctx.sampleRate;
    // Upsample DMC sample from dmcHz to ctx.sampleRate.
    // Use the natural sample duration (not the note step duration) so the
    // sample rings out fully — DMC samples play to completion on hardware.
    const phaseInc = dmcHz / sampleRate;
    const gain = NES_MIX_GAIN.dmc * 127;
    const naturalDurSec = loopSample ? (dur + 0.1) : (sampleData.length / dmcHz + 0.05);
    const playDur = loopSample ? naturalDurSec : Math.max(dur, naturalDurSec);
    const maxSamples = Math.ceil(playDur * sampleRate);
    const abuf = (ctx as any).createBuffer(1, maxSamples, sampleRate);
    const data = abuf.getChannelData(0);
    let pos = 0;
    let phase = 0;
    const srcLen = sampleData.length;
    for (let i = 0; i < maxSamples; i++) {
      const srcIdx = Math.floor(pos);
      if (srcIdx >= srcLen) {
        if (loopSample) { pos = 0; phase = 0; } else break;
      }
      data[i] = (sampleData[Math.min(srcIdx, srcLen - 1)] ?? 0) * gain;
      phase += phaseInc;
      const steps = Math.floor(phase);
      if (steps > 0) { pos += steps; phase -= steps; }
    }

    const source = (ctx as any).createBufferSource();
    source.buffer = abuf;

    const gainNode = (ctx as any).createGain();
    gainNode.gain.value = 1;

    source.connect(gainNode);
    gainNode.connect(destination || (ctx as any).destination);

    try { source.start(start); } catch (e) { try { source.start(); } catch (_) {} }
    // Let the AudioBufferSource stop itself when the buffer ends (natural sample end).
    // Only set an explicit stop for very long looped samples.
    if (loopSample) {
      try { source.stop(start + playDur); } catch (_) {}
    }

    return [source, gainNode];
  }

  private _loadSampleAsync(ref: string): void {
    const cached = NESDMCBackend.sampleCache.get(ref);
    if (cached) {
      this.sampleData = cached;
      return;
    }
    // Synchronous path for bundled @nes/ samples — avoids an async gap that
    // would leave sampleData null when the PCM renderer calls render() immediately
    // after noteOn() in the same tick.
    if (ref.startsWith('@nes/')) {
      const data = decodeDMCSampleSync(ref);
      if (data) {
        NESDMCBackend.sampleCache.set(ref, data);
        this.sampleData = data;
        return;
      }
    }
    // Async path for remote (https://) and local: refs
    resolveDMCSample(ref)
      .then(data => {
        NESDMCBackend.sampleCache.set(ref, data);
        this.sampleData = data;
      })
      .catch(err => {
        // Non-fatal: channel will be silent if sample fails to load
        console.warn(`NES DMC: failed to load sample '${ref}':`, err.message);
      });
  }
}

// ─── Synchronous bundled sample decoder ──────────────────────────────────────

/**
 * Decode a bundled `@nes/<name>` sample reference synchronously.
 * Returns null if the reference is not a bundled sample or decoding fails.
 */
function decodeDMCSampleSync(ref: string): Float32Array | undefined {
  if (!ref.startsWith('@nes/')) return undefined;
  const name = ref.slice(5);
  const b64 = BUNDLED_SAMPLES[name];
  if (!b64) return undefined;
  try {
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    return decodeDMC(bytes);
  } catch (_) {
    return undefined;
  }
}

export function createDmcChannel(_audioContext: BaseAudioContext): ChipChannelBackend {
  return new NESDMCBackend();
}

/**
 * Pre-populate the static DMC sample cache with all sample references found
 * in the given instrument map. This is called by the `preloadForPCM` plugin
 * hook so that the synchronous PCM renderer has data available from the first
 * `noteOn` + `render()` call, avoiding silent notes caused by the async gap.
 */
export async function preloadDMCSamples(refs: Iterable<string>): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const ref of refs) {
    if (NESDMCBackend.hasCached(ref)) continue; // already loaded
    promises.push(
      resolveDMCSample(ref)
        .then(data => { NESDMCBackend.setCached(ref, data); })
        .catch(err => {
          console.warn(`NES DMC preload: failed to load '${ref}':`, err.message);
        })
    );
  }
  await Promise.all(promises);
}
