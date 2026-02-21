/**
 * ChannelControls - Per-channel control panel with real-time position tracking
 * Part of Phase 2.5.2: Basic UI Updates
 */

import type { EventBus } from '../utils/event-bus';
import type { PlaybackPosition } from '../playback/playback-manager';
import { ChannelState } from '../playback/channel-state';
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:channel-controls');

export interface ChannelControlsConfig {
  container: HTMLElement;
  eventBus: EventBus;
  channelState: ChannelState;
}

/**
 * ChannelControls panel - displays per-channel state with real-time position tracking
 */
export class ChannelControls {
  private container: HTMLElement;
  private eventBus: EventBus;
  private channelState: ChannelState;
  private ast: any = null;
  private unsubscribers: Array<() => void> = [];

  constructor(config: ChannelControlsConfig) {
    this.container = config.container;
    this.eventBus = config.eventBus;
    this.channelState = config.channelState;
    log.debug('ChannelControls constructor called');
    this.setupEventListeners();
    log.debug('Constructor complete, this.ast =', this.ast);
  }

  /**
   * Subscribe to relevant events
   */
  private setupEventListeners(): void {
    log.debug('setupEventListeners: Subscribing to parse:success');
    // Subscribe to parse success to render initial state
    this.unsubscribers.push(
      this.eventBus.on('parse:success', ({ ast }) => {
        log.debug('parse:success event received! ast =', ast);
        log.debug('Current this.ast before check =', this.ast);
        log.debug('Received parse:success event in ChannelControls', ast);

        // Only re-render if channel structure changed (different number of channels or IDs)
        const needsRerender = this.hasChannelStructureChanged(ast);
        log.debug('hasChannelStructureChanged returned:', needsRerender);
        this.ast = ast;

        if (needsRerender) {
          log.debug('Calling render() due to structure change');
          log.debug('Channel structure changed, re-rendering...');
          this.render();
        } else {
          log.debug('Skipping render, structure unchanged');
          log.debug('Channel structure unchanged, skipping re-render');
        }
      })
    );
    log.debug('Subscribed to parse:success');

    // Phase 2.5.2: Subscribe to position-changed events for real-time updates
    this.unsubscribers.push(
      this.eventBus.on('playback:position-changed', ({ channelId, position }) => {
        log.debug('Received playback:position-changed event in ChannelControls', { channelId, position });
        this.updateChannelPosition(channelId, position);
      })
    );

    // Subscribe to playback stopped to reset displays
    this.unsubscribers.push(
      this.eventBus.on('playback:stopped', () => {
        this.resetAllChannels();
      })
    );

    // Subscribe to channel state changes - update button states only, don't re-render
    this.unsubscribers.push(
      this.eventBus.on('channel:muted', ({ channel }) => this.updateMuteButtonState(channel))
    );
    this.unsubscribers.push(
      this.eventBus.on('channel:unmuted', ({ channel }) => this.updateMuteButtonState(channel))
    );
    this.unsubscribers.push(
      this.eventBus.on('channel:soloed', ({ channel }) => this.updateSoloButtonState(channel))
    );
    this.unsubscribers.push(
      this.eventBus.on('channel:unsoloed', ({ channel }) => this.updateSoloButtonState(channel))
    );
  }

  /**
   * Update mute button state for a channel without re-rendering
   */
  private updateMuteButtonState(channelId: number): void {
    const channelInfo = this.channelState.getChannel(channelId);
    if (!channelInfo) return;

    const muteBtn = document.getElementById(`ch-mute-${channelId}`) as HTMLButtonElement;
    if (muteBtn) {
      muteBtn.textContent = channelInfo.muted ? '� Unmute' : '🔊 Mute';
      muteBtn.style.background = channelInfo.muted ? '#c94e4e' : '#3a3a3a';
      muteBtn.style.borderColor = channelInfo.muted ? '#d66' : '#555';
    }

    // Update row opacity and indicator based on audibility
    this.updateChannelVisualState(channelId);
  }

  /**   * Check if the channel structure changed (different channels)
   */
  private hasChannelStructureChanged(newAst: any): boolean {
    log.debug('hasChannelStructureChanged called, this.ast =', this.ast, 'newAst =', newAst);
    // First time rendering
    if (!this.ast) {
      log.debug('First time rendering (this.ast is null/undefined) → returning true');
      return true;
    }

    // No channels in old or new AST
    if (!this.ast.channels && !newAst.channels) return false;
    if (!this.ast.channels || !newAst.channels) return true;

    // Different number of channels
    if (this.ast.channels.length !== newAst.channels.length) return true;

    // Different channel IDs
    const oldIds = this.ast.channels.map((ch: any) => ch.id).sort();
    const newIds = newAst.channels.map((ch: any) => ch.id).sort();

    return oldIds.some((id: number, i: number) => id !== newIds[i]);
  }

