/**
 * HorizontalMixer — DAW-style bottom-docked horizontal channel strip.
 *
 * Replaces the vertical ChannelMixer card list for the bottom-panel position.
 * Each sound-chip channel is rendered as a vertical strip side-by-side, matching
 * the layout of mixers in Ableton Live, FL Studio, Logic Pro X and hardware
 * consoles such as the Neve 8078 and SSL 4000.
 *
 * Features:
 *  - 12-segment animated VU meter per channel (green 1–8, yellow 9–10, red 11–12)
 *  - Peak-hold: highest lit segment lingers ~1.5 s then decays one segment at a time
 *  - Live instrument and pattern name readouts from playback:position-changed events
 *  - Volume fader (vertical slider) — disabled/greyed for Game Boy (envelope-only)
 *  - Mute / Solo buttons wired to the shared channelStates store
 *  - Resize handle at the top edge (drag to change height, persisted)
 *  - Collapse/expand toggle (persisted in localStorage)
 *  - Show/hide via the View menu or Ctrl+Shift+M
 */

import type { EventBus } from '../utils/event-bus';
import type { PlaybackPosition, PlaybackManager } from '../playback/playback-manager';
import {
  channelStates, isChannelAudible,
  toggleChannelMuted, toggleChannelSoloed, setChannelVolume,
  unmuteAll, clearAllSolo,
} from '../stores/channel.store';
import { storage, StorageKey } from '../utils/local-storage';
import { getChannelMeta } from '../utils/chip-meta';
import { icon } from '../utils/icons';

/** Chips that expose a per-channel volume register writable at runtime. */
const VOLUME_SUPPORTED_CHIPS = new Set(['nes', 'sid', 'genesis', 'snes']);

/** Number of VU-meter segments per channel strip. */
const VU_SEGMENTS = 12;
/** Segments below this index are green (0-based). */
const VU_YELLOW_THRESHOLD = 8;
/** Segments below this index are yellow (0-based). */
const VU_RED_THRESHOLD = 10;
/** Duration (ms) that peak-hold lingers before starting to decay. */
const PEAK_HOLD_MS = 1500;
/** RAF frame interval target (~30 fps). */
const RAF_INTERVAL_MS = 33;
/** Default mixer height in pixels (expanded). */
const DEFAULT_HEIGHT_PX = 200;
/** Minimum/maximum draggable mixer height. */
const MIN_HEIGHT_PX = 80;
const MAX_HEIGHT_PX = 400;

export interface HorizontalMixerOptions {
  container: HTMLElement;
  eventBus: EventBus;
  playbackManager?: PlaybackManager;
}

interface ChannelVuState {
  /** Current VU level, 0–VU_SEGMENTS. */
  level: number;
  /** Peak-hold segment index. */
  peak: number;
  /** Timestamp when the peak was last updated. */
  peakTime: number;
}

export class HorizontalMixer {
  private container: HTMLElement;
  private eventBus: EventBus;
  private playbackManager: PlaybackManager | null;

  private ast: any = null;
  private unsubscribers: Array<() => void> = [];

  private collapsed: boolean;
  private visible: boolean;
  private height: number;

  /** Per-channel VU state. Key = channel id. */
  private vuState: Map<number, ChannelVuState> = new Map();
  /** RAF handle. */
  private rafId: number | null = null;
  /** Last RAF frame timestamp. */
  private lastFrameTime = 0;

  /** Root element appended to this.container. */
  private rootEl: HTMLElement | null = null;

