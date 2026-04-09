/**
 * DebugOverlay — semi-transparent HUD showing live audio and playback diagnostics.
 *
 * Shown/hidden by Settings → Advanced → "Show debug overlay".
 * Position and opacity are also configurable from Settings → Advanced.
 * Polls the PlaybackManager and AudioContext at ~4 Hz to keep CPU impact low.
 */

import type { PlaybackManager } from '../playback/playback-manager';
import { playbackStatus } from '../stores/playback.store';
import { parsedBpm, parsedChip } from '../stores/editor.store';

export type OverlayPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export class DebugOverlay {
  private el: HTMLElement;
  private manager: PlaybackManager;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private visible = false;

  constructor(manager: PlaybackManager, position: OverlayPosition = 'top-right', opacity = 70, fontSize = 11) {
    this.manager = manager;

    this.el = document.createElement('div');
    this.el.id = 'bb-debug-overlay';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.display = 'none';
    document.body.appendChild(this.el);

    this.setPosition(position);
    this.setOpacity(opacity);
    this.setFontSize(fontSize);
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.el.style.display = '';
    this.startPolling();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.el.style.display = 'none';
    this.stopPolling();
  }

  toggle(enabled: boolean): void {
    enabled ? this.show() : this.hide();
  }

  /**
   * Reposition the overlay. Clears all four inset properties before setting
   * the two that apply to the chosen corner.
   */
  setPosition(position: OverlayPosition): void {
    const s = this.el.style;
    // Reset all corners
    s.top = s.bottom = s.left = s.right = '';
    const [v, h] = position.split('-') as ['top' | 'bottom', 'left' | 'right'];
    s[v] = v === 'top' ? '40px' : '28px'; // top: below menu bar; bottom: above status bar
    s[h] = '12px';
  }

  /** Set opacity as an integer percentage (10–100). */
  setOpacity(pct: number): void {
    this.el.style.opacity = String(Math.min(100, Math.max(10, pct)) / 100);
  }

  /** Set font size in px (8–20). */
  setFontSize(px: number): void {
    this.el.style.fontSize = `${Math.min(20, Math.max(8, px))}px`;
  }

  destroy(): void {
    this.stopPolling();
    this.el.remove();
  }

  // ─── Polling ───────────────────────────────────────────────────────────────

  private startPolling(): void {
    if (this.intervalId !== null) return;
    this.update(); // immediate first paint
    this.intervalId = setInterval(() => this.update(), 250); // 4 Hz
  }

  private stopPolling(): void {
    if (this.intervalId === null) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  private update(): void {
    const player = this.manager.getPlayer();
    const playerAny = player as any;

    // AudioContext state
    const ctx: AudioContext | null = player ? player.getAudioContext() : null;
    const ctxState = ctx ? ctx.state : 'n/a';
    const sampleRate = ctx ? ctx.sampleRate : 0;
    const currentTime = ctx ? ctx.currentTime.toFixed(3) : '—';
    const baseLatency = ctx && 'baseLatency' in ctx
      ? ((ctx as any).baseLatency * 1000).toFixed(1) + ' ms'
      : '—';

    // Playback state
    const status = playbackStatus.get();
    const bpm = parsedBpm.get();
    const chip = parsedChip.get();

    // Channel event counts
    const positions = this.manager.getAllPlaybackPositions();
    const channelRows = positions.size > 0
      ? [...positions.entries()]
          .sort(([a], [b]) => a - b)
          .map(([id, pos]) => {
            const pct = (pos.progress * 100).toFixed(0).padStart(3);
            const inst = pos.currentInstrument ? pos.currentInstrument.substring(0, 8).padEnd(8) : '—       ';
            const pat  = pos.currentPattern    ? pos.currentPattern.substring(0, 10)              : '—';
            return `  ch${id}: ${pct}%  ${inst}  ${pat}`;
          })
          .join('\n')
      : '  (no active channels)';

    // Scheduler stats (internal fields, may be undefined)
    const schedulerAny = playerAny?.scheduler as any;
    const queueLen  = schedulerAny?.queue?.length  ?? schedulerAny?.pendingEvents?.length  ?? '—';
    const tickCount = schedulerAny?.tickCount ?? schedulerAny?._tickCount ?? '—';

    // Master gain
    const gainNode = player ? player.getMasterGain() : null;
    const gainVal = gainNode
      ? gainNode.gain.value.toFixed(2)
      : '—';

    const lines = [
      '╔══ BeatBax Debug Overlay ══════════════╗',
      `  Status      : ${status}`,
      `  BPM         : ${bpm}`,
      `  Chip        : ${chip}`,
      '├── AudioContext ───────────────────────┤',
      `  State       : ${ctxState}`,
      `  Sample rate : ${sampleRate} Hz`,
      `  Current time: ${currentTime} s`,
      `  Base latency: ${baseLatency}`,
      '├── Scheduler ─────────────────────────┤',
      `  Queue depth : ${queueLen}`,
      `  Tick count  : ${tickCount}`,
      '├── Master ────────────────────────────┤',
      `  Gain        : ${gainVal}`,
      '├── Channels ──────────────────────────┤',
      channelRows,
      '╚═══════════════════════════════════════╝',
    ].join('\n');

    this.el.textContent = lines;
  }
}
