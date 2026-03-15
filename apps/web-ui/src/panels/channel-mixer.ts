/**
 * ChannelMixer - Unified per-channel monitor and controls panel
 * Part of Phase 4: Advanced IDE features
 *
 * Combines the former ChannelControls (real-time position tracking) and
 * ChannelMonitor (mute/solo/level indicator) into a single panel, and adds
 * a per-channel volume slider.
 *
 * Volume slider availability is chip-dependent:
 *   - Game Boy (default): disabled — the APU uses envelope-driven amplitude.
 *     Channels 1/2/4 have a 0–15 volume set at note-on via the NR1x/NR2x/NR4x
 *     envelope registers; channel 3 (Wave) has only four fixed output levels
 *     (0/25/50/100%). There is no runtime volume register writable per-channel.
 *   - Future chips (NES, SID, YM2612, …): enabled for chips listed in
 *     VOLUME_SUPPORTED_CHIPS.
 */

import type { EventBus } from '../utils/event-bus';
import type { PlaybackPosition } from '../playback/playback-manager';
import { ChannelState } from '../playback/channel-state';
import { createLogger, getLoggingConfig } from '@beatbax/engine/util/logger';

const log = createLogger('ui:channel-panel');
const STYLE_ID = 'bb-channel-panel-styles';

/** Chips that expose a per-channel volume register writable at runtime. */
const VOLUME_SUPPORTED_CHIPS = new Set(['nes', 'sid', 'genesis', 'snes']);

const CHANNEL_META: Record<number, { label: string; color: string }> = {
  1: { label: 'Pulse 1', color: '#569cd6' },
  2: { label: 'Pulse 2', color: '#9cdcfe' },
  3: { label: 'Wave',    color: '#4ec9b0' },
  4: { label: 'Noise',   color: '#ce9178' },
};

export interface ChannelMixerOptions {
  container: HTMLElement;
  eventBus: EventBus;
  channelState: ChannelState;
}

export class ChannelMixer {
  private container: HTMLElement;
  private eventBus: EventBus;
  private channelState: ChannelState;
  private ast: any = null;
  private unsubscribers: Array<() => void> = [];
  private levelTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

  constructor(options: ChannelMixerOptions) {
    this.container = options.container;
    this.eventBus = options.eventBus;
    this.channelState = options.channelState;
    this.injectStyles();
    this.render();
    this.setupEventListeners();
  }

  // ─── Chip capability ────────────────────────────────────────────────────────

  private get activeChip(): string {
    return (this.ast?.chip ?? 'gameboy').toLowerCase();
  }