  constructor(options: HorizontalMixerOptions) {
    this.container = options.container;
    this.eventBus = options.eventBus;
    this.playbackManager = options.playbackManager ?? null;

    // Restore persisted state
    const rawCollapsed = storage.get(StorageKey.DAW_MIXER_COLLAPSED);
    this.collapsed = rawCollapsed === 'true';

    const rawHeight = storage.get(StorageKey.DAW_MIXER_HEIGHT);
    const parsedHeight = rawHeight ? parseInt(rawHeight, 10) : NaN;
    this.height = isNaN(parsedHeight) ? DEFAULT_HEIGHT_PX : Math.max(MIN_HEIGHT_PX, Math.min(MAX_HEIGHT_PX, parsedHeight));

    const rawVisible = storage.get(StorageKey.PANEL_VIS_DAW_MIXER);
    this.visible = rawVisible === null ? true : rawVisible === 'true';

    this.render();
    this.setupEventListeners();
    this.startRaf();
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  show(): void {
    this.visible = true;
    storage.set(StorageKey.PANEL_VIS_DAW_MIXER, 'true');
    if (this.rootEl) this.rootEl.style.display = '';
    this.startRaf();
  }

  hide(): void {
    this.visible = false;
    storage.set(StorageKey.PANEL_VIS_DAW_MIXER, 'false');
    if (this.rootEl) this.rootEl.style.display = 'none';
    this.stopRaf();
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    this.stopRaf();
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.rootEl?.remove();
    this.rootEl = null;
  }

  // ─── Chip capability ─────────────────────────────────────────────────────────

  private get activeChip(): string {
    return (this.ast?.chip ?? 'gameboy').toLowerCase();
  }

  private get volumeEnabled(): boolean {
    return VOLUME_SUPPORTED_CHIPS.has(this.activeChip);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  render(): void {
    // Remove previous root if present
    this.rootEl?.remove();
    this.rootEl = null;

    const root = document.createElement('div');
    root.className = 'bb-hmix';
    root.id = 'bb-horizontal-mixer';
    if (this.collapsed) root.classList.add('bb-hmix--collapsed');
    if (!this.visible) root.style.display = 'none';
    root.style.setProperty('--bb-hmix-height', `${this.height}px`);

    // ── Resize handle (top edge) ──────────────────────────────────────────────
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'bb-hmix__resize-handle';
    resizeHandle.title = 'Drag to resize mixer';
    this.wireResizeHandle(resizeHandle, root);
    root.appendChild(resizeHandle);

    // ── Toolbar ──────────────────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.className = 'bb-hmix__toolbar';

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'bb-hmix__toolbar-btn' + (this.collapsed ? ' bb-hmix__toolbar-btn--active' : '');
    collapseBtn.title = this.collapsed ? 'Expand mixer' : 'Collapse mixer';
    collapseBtn.setAttribute('aria-label', this.collapsed ? 'Expand mixer' : 'Collapse mixer');
    collapseBtn.innerHTML = this.collapsed ? icon('chevron-up') : icon('chevron-down');
    collapseBtn.addEventListener('click', () => this.toggleCollapse(collapseBtn, root));
    toolbar.appendChild(collapseBtn);

    const states0 = channelStates.get();
    const anyMuted0 = Object.values(states0).some(s => s.muted);
    const anySoloed0 = Object.values(states0).some(s => s.soloed);

    const unmuteBtn = document.createElement('button');
    unmuteBtn.className = 'bb-hmix__toolbar-btn';
    unmuteBtn.id = 'bb-hmix-unmute-all';
    unmuteBtn.title = 'Unmute all channels';
    unmuteBtn.disabled = !anyMuted0;
    unmuteBtn.innerHTML = icon('speaker-wave', 'w-3.5 h-3.5');
    unmuteBtn.addEventListener('click', () => unmuteAll());
    toolbar.appendChild(unmuteBtn);

    const clearSoloBtn = document.createElement('button');
    clearSoloBtn.className = 'bb-hmix__toolbar-btn';
    clearSoloBtn.id = 'bb-hmix-clear-solo';
    clearSoloBtn.title = 'Clear solo';
    clearSoloBtn.disabled = !anySoloed0;
    clearSoloBtn.innerHTML = icon('eye', 'w-3.5 h-3.5');
    clearSoloBtn.addEventListener('click', () => clearAllSolo());
    toolbar.appendChild(clearSoloBtn);

    const mixerLabel = document.createElement('span');
    mixerLabel.className = 'bb-hmix__toolbar-label';
    mixerLabel.textContent = 'MIXER';
    toolbar.appendChild(mixerLabel);

    root.appendChild(toolbar);

    // ── Channel strips ────────────────────────────────────────────────────────
    const strips = document.createElement('div');
    strips.className = 'bb-hmix__strips';

    const channels = this.ast?.channels ?? [];
    if (channels.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'bb-hmix__empty';
      empty.textContent = 'No channels defined — parse a song to see channels';
      strips.appendChild(empty);
    } else {
      for (const ch of channels) {
        this.vuState.set(ch.id, { level: 0, peak: 0, peakTime: 0 });
        strips.appendChild(this.buildStrip(ch));
      }
    }

    root.appendChild(strips);

    this.container.appendChild(root);
    this.rootEl = root;
  }

  private buildStrip(ch: any): HTMLElement {
    const meta = getChannelMeta(this.activeChip, ch.id as number);
    const info = channelStates.get()[ch.id];
    const isMuted = info?.muted ?? false;
    const isSoloed = info?.soloed ?? false;
    const isAudible = isChannelAudible(channelStates.get(), ch.id);
    const defaultInstName = this.getInstrumentName(ch);

    const strip = document.createElement('div');
    strip.className = 'bb-hmix__strip' + (!isAudible ? ' bb-hmix__strip--silent' : '');
    strip.id = `bb-hmix-strip-${ch.id}`;
    strip.dataset.channel = String(ch.id);

    // ── Colour accent bar (top) ───────────────────────────────────────────────
    const accent = document.createElement('div');
    accent.className = 'bb-hmix__accent';
    accent.style.background = meta.color;
    strip.appendChild(accent);

    // ── Channel label ─────────────────────────────────────────────────────────
    const label = document.createElement('div');
    label.className = 'bb-hmix__label';
    label.textContent = meta.label.toUpperCase();
    label.style.color = meta.color;
    strip.appendChild(label);

    // ── VU meter ──────────────────────────────────────────────────────────────
    const vu = document.createElement('div');
    vu.className = 'bb-hmix__vu';
    vu.id = `bb-hmix-vu-${ch.id}`;
    // Segments are rendered bottom-to-top (flex-column-reverse)
    for (let i = VU_SEGMENTS - 1; i >= 0; i--) {
      const seg = document.createElement('div');
      seg.className = 'bb-hmix__vu-seg';
      if (i >= VU_RED_THRESHOLD) {
        seg.classList.add('bb-hmix__vu-seg--red');
      } else if (i >= VU_YELLOW_THRESHOLD) {
        seg.classList.add('bb-hmix__vu-seg--yellow');
      } else {
        seg.classList.add('bb-hmix__vu-seg--green');
      }
      vu.appendChild(seg);
    }
    strip.appendChild(vu);

    // ── Info block (instrument + pattern) ─────────────────────────────────────
    const info2 = document.createElement('div');
    info2.className = 'bb-hmix__info';

    const instEl = document.createElement('div');
    instEl.className = 'bb-hmix__inst';
    instEl.id = `bb-hmix-inst-${ch.id}`;
    instEl.dataset.defaultInst = defaultInstName;
    instEl.textContent = defaultInstName;
    instEl.title = `Instrument: ${defaultInstName}`;
    info2.appendChild(instEl);

    const patEl = document.createElement('div');
    patEl.className = 'bb-hmix__pat';
    patEl.id = `bb-hmix-pat-${ch.id}`;
    patEl.textContent = '—';
    info2.appendChild(patEl);

    strip.appendChild(info2);

    // ── Volume fader (vertical slider) ────────────────────────────────────────
    const faderWrap = document.createElement('div');
    faderWrap.className = 'bb-hmix__fader-wrap' + (!this.volumeEnabled ? ' bb-hmix__fader-wrap--disabled' : '');

    const fader = document.createElement('input');
    fader.type = 'range';
    fader.className = 'bb-hmix__fader';
    fader.id = `bb-hmix-fader-${ch.id}`;
    fader.min = '0';
    fader.max = '100';
    fader.step = '1';
    fader.value = String(Math.round((info?.volume ?? 1) * 100));
    (fader as any).orient = 'vertical'; // Firefox non-standard attribute
    fader.setAttribute('orient', 'vertical');
    fader.disabled = !this.volumeEnabled;

    if (!this.volumeEnabled) {
      const chipName = this.activeChip.charAt(0).toUpperCase() + this.activeChip.slice(1);
      const tooltip = `${chipName} uses envelope-driven amplitude — no per-channel volume available`;
      fader.title = tooltip;
      faderWrap.title = tooltip;
    } else {
      fader.addEventListener('input', () => {
        setChannelVolume(ch.id, parseInt(fader.value, 10) / 100);
      });
    }
    faderWrap.appendChild(fader);
    strip.appendChild(faderWrap);

    // ── Mute / Solo buttons ───────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.className = 'bb-hmix__btn-row';

    const muteBtn = document.createElement('button');
    muteBtn.className = 'bb-cp__btn bb-cp__btn--mute';
    muteBtn.id = `bb-hmix-mute-${ch.id}`;
    this.applyMuteStyle(muteBtn, isMuted);
    muteBtn.addEventListener('click', () => toggleChannelMuted(ch.id));

    const soloBtn = document.createElement('button');
    soloBtn.className = 'bb-cp__btn bb-cp__btn--solo';
    soloBtn.id = `bb-hmix-solo-${ch.id}`;
    this.applySoloStyle(soloBtn, isSoloed);
    soloBtn.addEventListener('click', () => toggleChannelSoloed(ch.id));

    btnRow.appendChild(muteBtn);
    btnRow.appendChild(soloBtn);
    strip.appendChild(btnRow);

    return strip;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private getInstrumentName(ch: any): string {
    const instNode = ch.inst ?? ch.instrument;
    if (typeof instNode === 'string') return instNode;
    if (instNode && typeof instNode === 'object') {
      return instNode.name ?? instNode.id ?? `Ch${ch.id}`;
    }
    return `Ch${ch.id}`;
  }

  private applyMuteStyle(btn: HTMLButtonElement, muted: boolean): void {
    btn.textContent = 'M';
    btn.title = muted ? 'Unmute channel' : 'Mute channel';
    btn.setAttribute('aria-pressed', String(muted));
    btn.classList.toggle('bb-cp__btn--active', muted);
  }

  private applySoloStyle(btn: HTMLButtonElement, soloed: boolean): void {
    btn.textContent = 'S';
    btn.title = soloed ? 'Unsolo channel' : 'Solo channel';
    btn.setAttribute('aria-pressed', String(soloed));
    btn.classList.toggle('bb-cp__btn--active', soloed);
  }

  private toggleCollapse(btn: HTMLButtonElement, root: HTMLElement): void {
    this.collapsed = !this.collapsed;
    root.classList.toggle('bb-hmix--collapsed', this.collapsed);
    btn.classList.toggle('bb-hmix__toolbar-btn--active', this.collapsed);
    btn.title = this.collapsed ? 'Expand mixer' : 'Collapse mixer';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = this.collapsed ? icon('chevron-up') : icon('chevron-down');
    storage.set(StorageKey.DAW_MIXER_COLLAPSED, String(this.collapsed));
  }

  // ─── Resize handle ──────────────────────────────────────────────────────────

  private wireResizeHandle(handle: HTMLElement, root: HTMLElement): void {
    let startY = 0;
    let startHeight = 0;

    const onMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(MIN_HEIGHT_PX, Math.min(MAX_HEIGHT_PX, startHeight + delta));
      this.height = newHeight;
      root.style.setProperty('--bb-hmix-height', `${newHeight}px`);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      storage.set(StorageKey.DAW_MIXER_HEIGHT, String(this.height));
    };

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = this.height;
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // ─── Event subscriptions ─────────────────────────────────────────────────────

  private setupEventListeners(): void {
    this.unsubscribers.push(
      this.eventBus.on('parse:success', ({ ast }) => {
        const needsRerender = this.hasChannelStructureChanged(ast);
        this.ast = ast;
        if (needsRerender) this.render();
      }),

      this.eventBus.on('song:loaded', () => {
        this.ast = null;
      }),

      this.eventBus.on('playback:position-changed', ({ channelId, position }) => {
        this.updatePosition(channelId, position);
        // Feed VU level from position progress (0→1 mapped to 0→VU_SEGMENTS)
        const vuLevel = Math.round(position.progress * VU_SEGMENTS);
        this.updateVuLevel(channelId, vuLevel);
      }),

      this.eventBus.on('playback:channel-waveform', ({ channelId, samples }) => {
        // Compute RMS from waveform samples and map to VU segments
        const rms = computeRms(samples);
        // Map 0–1 RMS to 0–VU_SEGMENTS (with a non-linear curve)
        const level = Math.round(Math.sqrt(rms) * VU_SEGMENTS);
        this.updateVuLevel(channelId, level);
      }),

      this.eventBus.on('playback:stopped', () => {
        this.resetAllChannels();
        // Fade VU meters to zero
        for (const state of this.vuState.values()) {
          state.level = 0;
          state.peak = 0;
          state.peakTime = 0;
        }
      }),

      this.eventBus.on('playback:paused', () => {
        // Let VU meters decay naturally via RAF loop
      }),

      this.eventBus.on('playback:resumed', () => {
        // RAF loop is still running; no action needed
      }),

      // Subscribe to channel store for mute/solo/volume changes
      channelStates.subscribe((states) => {
        const anyMuted = Object.values(states).some(s => s.muted);
        const anySoloed = Object.values(states).some(s => s.soloed);

        const unmuteAllBtn = document.getElementById('bb-hmix-unmute-all') as HTMLButtonElement | null;
        if (unmuteAllBtn) unmuteAllBtn.disabled = !anyMuted;
        const clearSoloAllBtn = document.getElementById('bb-hmix-clear-solo') as HTMLButtonElement | null;
        if (clearSoloAllBtn) clearSoloAllBtn.disabled = !anySoloed;

        for (const [id, info] of Object.entries(states)) {
          const channelId = Number(id);
          const muteBtn = document.getElementById(`bb-hmix-mute-${channelId}`) as HTMLButtonElement | null;
          if (muteBtn) this.applyMuteStyle(muteBtn, info.muted);
          const soloBtn = document.getElementById(`bb-hmix-solo-${channelId}`) as HTMLButtonElement | null;
          if (soloBtn) this.applySoloStyle(soloBtn, info.soloed);
          this.updateAudibilityVisual(channelId);
        }
      }),
    );
  }

  private hasChannelStructureChanged(newAst: any): boolean {
    if (!this.ast) return true;
    if ((this.ast.chip ?? 'gameboy') !== (newAst.chip ?? 'gameboy')) return true;
    if (!this.ast.channels && !newAst.channels) return false;
    if (!this.ast.channels || !newAst.channels) return true;
    if (this.ast.channels.length !== newAst.channels.length) return true;
    const oldIds = this.ast.channels.map((c: any) => c.id).sort();
    const newIds = newAst.channels.map((c: any) => c.id).sort();
    return oldIds.some((id: number, i: number) => id !== newIds[i]);
  }

  // ─── Real-time updates ───────────────────────────────────────────────────────

  private updatePosition(channelId: number, position: PlaybackPosition): void {
    const instEl = document.getElementById(`bb-hmix-inst-${channelId}`);
    if (instEl && position.currentInstrument) {
      instEl.textContent = position.currentInstrument;
      instEl.title = `Instrument: ${position.currentInstrument}`;
    }

    const patEl = document.getElementById(`bb-hmix-pat-${channelId}`);
    if (patEl) {
      const parts: string[] = [];
      if (position.sourceSequence) parts.push(position.sourceSequence);
      if (position.currentPattern) {
        parts.push(position.currentPattern);
      } else if (position.barNumber != null) {
        parts.push(`Bar ${position.barNumber + 1}`);
      }
      patEl.textContent = parts.length > 0 ? parts.join(' • ') : '—';
    }
  }

  private resetAllChannels(): void {
    const channels = this.ast?.channels ?? [];
    for (const ch of channels) {
      const instEl = document.getElementById(`bb-hmix-inst-${ch.id}`);
      if (instEl) {
        const defaultInst = instEl.dataset.defaultInst ?? `Ch${ch.id}`;
        instEl.textContent = defaultInst;
        instEl.title = `Instrument: ${defaultInst}`;
      }
      const patEl = document.getElementById(`bb-hmix-pat-${ch.id}`);
      if (patEl) patEl.textContent = '—';
    }
  }

  private updateAudibilityVisual(channelId: number): void {
    const strip = document.getElementById(`bb-hmix-strip-${channelId}`);
    if (strip) strip.classList.toggle('bb-hmix__strip--silent', !isChannelAudible(channelStates.get(), channelId));
  }

  // ─── VU meter ────────────────────────────────────────────────────────────────

  private updateVuLevel(channelId: number, level: number): void {
    let state = this.vuState.get(channelId);
    if (!state) {
      state = { level: 0, peak: 0, peakTime: 0 };
      this.vuState.set(channelId, state);
    }
    const clamped = Math.max(0, Math.min(VU_SEGMENTS, level));
    state.level = clamped;
    if (clamped >= state.peak) {
      state.peak = clamped;
      state.peakTime = Date.now();
    }
  }

  // ─── RAF loop ────────────────────────────────────────────────────────────────

  private startRaf(): void {
    if (this.rafId !== null) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    const loop = (timestamp: number) => {
      if (!this.visible) {
        this.rafId = null;
        return;
      }
      if (timestamp - this.lastFrameTime >= RAF_INTERVAL_MS) {
        this.lastFrameTime = timestamp;
        this.drawVuMeters();
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.rafId as number);
      }
      this.rafId = null;
    }
  }

  private drawVuMeters(): void {
    const now = Date.now();
    for (const [channelId, state] of this.vuState.entries()) {
      // Decay peak-hold after PEAK_HOLD_MS
      if (state.peak > 0 && now - state.peakTime > PEAK_HOLD_MS) {
        state.peak = Math.max(0, state.peak - 1);
        // Reset hold time so next decay step fires after another interval
        if (state.peak > 0) state.peakTime = now;
      }

      // Naturally decay level (faster than peak)
      if (state.level > 0) {
        state.level = Math.max(0, state.level - 1);
      }

      const vuEl = document.getElementById(`bb-hmix-vu-${channelId}`);
      if (!vuEl) continue;

      const segs = vuEl.querySelectorAll<HTMLElement>('.bb-hmix__vu-seg');
      // segs are rendered in DOM order top-to-bottom (highest segment index first
      // because we iterate VU_SEGMENTS-1 down to 0 during buildStrip).
      // seg[0] = segment index VU_SEGMENTS-1 (top), seg[VU_SEGMENTS-1] = index 0 (bottom).
      for (let domIdx = 0; domIdx < segs.length; domIdx++) {
        const segIdx = VU_SEGMENTS - 1 - domIdx; // actual 0-based segment number
        const seg = segs[domIdx];
        const isLit = segIdx < state.level;
        const isPeak = segIdx === state.peak - 1 && state.peak > 0;
        seg.classList.toggle('bb-hmix__vu-seg--lit', isLit);
        seg.classList.toggle('bb-hmix__vu-seg--peak', isPeak && !isLit);
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeRms(samples: Float32Array): number {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}
