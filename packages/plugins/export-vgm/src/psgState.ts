/**
 * SN76489 PSG shadow register state tracker.
 *
 * Maintains a mirror of the current PSG register values to avoid redundant
 * writes. A write is only emitted when the new value differs from the shadow.
 *
 * On song start all registers are unconditionally emitted (via flush()) to
 * establish a known hardware state, since some VGM players start from an
 * undefined register state.
 */

import {
  PSG_CHANNELS,
  toneLatchByte,
  toneDataByte,
  volumeLatchByte,
  noiseControlByte,
} from './constants.js';

/** Sentinel: uninitialized period (forces write on first use) */
const UNINIT_PERIOD = -1;
/** Sentinel: uninitialized attenuation (forces write on first use) */
const UNINIT_VOLUME = -1;
/** Sentinel: uninitialized noise control (forces write on first use) */
const UNINIT_NOISE = -1;
/** Sentinel: uninitialized GG stereo (forces write on first use) */
const UNINIT_STEREO = -2;

/** Default GG stereo value: all channels output on both sides */
export const GG_STEREO_DEFAULT = 0xFF;

/** Muted attenuation (15 = mute on SN76489) */
export const ATTENUATION_MUTE = 15;

/**
 * Result of a PSG state change: one or more raw bytes to emit via 0x50 writes.
 * Empty array = no change.
 */
export type DirtyBytes = number[];

export class SN76489State {
  /** 10-bit period values for tone channels 0–2. -1 = uninitialized. */
  private tonePeriod: [number, number, number] = [UNINIT_PERIOD, UNINIT_PERIOD, UNINIT_PERIOD];

  /** 4-bit attenuation for channels 0–3 (0=loudest, 15=mute). -1 = uninitialized. */
  private volume: [number, number, number, number] = [
    UNINIT_VOLUME, UNINIT_VOLUME, UNINIT_VOLUME, UNINIT_VOLUME,
  ];

  /** Encoded noise control byte for channel 3. -1 = uninitialized. */
  private noiseCtrl: number = UNINIT_NOISE;

  /** 8-bit Game Gear stereo register. -2 = uninitialized. */
  private ggStereo: number = UNINIT_STEREO;

  // ── Tone period ─────────────────────────────────────────────────────────────

  /**
   * Apply a new tone period for channel 0-2.
   * Returns the PSG bytes to write (latch + data), or [] if unchanged.
   */
  applyTonePeriod(channel: number, period: number): DirtyBytes {
    if (channel < 0 || channel > 2) return [];
    period = Math.max(0, Math.min(1023, Math.round(period)));
    if (this.tonePeriod[channel] === period) return [];
    this.tonePeriod[channel] = period;
    return [toneLatchByte(channel, period), toneDataByte(period)];
  }

  // ── Volume ───────────────────────────────────────────────────────────────────

  /**
   * Apply a new attenuation for any channel 0-3.
   * Returns the PSG byte to write, or [] if unchanged.
   */
  applyVolume(channel: number, attenuation: number): DirtyBytes {
    if (channel < 0 || channel >= PSG_CHANNELS) return [];
    attenuation = Math.max(0, Math.min(15, Math.round(attenuation)));
    if (this.volume[channel] === attenuation) return [];
    this.volume[channel] = attenuation;
    return [volumeLatchByte(channel, attenuation)];
  }

  // ── Noise control ────────────────────────────────────────────────────────────

  /**
   * Apply a new noise control setting.
   * Returns the PSG byte to write, or [] if unchanged.
   *
   * @param isWhite  true = white noise, false = periodic
   * @param rate     0-3 (0-2 = fixed dividers, 3 = Tone3 period)
   */
  applyNoiseControl(isWhite: boolean, rate: number): DirtyBytes {
    rate = Math.max(0, Math.min(3, Math.round(rate)));
    const b = noiseControlByte(isWhite, rate);
    if (this.noiseCtrl === b) return [];
    this.noiseCtrl = b;
    return [b];
  }

  // ── Game Gear stereo ─────────────────────────────────────────────────────────

  /**
   * Apply a new GG stereo register value.
   * Returns the byte to emit (for the 0x4F command), or -1 if unchanged.
   */
  applyGgStereo(stereo: number): number {
    stereo = stereo & 0xFF;
    if (this.ggStereo === stereo) return -1;
    this.ggStereo = stereo;
    return stereo;
  }

  // ── Initialisation flush ─────────────────────────────────────────────────────

  /**
   * Return all current register bytes unconditionally (for song-start flush).
   * Emits: noise control, then volume for all channels, then tone periods for channels 0-2.
   * GG stereo is handled separately (via applyGgStereo).
   *
   * After calling this, the shadow state matches what was written.
   */
  flush(): { psgBytes: number[]; ggStereo: number } {
    // Establish defaults for any uninitialized registers
    // NOTE: noiseCtrl is intentionally NOT pre-initialized. The first note-on will
    // establish the correct noise control settings. Pre-initializing to a "default"
    // (e.g., periodic mode) can cause the first note to sound with the wrong noise
    // characteristics (e.g., a kick at rate=2 white would play as rate=1 periodic
    // for a brief moment). By leaving it uninitialized (-1), the first note-on's
    // noiseRate/noiseIsWhite settings will definitely trigger a write.
    for (let ch = 0; ch < PSG_CHANNELS; ch++) {
      if (this.volume[ch] === UNINIT_VOLUME) {
        this.volume[ch] = ATTENUATION_MUTE;
      }
    }
    for (let ch = 0; ch < 3; ch++) {
      if (this.tonePeriod[ch] === UNINIT_PERIOD) {
        this.tonePeriod[ch] = 0;
      }
    }
    if (this.ggStereo === UNINIT_STEREO) {
      this.ggStereo = GG_STEREO_DEFAULT;
    }

    const psgBytes: number[] = [];

    // Emit noise control for ch3 ONLY if it has been initialized
    // (Don't emit a default value that might contradict the first note-on)
    if (this.noiseCtrl !== UNINIT_NOISE) {
      psgBytes.push(this.noiseCtrl);
    }

    // Emit volume for all 4 channels
    for (let ch = 0; ch < PSG_CHANNELS; ch++) {
      psgBytes.push(volumeLatchByte(ch, this.volume[ch]));
    }

    // Emit tone periods for ch 0-2
    for (let ch = 0; ch < 3; ch++) {
      psgBytes.push(toneLatchByte(ch, this.tonePeriod[ch]));
      psgBytes.push(toneDataByte(this.tonePeriod[ch]));
    }

    return { psgBytes, ggStereo: this.ggStereo };
  }

  // ── Accessors ────────────────────────────────────────────────────────────────

  getCurrentPeriod(channel: number): number {
    return this.tonePeriod[channel] ?? 0;
  }

  getCurrentVolume(channel: number): number {
    const v = this.volume[channel];
    return v === UNINIT_VOLUME ? ATTENUATION_MUTE : v;
  }

  getCurrentNoiseCtrl(): number {
    return this.noiseCtrl;
  }

  getCurrentGgStereo(): number {
    const s = this.ggStereo;
    return s === UNINIT_STEREO ? GG_STEREO_DEFAULT : s;
  }
}