  private get volumeEnabled(): boolean {
    return VOLUME_SUPPORTED_CHIPS.has(this.activeChip);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  render(): void {
    this.container.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'bb-cp';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Mixer');

    const channels = this.ast?.channels ?? [];

    if (channels.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'bb-cp__empty';
      emptyMsg.textContent = 'No channels defined';
      root.appendChild(emptyMsg);
    } else {
      for (const ch of channels) {
        root.appendChild(this.buildCard(ch));
      }
    }

    this.container.appendChild(root);
  }

  private buildCard(ch: any): HTMLElement {
    const meta = CHANNEL_META[ch.id as number] ?? { label: `Ch${ch.id}`, color: '#888888' };
    const info = this.channelState.getChannel(ch.id);
    const isMuted = info?.muted ?? false;
    const isSoloed = info?.soloed ?? false;
    const isAudible = this.channelState.isAudible(ch.id);
    const defaultInstName = this.getInstrumentName(ch);

    const card = document.createElement('div');
    card.className = 'bb-cp__card' + (!isAudible ? ' bb-cp__card--silent' : '');
    card.id = `bb-cp-card-${ch.id}`;

    // ── Card header: level bar + channel name + chip label ──────────────────
    const cardHeader = document.createElement('div');
    cardHeader.className = 'bb-cp__card-header';

    const levelBar = document.createElement('div');
    levelBar.className = 'bb-cp__level-bar';
    levelBar.id = `bb-cp-level-${ch.id}`;
    levelBar.style.background = meta.color;
    levelBar.style.opacity = '0.35';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'bb-cp__title-block';

    const channelTitle = document.createElement('span');
    channelTitle.className = 'bb-cp__channel-title';
    channelTitle.textContent = `Channel ${ch.id}`;

    const chipLabel = document.createElement('span');
    chipLabel.className = 'bb-cp__chip-label';
    chipLabel.textContent = meta.label;
    chipLabel.style.color = meta.color;

    titleBlock.appendChild(channelTitle);
    titleBlock.appendChild(chipLabel);
    cardHeader.appendChild(levelBar);
    cardHeader.appendChild(titleBlock);
    card.appendChild(cardHeader);

    // ── Real-time instrument display ─────────────────────────────────────────
    const instEl = document.createElement('div');
    instEl.className = 'bb-cp__inst';
    instEl.id = `bb-cp-inst-${ch.id}`;
    instEl.dataset.defaultInst = defaultInstName;
    instEl.textContent = `🎵 ${defaultInstName}`;
    card.appendChild(instEl);

    // ── Pattern / sequence / bar display ─────────────────────────────────────
    const patternEl = document.createElement('div');
    patternEl.className = 'bb-cp__pattern';
    patternEl.id = `bb-cp-pattern-${ch.id}`;
    card.appendChild(patternEl);

    // ── Progress bar ──────────────────────────────────────────────────────────
    const progressWrap = document.createElement('div');
    progressWrap.className = 'bb-cp__progress-wrap';
    const progressFill = document.createElement('div');
    progressFill.className = 'bb-cp__progress-fill';
    progressFill.id = `bb-cp-progress-${ch.id}`;
    progressWrap.appendChild(progressFill);
    card.appendChild(progressWrap);

    // ── Debug: event position (visible only when log level = debug) ───────────
    const loggingCfg = getLoggingConfig();
    const showDebug =
      loggingCfg.level === 'debug' &&
      (!loggingCfg.modules || loggingCfg.modules.includes('ui:channel-panel'));

    const positionEl = document.createElement('div');
    positionEl.className = 'bb-cp__position';
    positionEl.id = `bb-cp-pos-${ch.id}`;
    positionEl.textContent = '0/0';
    positionEl.style.display = showDebug ? 'block' : 'none';
    card.appendChild(positionEl);

    // ── Controls row: Mute + Solo + Volume slider ─────────────────────────────
    const ctrlRow = document.createElement('div');
    ctrlRow.className = 'bb-cp__ctrl-row';

    const muteBtn = document.createElement('button');
    muteBtn.className = 'bb-cp__btn bb-cp__btn--mute';
    muteBtn.id = `bb-cp-mute-${ch.id}`;
    this.applyMuteStyle(muteBtn, isMuted);
    muteBtn.addEventListener('click', () => this.channelState.toggleMute(ch.id));

    const soloBtn = document.createElement('button');
    soloBtn.className = 'bb-cp__btn bb-cp__btn--solo';
    soloBtn.id = `bb-cp-solo-${ch.id}`;
    this.applySoloStyle(soloBtn, isSoloed);
    soloBtn.addEventListener('click', () => this.channelState.toggleSolo(ch.id));

    // Volume slider — always rendered; disabled for chips without runtime volume
    const volWrap = document.createElement('div');
    volWrap.className =
      'bb-cp__vol-wrap' + (!this.volumeEnabled ? ' bb-cp__vol-wrap--disabled' : '');

    const volLabel = document.createElement('label');
    volLabel.className = 'bb-cp__vol-label';
    volLabel.textContent = 'Vol';
    volLabel.htmlFor = `bb-cp-vol-${ch.id}`;

    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.className = 'bb-cp__vol-slider';
    volSlider.id = `bb-cp-vol-${ch.id}`;
    volSlider.min = '0';
    volSlider.max = '100';
    volSlider.step = '1';
    volSlider.value = String(Math.round((info?.volume ?? 1) * 100));
    volSlider.disabled = !this.volumeEnabled;

    if (!this.volumeEnabled) {
      const chipName = this.activeChip.charAt(0).toUpperCase() + this.activeChip.slice(1);
      const tooltip = `${chipName} uses envelope-driven amplitude — no per-channel volume available during playback`;
      volSlider.title = tooltip;
      volLabel.title = tooltip;
    } else {
      volSlider.addEventListener('input', () => {
        this.channelState.setVolume(ch.id, parseInt(volSlider.value, 10) / 100);
      });
    }

    volWrap.appendChild(volLabel);
    volWrap.appendChild(volSlider);
    ctrlRow.appendChild(volWrap);
    ctrlRow.appendChild(muteBtn);
    ctrlRow.appendChild(soloBtn);
    card.appendChild(ctrlRow);

    return card;
  }

  // ─── Event subscriptions ────────────────────────────────────────────────────

  private setupEventListeners(): void {
    this.unsubscribers.push(
      this.eventBus.on('parse:success', ({ ast }) => {
        const needsRerender = this.hasChannelStructureChanged(ast);
        this.ast = ast;
        if (needsRerender) this.render();
      }),

      this.eventBus.on('song:loaded', () => {
        this.ast = null;
        log.debug('song:loaded — AST cache cleared');
      }),

      this.eventBus.on('playback:position-changed', ({ channelId, position }) => {
        this.updatePosition(channelId, position);
        this.pulse(channelId);
      }),

      this.eventBus.on('playback:stopped', () => {
        this.resetAllChannels();
        this.clearAllLevels();
      }),

      this.eventBus.on('channel:muted',    ({ channel }) => this.refreshMuteState(channel)),
      this.eventBus.on('channel:unmuted',  ({ channel }) => this.refreshMuteState(channel)),
      this.eventBus.on('channel:soloed',   ({ channel: _ }) => this.refreshAllSoloStates()),
      this.eventBus.on('channel:unsoloed', ({ channel: _ }) => this.refreshAllSoloStates()),
    );
  }

  // ─── Incremental state updates (avoid full re-render on small changes) ───────

  private hasChannelStructureChanged(newAst: any): boolean {
    if (!this.ast) return true;
    // A chip change affects volumeEnabled and volume control tooltips/disabled state.
    if ((this.ast.chip ?? 'gameboy') !== (newAst.chip ?? 'gameboy')) return true;
    if (!this.ast.channels && !newAst.channels) return false;
    if (!this.ast.channels || !newAst.channels) return true;
    if (this.ast.channels.length !== newAst.channels.length) return true;
    const oldIds = this.ast.channels.map((c: any) => c.id).sort();
    const newIds = newAst.channels.map((c: any) => c.id).sort();
    return oldIds.some((id: number, i: number) => id !== newIds[i]);
  }

  private refreshMuteState(channelId: number): void {
    const info = this.channelState.getChannel(channelId);
    const muteBtn = document.getElementById(`bb-cp-mute-${channelId}`) as HTMLButtonElement | null;
    if (muteBtn && info) this.applyMuteStyle(muteBtn, info.muted);
    this.updateAudibilityVisual(channelId);
  }

  private refreshAllSoloStates(): void {
    for (const ch of this.channelState.getAllChannels()) {
      const soloBtn = document.getElementById(`bb-cp-solo-${ch.id}`) as HTMLButtonElement | null;
      if (soloBtn) this.applySoloStyle(soloBtn, ch.soloed);
      this.updateAudibilityVisual(ch.id);
    }
  }

  private updateAudibilityVisual(channelId: number): void {
    const isAudible = this.channelState.isAudible(channelId);
    const card = document.getElementById(`bb-cp-card-${channelId}`);
    if (card) card.classList.toggle('bb-cp__card--silent', !isAudible);
    const levelBar = document.getElementById(`bb-cp-level-${channelId}`);
    if (levelBar) levelBar.style.opacity = isAudible ? '0.35' : '0.15';
  }

  // ─── Real-time position updates ──────────────────────────────────────────────

  private updatePosition(channelId: number, position: PlaybackPosition): void {
    const instEl = document.getElementById(`bb-cp-inst-${channelId}`);
    if (instEl && position.currentInstrument) {
      instEl.textContent = `🎵 ${position.currentInstrument}`;
      instEl.style.color = '#4affaf';
    }

    const patternEl = document.getElementById(`bb-cp-pattern-${channelId}`);
    if (patternEl) {
      const parts: string[] = [];
      if (position.sourceSequence) parts.push(position.sourceSequence);
      if (position.currentPattern) {
        parts.push(position.currentPattern);
      } else if (position.barNumber != null) {
        parts.push(`Bar ${position.barNumber + 1}`);
      }
      patternEl.textContent = parts.length > 0 ? parts.join(' • ') : '—';
      patternEl.style.color = '#9cdcfe';
    }

    const progressFill = document.getElementById(`bb-cp-progress-${channelId}`);
    if (progressFill) progressFill.style.width = `${Math.round(position.progress * 100)}%`;

    const positionEl = document.getElementById(`bb-cp-pos-${channelId}`);
    if (positionEl) positionEl.textContent = `${position.eventIndex + 1}/${position.totalEvents}`;
  }

  private resetAllChannels(): void {
    const channels = this.ast?.channels ?? [];
    for (const ch of channels) {
      const instEl = document.getElementById(`bb-cp-inst-${ch.id}`);
      if (instEl) {
        instEl.textContent = `🎵 ${instEl.dataset.defaultInst ?? `Ch${ch.id}`}`;
        instEl.style.color = '#4a9eff';
      }
      const patternEl = document.getElementById(`bb-cp-pattern-${ch.id}`);
      if (patternEl) patternEl.textContent = '';
      const progressFill = document.getElementById(`bb-cp-progress-${ch.id}`);
      if (progressFill) progressFill.style.width = '0%';
      const positionEl = document.getElementById(`bb-cp-pos-${ch.id}`);
      if (positionEl) positionEl.textContent = '0/0';
    }
  }

  // ─── Level indicator (pulses on every position-changed event) ───────────────

  private pulse(channelId: number): void {
    const bar = document.getElementById(`bb-cp-level-${channelId}`);
    if (!bar) return;
    const color = CHANNEL_META[channelId]?.color ?? '#569cd6';
    bar.style.boxShadow = `0 0 6px 2px ${color}`;
    bar.style.opacity = '1';
    clearTimeout(this.levelTimers.get(channelId));
    this.levelTimers.set(channelId, setTimeout(() => {
      bar.style.boxShadow = 'none';
      bar.style.opacity = this.channelState.isAudible(channelId) ? '0.35' : '0.15';
    }, 120));
  }

  private clearAllLevels(): void {
    for (const ch of this.levelTimers.keys()) {
      clearTimeout(this.levelTimers.get(ch));
      const bar = document.getElementById(`bb-cp-level-${ch}`);
      if (bar) { bar.style.boxShadow = 'none'; bar.style.opacity = '0.35'; }
    }
    this.levelTimers.clear();
  }

  // ─── Style helpers ───────────────────────────────────────────────────────────

  private applyMuteStyle(btn: HTMLButtonElement, muted: boolean): void {
    btn.textContent = 'M';
    btn.title = muted ? 'Unmute channel' : 'Mute channel';
    btn.setAttribute('aria-pressed', String(muted));
    btn.classList.toggle('bb-cp__btn--active', muted);
  }

  private applySoloStyle(btn: HTMLButtonElement, soloed: boolean): void {
    btn.textContent = 'S';
    btn.title = soloed ? 'Remove solo' : 'Solo this channel';
    btn.setAttribute('aria-pressed', String(soloed));
    btn.classList.toggle('bb-cp__btn--active', soloed);
  }

  private getInstrumentName(ch: any): string {
    if (ch.inst && this.ast?.insts?.[ch.inst]) return ch.inst;
    if (Array.isArray(ch.events)) {
      const instruments = new Set<string>();
      for (const ev of ch.events) {
        if (ev.instrument && ev.instrument !== 'rest') instruments.add(ev.instrument);
      }
      if (instruments.size > 0) {
        const list = Array.from(instruments);
        return list.length > 3 ? `${list[0]} +${list.length - 1} more` : list.join(', ');
      }
    }
    return `Ch${ch.id}`;
  }

  // ─── CSS injection ───────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = /* css */ `
      /* ── Container ─────────────────────────────────────────────────────── */
      .bb-cp {
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
        color: #d4d4d4;
      }

      .bb-cp__header {
        font-weight: bold;
        font-size: 16px;
        padding: 10px 12px 8px;
        color: #d4d4d4;
        border-bottom: 2px solid #444;
        margin-bottom: 4px;
      }

      .bb-cp__empty {
        padding: 12px;
        color: #888;
        font-style: italic;
      }

      /* ── Card ───────────────────────────────────────────────────────────── */
      .bb-cp__card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 12px 12px;
        background: #2d2d2d;
        border: 1px solid #444;
        border-radius: 4px;
        margin: 4px 8px;
        transition: opacity 0.2s;
      }

