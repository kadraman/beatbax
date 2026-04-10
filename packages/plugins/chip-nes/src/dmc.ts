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

// ─── DMC decoding ─────────────────────────────────────────────────────────────

/**
 * Decode a raw NES DMC byte stream into a Float32Array.
 * The DMC format uses 1-bit delta encoding: each bit represents ±1 step
 * from the previous DAC level (clamped to 0–127).
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

  if (ref.startsWith('https://') || ref.startsWith('http://')) {
    const res = await fetch(ref);
    if (!res.ok) throw new Error(`NES DMC: failed to fetch '${ref}': HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return decodeDMC(new Uint8Array(buf));
  }

  if (ref.startsWith('local:')) {
    if (isBrowser) {
      throw new Error(`NES DMC: 'local:' sample references are blocked in browser contexts for security. Use '@nes/<name>' or 'https://' instead.`);
    }
    const path = ref.slice(6);
    // Validate for path traversal
    if (path.includes('..')) {
      throw new Error(`NES DMC: path traversal detected in sample reference '${ref}'`);
    }
    // Dynamic import of 'fs' so this module stays browser-safe at parse time
    const { readFileSync } = await import('fs');
    const bytes = readFileSync(path);
    return decodeDMC(new Uint8Array(bytes));
  }

  throw new Error(`NES DMC: unsupported sample reference scheme '${ref}'. Use '@nes/<name>', 'https://', or 'local:'`);
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

  /** Inject pre-loaded sample data (used in tests). */
  _loadSampleSync(data: Float32Array): void {
    this.sampleData = data;
  }

  private _loadSampleAsync(ref: string): void {
    const cached = NESDMCBackend.sampleCache.get(ref);
    if (cached) {
      this.sampleData = cached;
      return;
    }
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

export function createDmcChannel(_audioContext: BaseAudioContext): ChipChannelBackend {
  return new NESDMCBackend();
}