  /**   * Update solo button state for a channel without re-rendering
   */
  private updateSoloButtonState(channelId: number): void {
    // Update all channel solo buttons since solo affects multiple channels
    for (const channel of this.channelState.getAllChannels()) {
      const soloBtn = document.getElementById(`ch-solo-${channel.id}`) as HTMLButtonElement;
      if (soloBtn) {
        soloBtn.textContent = channel.soloed ? '⭐ Unsolo' : '⭐ Solo';
        soloBtn.style.background = channel.soloed ? '#4a9eff' : '#3a3a3a';
        soloBtn.style.borderColor = channel.soloed ? '#6bb6ff' : '#555';
      }

      // Update row opacity and indicator for each channel
      this.updateChannelVisualState(channel.id);
    }
  }

  /**
   * Update channel row visual state (opacity, indicator) based on audibility
   */
  private updateChannelVisualState(channelId: number): void {
    const isAudible = this.channelState.isAudible(channelId);

    // Update row opacity
    const row = document.getElementById(`ch-row-${channelId}`);
    if (row) {
      row.style.opacity = isAudible ? '1' : '0.5';
    }

    // Update indicator
    const indicator = document.getElementById(`ch-ind-${channelId}`);
    if (indicator) {
      if (isAudible) {
        indicator.style.background = '#4a9eff';
        indicator.style.borderColor = '#6bb6ff';
        indicator.style.boxShadow = '0 0 8px rgba(74, 158, 255, 0.6)';
      } else {
        indicator.style.background = '#555';
        indicator.style.borderColor = '#777';
        indicator.style.boxShadow = 'none';
      }
    }
  }

  /**
   * Phase 2.5.2: Update channel with real-time position data
   */
  private updateChannelPosition(channelId: number, position: PlaybackPosition): void {
    log.debug(`Position update for channel ${channelId}:`, position);

    // Update instrument display
    const instEl = document.getElementById(`ch-inst-${channelId}`);
    if (instEl && position.currentInstrument) {
      instEl.textContent = `🎵 ${position.currentInstrument}`;
      instEl.style.color = '#4affaf';
    }

    // Update pattern display
    const patternEl = document.getElementById(`ch-pattern-${channelId}`);
    if (patternEl) {
      const parts: string[] = [];

      // Show sequence name if available
      if (position.sourceSequence) parts.push(`${position.sourceSequence}`);

      // Show pattern name if available, otherwise fall back to bar number
      if (position.currentPattern) {
        parts.push(`${position.currentPattern}`);
      } else if (position.barNumber != null) {
        parts.push(`Bar ${position.barNumber + 1}`);
      }

      patternEl.textContent = parts.length > 0 ? parts.join(' • ') : '—';
      patternEl.style.color = '#9cdcfe';
    }

    // Update progress bar
    const progressFill = document.getElementById(`ch-progress-${channelId}`);
    if (progressFill) {
      const percentage = Math.round(position.progress * 100);
      progressFill.style.width = `${percentage}%`;
      progressFill.style.background = '#4affaf';
    }

    // Update event position text
    const positionEl = document.getElementById(`ch-position-${channelId}`);
    if (positionEl) {
      positionEl.textContent = `${position.eventIndex + 1}/${position.totalEvents}`;
    }

    // Pulse indicator
    const indicator = document.getElementById(`ch-ind-${channelId}`);
    if (indicator) {
      indicator.style.background = '#4affaf';
      indicator.style.borderColor = '#6fffbd';
      indicator.style.boxShadow = '0 0 12px rgba(74, 255, 175, 0.8)';

      // Reset after brief pulse
      setTimeout(() => {
        if (this.channelState.isAudible(channelId)) {
          indicator.style.background = '#4a9eff';
          indicator.style.borderColor = '#6bb6ff';
          indicator.style.boxShadow = '0 0 8px rgba(74, 158, 255, 0.6)';
        }
      }, 150);
    }
  }

