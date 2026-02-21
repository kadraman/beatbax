/**
 * ChannelState - Manages mute/solo state for each channel
 * Part of Phase 2: Playback & Output
 */

import type { EventBus } from '../utils/event-bus';
import type { Player } from '@beatbax/engine/audio/playback';
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:channel-state');

export interface ChannelInfo {
  id: number;
  muted: boolean;
  soloed: boolean;
  volume: number; // 0-1
}

/**
 * Manages per-channel mute/solo state and persistence
 */
export class ChannelState {
  private channels: Map<number, ChannelInfo> = new Map();
  private storageKey = 'beatbax-channel-state';
  private maxChannels = 4; // Game Boy has 4 channels
  private player: Player | null = null;

  constructor(private eventBus: EventBus) {
    this.initializeChannels();
    this.loadState();
  }

  /**
   * Set the player instance to apply mute/solo changes to
   */
  setPlayer(player: Player | null): void {
    this.player = player;
  }

  /**
   * Initialize default channel state
   */
  private initializeChannels(): void {
    for (let i = 1; i <= this.maxChannels; i++) {
      this.channels.set(i, {
        id: i,
        muted: false,
        soloed: false,
        volume: 1.0,
      });
    }
  }

  /**
   * Load state from localStorage
   */
  private loadState(): void {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) return;

      const state = JSON.parse(saved);
      for (const [channelId, info] of Object.entries(state)) {
        const id = parseInt(channelId, 10);
        if (this.channels.has(id)) {
          this.channels.set(id, info as ChannelInfo);
        }
      }
    } catch (error) {
      log.warn('Failed to load channel state:', error);
    }
  }

  /**
   * Save state to localStorage
   */
  private saveState(): void {
    try {
      const state: Record<number, ChannelInfo> = {};
      for (const [id, info] of this.channels.entries()) {
        state[id] = info;
      }
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (error) {
      log.warn('Failed to save channel state:', error);
    }
  }

  /**
   * Mute a channel
   */
  mute(channelId: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    channel.muted = true;
    this.saveState();
    this.applyToPlayer(this.player); // Apply immediately to Player
    this.eventBus.emit('channel:muted', { channel: channelId });
  }

  /**
   * Unmute a channel
   */
  unmute(channelId: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    channel.muted = false;
    this.saveState();
    this.applyToPlayer(this.player); // Apply immediately to Player
    this.eventBus.emit('channel:unmuted', { channel: channelId });
  }

  /**
   * Toggle mute state
   */
  toggleMute(channelId: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    if (channel.muted) {
      this.unmute(channelId);
    } else {
      this.mute(channelId);
    }
  }

  /**
   * Solo a channel (mutes all others)
   */
  solo(channelId: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    // If this channel is already soloed, unsolo it
    if (channel.soloed) {
      this.unsolo(channelId);
      return;
    }

    // Solo this channel and unsolo all others
    for (const [id, info] of this.channels.entries()) {
      if (id === channelId) {
        info.soloed = true;
        this.eventBus.emit('channel:soloed', { channel: id });
      } else {
        info.soloed = false;
        this.eventBus.emit('channel:unsoloed', { channel: id });
      }
    }

    this.saveState();
    this.applyToPlayer(this.player); // Apply immediately to Player
  }

  /**
   * Unsolo a channel
   */
  unsolo(channelId: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    channel.soloed = false;
    this.saveState();
    this.applyToPlayer(this.player); // Apply immediately to Player
    this.eventBus.emit('channel:unsoloed', { channel: channelId });
  }

  /**
   * Toggle solo state
   */
  toggleSolo(channelId: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    if (channel.soloed) {
      this.unsolo(channelId);
    } else {
      this.solo(channelId);
    }
  }

  /**
   * Set channel volume
   */
  setVolume(channelId: number, volume: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    channel.volume = Math.max(0, Math.min(1, volume));
    this.saveState();
  }

  /**
   * Get channel info
   */
  getChannel(channelId: number): ChannelInfo | undefined {
    return this.channels.get(channelId);
  }

  /**
   * Get all channels
   */
  getAllChannels(): ChannelInfo[] {
    return Array.from(this.channels.values());
  }

  /**
   * Check if a channel should be audible
   * (not muted and either not in solo mode or is soloed)
   */
  isAudible(channelId: number): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    // If muted, not audible
    if (channel.muted) return false;

    // Check if any channel is soloed
    const anySoloed = Array.from(this.channels.values()).some(c => c.soloed);

    // If no channels are soloed, all unmuted channels are audible
    if (!anySoloed) return true;

    // If channels are soloed, only soloed channels are audible
    return channel.soloed;
  }

  /**
   * Apply mute/solo state to the player
   * This should be called when playback starts
   */
  applyToPlayer(player: Player | null): void {
    if (!player) {
      log.warn('applyToPlayer called with null player');
      return;
    }

    // Clear existing mute/solo state
    player.muted.clear();
    player.solo = null;

    // Find which channel is soloed (if any)
    let soloedChannelId: number | null = null;
    for (const [channelId, info] of this.channels.entries()) {
      if (info.soloed) {
        soloedChannelId = channelId;
        break; // Only one channel can be soloed
      }
    }

    // Apply solo state first
    if (soloedChannelId !== null) {
      player.solo = soloedChannelId;
    } else {
      // If no channel is soloed, apply individual mute states
      for (const [channelId, info] of this.channels.entries()) {
        if (info.muted) {
          player.muted.add(channelId);
        }
      }
    }
  }

  /**
   * Reset all channels to default state
   */
  reset(): void {
    for (const channel of this.channels.values()) {
      channel.muted = false;
      channel.soloed = false;
      channel.volume = 1.0;
    }
    this.saveState();
  }
}
