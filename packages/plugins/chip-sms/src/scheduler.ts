/**
 * SMS PSG Channel Scheduler / Coordinator
 * 
 * Handles inter-channel coordination for the SMS PSG, specifically:
 * - Tone3 ↔ Noise synchronization (noise_rate=tone3)
 * - Frame-accurate envelope timing
 * - Channel volume mixing
 * 
 * This module provides the glue between individual channel backends
 * that need to communicate with each other.
 */

import type { SMSToneBackend } from './tone.js';
import type { SMSNoiseBackend } from './noise.js';

/**
 * SMS PSG Channel Coordinator
 * 
 * Coordinates between tone and noise channels for features that require
 * cross-channel communication, such as Tone3-Noise synchronization.
 */
export class SMSChannelCoordinator {
  private tone3Channel: SMSToneBackend | null = null;
  private noiseChannel: SMSNoiseBackend | null = null;

  /**
   * Register a tone channel with the coordinator.
   */
  registerToneChannel(channelIndex: number, channel: SMSToneBackend): void {
    if (channelIndex === 2) { // Channel 2 is Tone3
      this.tone3Channel = channel;
    }
  }

  /**
   * Register the noise channel with the coordinator.
   */
  registerNoiseChannel(channel: SMSNoiseBackend): void {
    this.noiseChannel = channel;
  }

  /**
   * Update noise channel with current Tone3 period.
   * Called when Tone3's period changes and noise_rate=tone3.
   */
  updateNoiseFromTone3(): void {
    if (!this.tone3Channel || !this.noiseChannel) return;
    
    // Get current period from Tone3 channel
    const tone3Period = this.tone3Channel.getCurrentPeriod();
    
    // Update noise channel with the new period
    this.noiseChannel.updateTone3Period(tone3Period);
  }

  /**
   * Get the currently registered Tone3 period.
   * Returns 0 when Tone3 is unavailable or has no valid period yet.
   */
  getTone3Period(): number {
    if (!this.tone3Channel) return 0;
    return this.tone3Channel.getCurrentPeriod();
  }

  /**
   * Advance all channels' envelopes by one frame.
   */
  advanceFrame(frame: number): void {
    // This would be called by the engine, but for now we'll handle it
    // in the individual channel applyEnvelope methods
  }
}

/** Global coordinator instance */
export const smsCoordinator = new SMSChannelCoordinator();