  /**
   * Reset all channel displays when playback stops
   */
  private resetAllChannels(): void {
    const channels = this.ast?.channels || [];

    for (const ch of channels) {
      // Reset instrument display
      const instEl = document.getElementById(`ch-inst-${ch.id}`);
      if (instEl) {
        const instName = instEl.dataset.defaultInst || `Ch${ch.id}`;
        instEl.textContent = `🎵 ${instName}`;
        instEl.style.color = '#4a9eff';
      }

      // Clear pattern display
      const patternEl = document.getElementById(`ch-pattern-${ch.id}`);
      if (patternEl) {
        patternEl.textContent = '';
      }

      // Reset progress bar
      const progressFill = document.getElementById(`ch-progress-${ch.id}`);
      if (progressFill) {
        progressFill.style.width = '0%';
        progressFill.style.background = '#4a9eff';
      }

      // Reset position text
      const positionEl = document.getElementById(`ch-position-${ch.id}`);
      if (positionEl) {
        positionEl.textContent = '0/0';
      }

      // Reset indicator
      const indicator = document.getElementById(`ch-ind-${ch.id}`);
      if (indicator && this.channelState.isAudible(ch.id)) {
        indicator.style.background = '#4a9eff';
        indicator.style.borderColor = '#6bb6ff';
        indicator.style.boxShadow = '0 0 8px rgba(74, 158, 255, 0.6)';
      }
    }
  }

  /**
   * Render the channel controls
   */
  render(): void {
    log.debug('render() called, this.ast =', this.ast);
    log.debug('Rendering channel controls. AST:', this.ast);

    // Clear container
    this.container.innerHTML = '';

    // Create title
    const title = document.createElement('div');
    title.textContent = 'Channel Controls';
    title.style.cssText = `
      font-weight: bold;
      font-size: 16px;
      margin-bottom: 8px;
      color: #d4d4d4;
      border-bottom: 2px solid #444;
      padding-bottom: 8px;
    `;
    this.container.appendChild(title);

    // Check for channels
    const channels = this.ast?.channels || [];
    log.debug(`Found ${channels.length} channels`);

    if (channels.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No channels defined';
      emptyMsg.style.cssText = 'color: #888; font-style: italic; margin-top: 12px;';
      this.container.appendChild(emptyMsg);
      return;
    }

    // Render each channel
    for (const ch of channels) {
      const channelEl = this.createChannelElement(ch);
      this.container.appendChild(channelEl);
    }
  }

