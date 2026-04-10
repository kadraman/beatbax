/**
 * NES Triangle channel backend.
 *
 * Key characteristics:
 *   - Fixed 32-step quantised triangle waveform (hardware-exact staircase)
 *   - No hardware volume envelope (always full amplitude when active)
 *   - Software gate: `vol=0` silences the channel; any other value gives full amplitude
 *   - Linear counter: `linear` field (1–127 ticks at 240 Hz) controls note duration
 *   - Frequency formula: f = 1,789,773 / (32 × (period + 1))
 */
import type { ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { NES_MIX_GAIN } from './mixer.js';

/** 32-step quantised triangle waveform (hardware NES values, 0–15 each step). */
const TRIANGLE_WAVE_32: number[] = [
  15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
   0,  1,  2,  3,  4,  5, 6, 7, 8, 9,10,11,12,13,14,15
];

export class NESTriangleBackend implements ChipChannelBackend {
  private active: boolean = false;
  private freq: number = 440;
  private currentInst: InstrumentNode | null = null;
  private phase: number = 0;

  // Linear counter state (in samples)
  private linearCounterSamples: number = Infinity;
  private sampleCount: number = 0;

  reset(): void {
    this.active = false;
    this.freq = 440;
    this.currentInst = null;
    this.phase = 0;
    this.linearCounterSamples = Infinity;
    this.sampleCount = 0;
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    this.freq = frequency;
    this.currentInst = instrument;
    this.active = true;
    this.phase = 0;
    this.sampleCount = 0;

    // Linear counter: `linear` field in ticks at 240 Hz; 0 = no counter (infinite duration)
    const linear = instrument.linear !== undefined ? Number(instrument.linear) : 0;
    if (linear > 0) {
      this.linearCounterSamples = Infinity; // computed in render where sampleRate is known
      // Store the linear value for use in render
      (this as any)._linearTicks = Math.max(1, Math.min(127, linear));
    } else {
      // linear=0 means no linear counter (sustain indefinitely)
      this.linearCounterSamples = Infinity;
      (this as any)._linearTicks = 0;
    }
  }

  noteOff(): void {
    this.active = false;
  }

  applyEnvelope(_frame: number): void {
    // Triangle has no hardware envelope; linear counter is handled in render
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active || !this.currentInst) return;

    // Software gate: vol=0 silences the channel
    if (this.currentInst.vol !== undefined && Number(this.currentInst.vol) === 0) return;

    const freq = this.freq;
    if (freq <= 0) return;

    // Set up linear counter (in samples) on first render for this note
    const linearTicks: number = (this as any)._linearTicks ?? 0;
    if (linearTicks > 0 && this.linearCounterSamples === Infinity) {
      // linear ticks at 240 Hz
      this.linearCounterSamples = Math.floor((linearTicks / 240) * sampleRate);
    }

    // Gain: triangle is always at maximum (half scale to mix with other channels)
    const gain = NES_MIX_GAIN.triangle * 15; // 15 = maximum triangle amplitude

    // Phase increment: 32 steps per cycle
    const phaseInc = (freq * 32) / sampleRate;

    for (let i = 0; i < buffer.length; i++) {
      // Linear counter gate
      if (this.sampleCount >= this.linearCounterSamples) break;

      const step = Math.floor(this.phase) % 32;
      // Centre waveform around 0 (hardware is 0–15, so subtract 7.5)
      buffer[i] += ((TRIANGLE_WAVE_32[step] - 7.5) / 7.5) * gain;
      this.phase = (this.phase + phaseInc);
      if (this.phase >= 32) this.phase -= 32;
      this.sampleCount++;
    }
  }
}

export function createTriangleChannel(_audioContext: BaseAudioContext): ChipChannelBackend {
  return new NESTriangleBackend();
}