      .bb-cp__card--silent { opacity: 0.5; }

      /* ── Card header ────────────────────────────────────────────────────── */
      .bb-cp__card-header {
        display: flex;
        align-items: stretch;
        gap: 8px;
      }

      .bb-cp__level-bar {
        width: 6px;
        min-height: 28px;
        border-radius: 3px;
        flex-shrink: 0;
        transition: box-shadow 0.05s, opacity 0.15s;
      }

      .bb-cp__title-block {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .bb-cp__channel-title {
        font-weight: 600;
        font-size: 13px;
        color: #d4d4d4;
      }

      .bb-cp__chip-label {
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      /* ── Real-time info ─────────────────────────────────────────────────── */
      .bb-cp__inst {
        font-size: 12px;
        color: #4a9eff;
        font-family: 'Consolas', 'Courier New', monospace;
        min-height: 16px;
      }

      .bb-cp__pattern {
        font-size: 11px;
        color: #9cdcfe;
        font-family: 'Consolas', 'Courier New', monospace;
        min-height: 14px;
      }

      /* ── Progress bar ───────────────────────────────────────────────────── */
      .bb-cp__progress-wrap {
        height: 4px;
        background: #1e1e1e;
        border-radius: 2px;
        overflow: hidden;
        border: 1px solid #444;
      }

      .bb-cp__progress-fill {
        height: 100%;
        width: 0%;
        background: #4a9eff;
        border-radius: 2px;
        transition: width 0.1s linear;
      }

      .bb-cp__position {
        font-size: 10px;
        color: #888;
        font-family: 'Consolas', 'Courier New', monospace;
      }

      /* ── Controls row ───────────────────────────────────────────────────── */
      .bb-cp__ctrl-row {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
      }

      .bb-cp__btn {
        width: 22px;
        height: 22px;
        padding: 0;
        cursor: pointer;
        border: 1px solid #555;
        background: #3a3a3a;
        color: #aaa;
        border-radius: 3px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        flex-shrink: 0;
        transition: all 0.2s;
      }

      .bb-cp__btn:hover { background: #4a4a4a; border-color: #777; }

      .bb-cp__btn--mute.bb-cp__btn--active {
        background: #7a2f2f;
        border-color: #c94e4e;
        color: #ffaaaa;
      }

      .bb-cp__btn--solo.bb-cp__btn--active {
        background: #2a4a7a;
        border-color: #4a9eff;
        color: #9cdcfe;
      }

      /* ── Volume slider ──────────────────────────────────────────────────── */
      .bb-cp__vol-wrap {
        display: flex;
        align-items: center;
        gap: 5px;
        flex: 1;
        min-width: 80px;
      }

      .bb-cp__vol-label {
        font-size: 11px;
        color: #888;
        white-space: nowrap;
        cursor: default;
        user-select: none;
      }

      .bb-cp__vol-slider {
        flex: 1;
        height: 4px;
        accent-color: #4a9eff;
        cursor: pointer;
      }

      .bb-cp__vol-wrap--disabled .bb-cp__vol-label { color: #555; }

      .bb-cp__vol-wrap--disabled .bb-cp__vol-slider {
        opacity: 0.3;
        cursor: not-allowed;
        accent-color: #555;
      }

      /* ── Light theme ────────────────────────────────────────────────────── */
      [data-theme="light"] .bb-cp { color: #333; }

      [data-theme="light"] .bb-cp__header {
        color: #333;
        border-color: #ddd;
      }

      [data-theme="light"] .bb-cp__card {
        background: #f3f3f3;
        border-color: #ddd;
      }

      [data-theme="light"] .bb-cp__btn {
        background: #e8e8e8;
        border-color: #ccc;
        color: #555;
      }

      [data-theme="light"] .bb-cp__btn:hover {
        background: #ddd;
        border-color: #aaa;
      }

      [data-theme="light"] .bb-cp__progress-wrap {
        background: #e0e0e0;
        border-color: #ddd;
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  dispose(): void {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
    this.levelTimers.forEach(t => clearTimeout(t));
    this.levelTimers.clear();
  }
}