  /**
   * Create a channel control element
   */
  private createChannelElement(ch: any): HTMLElement {
    const row = document.createElement('div');
    row.id = `ch-row-${ch.id}`;
    row.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: #2d2d2d;
      border: 1px solid #444;
      border-radius: 4px;
      margin-bottom: 12px;
      transition: background 0.2s, opacity 0.2s;
    `;

    // Channel header with indicator
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const indicator = document.createElement('div');
    indicator.id = `ch-ind-${ch.id}`;
    indicator.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #555;
      border: 2px solid #777;
      transition: all 0.15s;
    `;

    const label = document.createElement('div');
    label.textContent = `Channel ${ch.id}`;
    label.style.cssText = 'font-weight: 600; font-size: 14px; color: #d4d4d4; flex: 1;';

    header.appendChild(indicator);
    header.appendChild(label);

    // Get default instrument name for this channel
    const defaultInstName = this.getInstrumentName(ch);

    // Phase 2.5.2: Real-time instrument display
    const instInfo = document.createElement('div');
    instInfo.id = `ch-inst-${ch.id}`;
    instInfo.dataset.defaultInst = defaultInstName; // Store for reset
    instInfo.style.cssText = `
      font-size: 12px;
      color: #4a9eff;
      margin-left: 24px;
      font-family: 'Consolas', 'Courier New', monospace;
      min-height: 18px;
    `;
    instInfo.textContent = `🎵 ${defaultInstName}`;

    // Phase 2.5.2: Real-time pattern/sequence/bar display
    const patternInfo = document.createElement('div');
    patternInfo.id = `ch-pattern-${ch.id}`;
    patternInfo.style.cssText = `
      font-size: 11px;
      color: #9cdcfe;
      margin-left: 24px;
      font-family: 'Consolas', 'Courier New', monospace;
      min-height: 16px;
    `;

    // Phase 2.5.2: Progress bar
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      height: 6px;
      background: #1e1e1e;
      border-radius: 3px;
      margin-left: 24px;
      margin-top: 4px;
      overflow: hidden;
      border: 1px solid #444;
    `;

    const progressFill = document.createElement('div');
    progressFill.id = `ch-progress-${ch.id}`;
    progressFill.style.cssText = `
      height: 100%;
      width: 0%;
      background: #4a9eff;
      transition: width 0.1s linear, background 0.2s;
    `;
    progressContainer.appendChild(progressFill);

    // Event position (eventIndex/totalEvents)
    const positionInfo = document.createElement('div');
    positionInfo.id = `ch-position-${ch.id}`;
    positionInfo.style.cssText = `
      font-size: 10px;
      color: #888;
      margin-left: 24px;
      margin-top: 2px;
    `;
    positionInfo.textContent = '0/0';

    // Static config info
    const configInfo = document.createElement('div');
    configInfo.style.cssText = 'font-size: 10px; color: #666; margin-left: 24px; margin-top: 4px;';
    const eventCount = (ch as any).events?.length || 0;
    const beatCount = Math.floor(eventCount / 4);
    configInfo.textContent = `${eventCount} events (≈${beatCount} beats)`;

    // Button container
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; gap: 8px; margin-left: 24px; margin-top: 8px;';

    const muteBtn = document.createElement('button');
    muteBtn.id = `ch-mute-${ch.id}`;
    muteBtn.textContent = 'Mute';
    muteBtn.style.cssText = `
      padding: 6px 12px;
      cursor: pointer;
      flex: 1;
      border: 1px solid #555;
      background: #3a3a3a;
      color: #d4d4d4;
      border-radius: 3px;
      font-size: 12px;
      transition: all 0.2s;
    `;
    muteBtn.addEventListener('click', () => {
      this.channelState.toggleMute(ch.id);
      // Button state will be updated via channel:muted/unmuted event
    });

    const soloBtn = document.createElement('button');
    soloBtn.id = `ch-solo-${ch.id}`;
    soloBtn.textContent = 'Solo';
    soloBtn.style.cssText = `
      padding: 6px 12px;
      cursor: pointer;
      flex: 1;
      border: 1px solid #555;
      background: #3a3a3a;
      color: #d4d4d4;
      border-radius: 3px;
      font-size: 12px;
      transition: all 0.2s;
    `;
    soloBtn.addEventListener('click', () => {
      this.channelState.toggleSolo(ch.id);
      // Button states will be updated via channel:soloed/unsoloed events
    });

    btnContainer.appendChild(muteBtn);
    btnContainer.appendChild(soloBtn);

    // Assemble elements
    row.appendChild(header);
    row.appendChild(instInfo);
    row.appendChild(patternInfo);
    row.appendChild(progressContainer);
    row.appendChild(positionInfo);
    row.appendChild(configInfo);
    row.appendChild(btnContainer);

    // Update initial button states
    this.updateChannelButtons(ch.id, row, muteBtn, soloBtn, indicator);

    return row;
  }

  /**
   * Get instrument name for a channel
   */
  private getInstrumentName(ch: any): string {
    // Try channel-level inst property first
    if (ch.inst && this.ast?.insts && this.ast.insts[ch.inst]) {
      return ch.inst;
    }

    // Extract instruments from events (Song Model format)
    if (ch.events && Array.isArray(ch.events)) {
      const instruments = new Set<string>();

      for (const event of ch.events) {
        if (event.instrument && event.instrument !== 'rest') {
          instruments.add(event.instrument);
        }
      }

      if (instruments.size > 0) {
        const instList = Array.from(instruments);
        if (instList.length > 3) {
          return `${instList[0]} +${instList.length - 1} more`;
        }
        return instList.join(', ');
      }
    }

    return `Ch${ch.id}`;
  }

  /**
   * Update button states and visual feedback
   */
  private updateChannelButtons(
    channelId: number,
    row: HTMLElement,
    muteBtn: HTMLButtonElement,
    soloBtn: HTMLButtonElement,
    indicator: HTMLElement
  ): void {
    const channelInfo = this.channelState.getChannel(channelId);
    if (!channelInfo) return;

    muteBtn.textContent = channelInfo.muted ? '🔇 Unmute' : '🔊 Mute';
    soloBtn.textContent = channelInfo.soloed ? '⭐ Unsolo' : '⭐ Solo';
    row.style.opacity = this.channelState.isAudible(channelId) ? '1' : '0.5';

    if (this.channelState.isAudible(channelId)) {
      indicator.style.background = '#4a9eff';
      indicator.style.borderColor = '#6bb6ff';
      indicator.style.boxShadow = '0 0 8px rgba(74, 158, 255, 0.6)';
    } else {
      indicator.style.background = '#555';
      indicator.style.borderColor = '#777';
      indicator.style.boxShadow = 'none';
    }

    if (channelInfo.muted) {
      muteBtn.style.background = '#c94e4e';
      muteBtn.style.borderColor = '#d66';
    } else {
      muteBtn.style.background = '#3a3a3a';
      muteBtn.style.borderColor = '#555';
    }

    if (channelInfo.soloed) {
      soloBtn.style.background = '#4a9eff';
      soloBtn.style.borderColor = '#6bb6ff';
    } else {
      soloBtn.style.background = '#3a3a3a';
      soloBtn.style.borderColor = '#555';
    }
  }

  /**
   * Clean up event listeners
   */
  dispose(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }

  /**
   * Update the AST and re-render
   */
  setAST(ast: any): void {
    this.ast = ast;
    this.render();
  }
}
