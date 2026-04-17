import type { EventBus } from '../utils/event-bus';
import type { PlaybackPosition, PlaybackManager } from '../playback/playback-manager';
import {
  channelStates,
  isChannelAudible,
  toggleChannelMuted,
  toggleChannelSoloed,
  unmuteAll,
  clearAllSolo,
} from '../stores/channel.store';
import { createLogger, getLoggingConfig } from '@beatbax/engine/util/logger';
import { icon } from '../utils/icons';
import { storage, StorageKey } from '../utils/local-storage';
import { settingFeaturePerChannelAnalyser } from '../stores/settings.store';
import { getChannelMeta } from '../utils/chip-meta';

const log = createLogger('ui:song-visualizer');

type BgEffectId = 'none' | 'starfield' | 'scanlines' | 'custom-image';
type VizLayout = 'horizontal' | 'vertical';

interface BgEffect {
  id: Exclude<BgEffectId, 'none' | 'custom-image'>;
  init(canvas: HTMLCanvasElement): void;
  draw(canvas: HTMLCanvasElement, rmsValues: Map<number, number>): void;
  dispose(): void;
}

const BG_EFFECTS: BgEffect[] = [
  {
    id: 'starfield',
    init(canvas) {
      const stars = Array.from({ length: 120 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: 0.2 + Math.random() * 1.2,
      }));
      (canvas as any).__bbStars = stars;
    },
    draw(canvas, rmsValues) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const stars = ((canvas as any).__bbStars as Array<{ x: number; y: number; z: number }>) ?? [];
      const avgRms = rmsValues.size > 0
        ? Array.from(rmsValues.values()).reduce((a, b) => a + b, 0) / rmsValues.size
        : 0;
      const brightness = Math.min(1, 0.2 + avgRms * 1.8);
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.y += s.z;
        if (s.y > canvas.height) {
          s.y = 0;
          s.x = Math.random() * canvas.width;
        }
        ctx.fillStyle = `rgba(180,220,255,${Math.min(1, brightness * (0.22 + s.z * 0.35))})`;
        ctx.fillRect(s.x, s.y, Math.max(1, s.z), Math.max(1, s.z));
      }
    },
    dispose() {
      // no-op
    },
  },
  {
    id: 'scanlines',
    init() {
      // no-op
    },
    draw(canvas) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      for (let y = 0; y < canvas.height; y += 4) {
        ctx.fillRect(0, y, canvas.width, 1);
      }
    },
    dispose() {
      // no-op
    },
  },
];

export interface SongVisualizerOptions {
  container: HTMLElement;
  eventBus: EventBus;
  playbackManager?: PlaybackManager;
}

export class SongVisualizer {
  private container: HTMLElement;
  private eventBus: EventBus;
  private playbackManager: PlaybackManager | null;
  private ast: any = null;
  private unsubscribers: Array<() => void> = [];
  private levelTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private channelWaveforms: Map<number, Float32Array> = new Map();
  private analyserEnabled = false;
  private bgEffectId: BgEffectId = 'none';
  private layoutMode: VizLayout = 'horizontal';
  private bgImageData = '';
  private bgImage: HTMLImageElement | null = null;
  private activeBgEffect: BgEffect | null = null;
  private bgRafId: number | null = null;
  private performanceMode = false;

  constructor(options: SongVisualizerOptions) {
    this.container = options.container;
    this.eventBus = options.eventBus;
    this.playbackManager = options.playbackManager ?? null;
    this.analyserEnabled = settingFeaturePerChannelAnalyser.get();
    this.refreshSettingsFromStorage();
    this.render();
    this.setupEventListeners();
  }

  private refreshSettingsFromStorage(): void {
    const savedEffect = storage.get(StorageKey.VIZ_BG_EFFECT, 'none');
    this.bgEffectId = (savedEffect === 'starfield' || savedEffect === 'scanlines' || savedEffect === 'custom-image')
      ? savedEffect
      : 'none';

    const savedLayout = storage.get(StorageKey.VIZ_LAYOUT, 'horizontal');
    this.layoutMode = savedLayout === 'vertical' ? 'vertical' : 'horizontal';

    this.bgImageData = storage.get(StorageKey.VIZ_BG_IMAGE, '') ?? '';
    if (!this.bgImageData) {
      this.bgImage = null;
      if (this.bgEffectId === 'custom-image') this.bgEffectId = 'none';
      return;
    }
    const img = new Image();
    img.src = this.bgImageData;
    this.bgImage = img;
  }

  private get activeChip(): string {
    return (this.ast?.chip ?? 'gameboy').toLowerCase();
  }

  private get isPerformanceMode(): boolean {
    return this.performanceMode;
  }

  render(): void {
    this.stopBgLoop();
    this.container.innerHTML = '';
    this.applyRightPaneConstraints();

    const root = document.createElement('div');
    root.className = [
      'bb-viz',
      this.isPerformanceMode ? 'bb-viz--fullscreen' : '',
      this.layoutMode === 'vertical' ? 'bb-viz--layout-vertical' : 'bb-viz--layout-horizontal',
    ].filter(Boolean).join(' ');
    root.id = 'bb-viz-root';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Song Visualizer');

    const toolbar = document.createElement('div');
    toolbar.className = 'bb-viz__toolbar';

    const unmuteBtn = document.createElement('button');
    unmuteBtn.type = 'button';
    unmuteBtn.className = 'bb-viz__toolbar-btn';
    unmuteBtn.id = 'bb-viz-unmute-all';
    unmuteBtn.title = 'Unmute all channels';
    unmuteBtn.disabled = !Object.values(channelStates.get()).some(s => s.muted);
    unmuteBtn.innerHTML = icon('speaker-wave', 'w-3.5 h-3.5');
    unmuteBtn.addEventListener('click', () => unmuteAll());

    const clearSoloBtn = document.createElement('button');
    clearSoloBtn.type = 'button';
    clearSoloBtn.className = 'bb-viz__toolbar-btn';
    clearSoloBtn.id = 'bb-viz-clear-solo';
    clearSoloBtn.title = 'Clear solo';
    clearSoloBtn.disabled = !Object.values(channelStates.get()).some(s => s.soloed);
    clearSoloBtn.innerHTML = icon('eye', 'w-3.5 h-3.5');
    clearSoloBtn.addEventListener('click', () => clearAllSolo());

    const performanceBtn = document.createElement('button');
    performanceBtn.type = 'button';
    performanceBtn.className = 'bb-viz__toolbar-btn';
    performanceBtn.id = 'bb-viz-fullscreen';
    performanceBtn.title = this.isPerformanceMode ? 'Exit performance mode' : 'Enter performance mode';
    performanceBtn.innerHTML = this.isPerformanceMode ? icon('arrows-pointing-in') : icon('arrows-pointing-out');
    performanceBtn.addEventListener('click', () => {
      this.performanceMode = !this.performanceMode;
      this.render();
    });

    toolbar.appendChild(unmuteBtn);
    toolbar.appendChild(clearSoloBtn);
    toolbar.appendChild(performanceBtn);
    root.appendChild(toolbar);

    const bgCanvas = document.createElement('canvas');
    bgCanvas.id = 'bb-viz-bg';
    bgCanvas.className = this.isPerformanceMode && this.bgEffectId !== 'none' ? '' : 'bb-viz__bg-hidden';
    root.appendChild(bgCanvas);

    const channelsWrap = document.createElement('div');
    channelsWrap.className = [
      'bb-viz__channels',
      this.layoutMode === 'vertical' ? 'bb-viz__channels--vertical' : 'bb-viz__channels--horizontal',
    ].join(' ');

    const channels = this.ast?.channels ?? [];
    if (channels.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'bb-viz__empty';
      emptyMsg.textContent = 'No channels defined';
      channelsWrap.appendChild(emptyMsg);
    } else {
      for (const ch of channels) channelsWrap.appendChild(this.buildCard(ch));
    }

    root.appendChild(channelsWrap);

    if (this.isPerformanceMode) {
      const exitBtn = document.createElement('button');
      exitBtn.className = 'bb-viz__exit-btn';
      exitBtn.id = 'bb-viz-exit';
      exitBtn.innerHTML = `${icon('x-mark', 'w-3.5 h-3.5')} Exit`;
      exitBtn.addEventListener('click', () => {
        this.performanceMode = false;
        this.render();
      });
      root.appendChild(exitBtn);
    }

    this.container.appendChild(root);
    this.syncCanvasResolution();
    this.refreshBgEffect();
  }

  private applyRightPaneConstraints(): void {
    const rightPane = document.getElementById('right-pane');
    if (rightPane && !this.performanceMode) {
      rightPane.style.minWidth = '300px';
    }
    if (rightPane) {
      const mainContainer = rightPane.parentElement;
      const leftPane = mainContainer?.children?.[0] as HTMLElement | undefined;
      const splitter = mainContainer?.children?.[1] as HTMLElement | undefined;
      if (this.performanceMode) {
        if (leftPane) {
          leftPane.dataset.prevDisplay = leftPane.style.display;
          leftPane.style.display = 'none';
        }
        if (splitter) {
          splitter.dataset.prevDisplay = splitter.style.display;
          splitter.style.display = 'none';
        }
      } else {
        if (leftPane) leftPane.style.display = leftPane.dataset.prevDisplay ?? '';
        if (splitter) splitter.style.display = splitter.dataset.prevDisplay ?? '';
      }
    }

    document.body.classList.toggle('bb-viz-wide-mode', this.performanceMode);
    window.dispatchEvent(new Event('resize'));
  }

  private buildCard(ch: any): HTMLElement {
    const meta = getChannelMeta(this.activeChip, ch.id as number);
    const info = channelStates.get()[ch.id];
    const isMuted = info?.muted ?? false;
    const isSoloed = info?.soloed ?? false;
    const isAudible = isChannelAudible(channelStates.get(), ch.id);
    const defaultInstName = this.getInstrumentName(ch);

    const card = document.createElement('div');
    card.className = 'bb-viz__card' + (!isAudible ? ' bb-viz__card--silent' : '');
    card.id = `bb-viz-card-${ch.id}`;
    card.dataset.channel = String(ch.id);

    const header = document.createElement('div');
    header.className = 'bb-viz__card-header';

    const levelBar = document.createElement('div');
    levelBar.className = 'bb-viz__level-bar';
    levelBar.id = `bb-viz-level-${ch.id}`;
    levelBar.style.background = meta.color;
    levelBar.style.opacity = '0.35';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'bb-viz__title-block';

    const channelTitle = document.createElement('span');
    channelTitle.className = 'bb-viz__channel-title';
    channelTitle.textContent = `Channel ${ch.id}`;

    const chipLabel = document.createElement('span');
    chipLabel.className = 'bb-viz__chip-label';
    chipLabel.textContent = meta.label;
    chipLabel.style.color = meta.color;

    titleBlock.appendChild(channelTitle);
    titleBlock.appendChild(chipLabel);

    const right = document.createElement('div');
    right.className = 'bb-viz__header-right';

    const instEl = document.createElement('div');
    instEl.className = 'bb-viz__inst';
    instEl.id = `bb-viz-inst-${ch.id}`;
    instEl.dataset.defaultInst = defaultInstName;
    instEl.textContent = `${defaultInstName}`;

    const patternEl = document.createElement('div');
    patternEl.className = 'bb-viz__pattern';
    patternEl.id = `bb-viz-pattern-${ch.id}`;

    const waveCanvas = document.createElement('canvas');
    waveCanvas.className = 'bb-viz__wave-canvas';
    waveCanvas.id = `bb-viz-wave-${ch.id}`;
    waveCanvas.width = 320;
    waveCanvas.height = this.isPerformanceMode ? 220 : 80;

    right.appendChild(instEl);
    right.appendChild(patternEl);
    right.appendChild(waveCanvas);

    header.appendChild(levelBar);
    header.appendChild(titleBlock);
    header.appendChild(right);
    card.appendChild(header);

    const progressWrap = document.createElement('div');
    progressWrap.className = 'bb-viz__progress-wrap';
    const progressFill = document.createElement('div');
    progressFill.className = 'bb-viz__progress-fill';
    progressFill.id = `bb-viz-progress-${ch.id}`;
    progressWrap.appendChild(progressFill);
    card.appendChild(progressWrap);

    const loggingCfg = getLoggingConfig();
    const showDebug = loggingCfg.level === 'debug' && (!loggingCfg.modules || loggingCfg.modules.includes('ui:song-visualizer'));
    const positionEl = document.createElement('div');
    positionEl.className = 'bb-viz__position';
    positionEl.id = `bb-viz-pos-${ch.id}`;
    positionEl.textContent = '0/0';
    positionEl.style.display = showDebug ? 'block' : 'none';
    card.appendChild(positionEl);

    const ctrlRow = document.createElement('div');
    ctrlRow.className = 'bb-viz__ctrl-row';

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'bb-viz__btn bb-viz__btn--mute';
    muteBtn.id = `bb-viz-mute-${ch.id}`;
    this.applyMuteStyle(muteBtn, isMuted);
    muteBtn.addEventListener('click', () => toggleChannelMuted(ch.id));

    const soloBtn = document.createElement('button');
    soloBtn.type = 'button';
    soloBtn.className = 'bb-viz__btn bb-viz__btn--solo';
    soloBtn.id = `bb-viz-solo-${ch.id}`;
    this.applySoloStyle(soloBtn, isSoloed);
    soloBtn.addEventListener('click', () => toggleChannelSoloed(ch.id));

    ctrlRow.appendChild(muteBtn);
    ctrlRow.appendChild(soloBtn);
    card.appendChild(ctrlRow);

    return card;
  }

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
        this.pulse(channelId, !this.analyserEnabled);
      }),
      this.eventBus.on('playback:stopped', () => {
        this.resetAllChannels();
        this.clearAllLevels();
        this.channelWaveforms.clear();
      }),
      this.eventBus.on('playback:channel-waveform', ({ channelId, samples }) => {
        this.channelWaveforms.set(channelId, samples);
        this.drawAnalyserWaveform(channelId, samples);
      }),
      this.eventBus.on('song-visualizer:settings-changed', () => {
        this.refreshSettingsFromStorage();
        this.render();
      }),
      settingFeaturePerChannelAnalyser.subscribe((val) => {
        if (val === this.analyserEnabled) return;
        this.analyserEnabled = val;
        if (this.playbackManager) this.playbackManager.setPerChannelAnalyser(val);
        if (!val) this.channelWaveforms.clear();
      }),
      channelStates.subscribe((states) => {
        const anyMuted = Object.values(states).some(s => s.muted);
        const anySoloed = Object.values(states).some(s => s.soloed);
        const unmuteAllBtn = document.getElementById('bb-viz-unmute-all') as HTMLButtonElement | null;
        if (unmuteAllBtn) unmuteAllBtn.disabled = !anyMuted;
        const clearSoloAllBtn = document.getElementById('bb-viz-clear-solo') as HTMLButtonElement | null;
        if (clearSoloAllBtn) clearSoloAllBtn.disabled = !anySoloed;
        for (const [id, info] of Object.entries(states)) {
          const channelId = Number(id);
          const muteBtn = document.getElementById(`bb-viz-mute-${channelId}`) as HTMLButtonElement | null;
          if (muteBtn) this.applyMuteStyle(muteBtn, info.muted);
          const soloBtn = document.getElementById(`bb-viz-solo-${channelId}`) as HTMLButtonElement | null;
          if (soloBtn) this.applySoloStyle(soloBtn, info.soloed);
          this.updateAudibilityVisual(channelId);
        }
      }),
    );

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.performanceMode) {
        this.performanceMode = false;
        this.render();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    this.unsubscribers.push(() => window.removeEventListener('keydown', onKeyDown));
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

  private updateAudibilityVisual(channelId: number): void {
    const isAudible = isChannelAudible(channelStates.get(), channelId);
    const card = document.getElementById(`bb-viz-card-${channelId}`);
    if (card) card.classList.toggle('bb-viz__card--silent', !isAudible);
    const levelBar = document.getElementById(`bb-viz-level-${channelId}`);
    if (levelBar) levelBar.style.opacity = isAudible ? '0.35' : '0.15';
  }

  private updatePosition(channelId: number, position: PlaybackPosition): void {
    const instEl = document.getElementById(`bb-viz-inst-${channelId}`);
    if (instEl && position.currentInstrument) {
      instEl.textContent = `${position.currentInstrument}`;
      instEl.style.color = '#4affaf';
    }

    const patternEl = document.getElementById(`bb-viz-pattern-${channelId}`);
    if (patternEl) {
      const parts: string[] = [];
      if (position.sourceSequence) parts.push(position.sourceSequence);
      if (position.currentPattern) parts.push(position.currentPattern);
      else if (position.barNumber != null) parts.push(`Bar ${position.barNumber + 1}`);
      patternEl.textContent = parts.length > 0 ? parts.join(' • ') : '—';
      patternEl.style.color = '#9cdcfe';
    }

    const progressFill = document.getElementById(`bb-viz-progress-${channelId}`);
    if (progressFill) progressFill.style.width = `${Math.round(position.progress * 100)}%`;

    const positionEl = document.getElementById(`bb-viz-pos-${channelId}`);
    if (positionEl) positionEl.textContent = `${position.eventIndex + 1}/${position.totalEvents}`;
  }

  private resetAllChannels(): void {
    const channels = this.ast?.channels ?? [];
    for (const ch of channels) {
      const instEl = document.getElementById(`bb-viz-inst-${ch.id}`);
      if (instEl) {
        instEl.textContent = `${instEl.dataset.defaultInst ?? `Ch${ch.id}`}`;
        instEl.style.color = '#4a9eff';
      }
      const patternEl = document.getElementById(`bb-viz-pattern-${ch.id}`);
      if (patternEl) patternEl.textContent = '';
      const progressFill = document.getElementById(`bb-viz-progress-${ch.id}`);
      if (progressFill) progressFill.style.width = '0%';
      const positionEl = document.getElementById(`bb-viz-pos-${ch.id}`);
      if (positionEl) positionEl.textContent = '0/0';
      const canvas = document.getElementById(`bb-viz-wave-${ch.id}`) as HTMLCanvasElement | null;
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  private pulse(channelId: number, drawSynthetic = true): void {
    const bar = document.getElementById(`bb-viz-level-${channelId}`);
    if (!bar) return;
    const color = getChannelMeta(this.activeChip, channelId).color;
    bar.style.boxShadow = `0 0 6px 2px ${color}`;
    bar.style.opacity = '1';
    clearTimeout(this.levelTimers.get(channelId));
    this.levelTimers.set(channelId, setTimeout(() => {
      bar.style.boxShadow = 'none';
      bar.style.opacity = isChannelAudible(channelStates.get(), channelId) ? '0.35' : '0.15';
    }, 120));

    if (!drawSynthetic) return;

    const canvas = document.getElementById(`bb-viz-wave-${channelId}`) as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = getChannelMeta(this.activeChip, channelId).color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const pts: Array<{ x: number; y: number }> = [];
    if (channelId === 3) {
      for (let x = 0; x < w; x += 3) {
        const t = (x / w) * Math.PI * 4;
        pts.push({ x, y: h / 2 + Math.sin(t) * (h / 3) });
      }
    } else if (channelId === 4) {
      for (let x = 0; x < w; x += 3) {
        pts.push({ x, y: h / 2 + (Math.random() - 0.5) * h * 0.75 });
      }
    } else {
      const period = Math.max(10, Math.floor(w / 6));
      for (let x = 0; x < w; x += 3) {
        const phase = Math.floor(x / period) % 2;
        pts.push({ x, y: phase ? h * 0.28 : h * 0.72 });
      }
    }

    ctx.beginPath();
    if (pts.length > 0) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const cx = (prev.x + curr.x) / 2;
        const cy = (prev.y + curr.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, cx, cy);
      }
    }
    ctx.stroke();
  }

  private drawAnalyserWaveform(channelId: number, samples: Float32Array): void {
    const canvas = document.getElementById(`bb-viz-wave-${channelId}`) as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (samples.length === 0) return;

    const color = getChannelMeta(this.activeChip, channelId).color;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const sampleIdx = Math.min(Math.floor((x / w) * samples.length), samples.length - 1);
      const y = (h / 2) * (1 - samples[sampleIdx]);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private clearAllLevels(): void {
    for (const ch of this.levelTimers.keys()) {
      clearTimeout(this.levelTimers.get(ch));
      const bar = document.getElementById(`bb-viz-level-${ch}`);
      if (bar) {
        bar.style.boxShadow = 'none';
        bar.style.opacity = '0.35';
      }
    }
    this.levelTimers.clear();
  }

  private applyMuteStyle(btn: HTMLButtonElement, muted: boolean): void {
    btn.innerHTML = muted
      ? icon('speaker-x-mark', 'w-3.5 h-3.5')
      : icon('speaker-wave', 'w-3.5 h-3.5');
    btn.title = muted ? 'Unmute channel' : 'Mute channel';
    btn.setAttribute('aria-pressed', String(muted));
    btn.classList.toggle('bb-viz__btn--active', muted);
  }

  private applySoloStyle(btn: HTMLButtonElement, soloed: boolean): void {
    btn.innerHTML = icon('eye', 'w-3.5 h-3.5');
    btn.title = soloed ? 'Remove solo' : 'Solo this channel';
    btn.setAttribute('aria-pressed', String(soloed));
    btn.classList.toggle('bb-viz__btn--active', soloed);
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

  private syncCanvasResolution(): void {
    const canvases = this.container.querySelectorAll<HTMLCanvasElement>('.bb-viz__wave-canvas');
    for (const canvas of Array.from(canvases)) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = Math.max(1, Math.floor(rect.width));
        canvas.height = Math.max(1, Math.floor(rect.height));
      }
    }

    const bg = this.container.querySelector<HTMLCanvasElement>('#bb-viz-bg');
    if (bg) {
      const rect = bg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        bg.width = Math.max(1, Math.floor(rect.width));
        bg.height = Math.max(1, Math.floor(rect.height));
      }
    }
  }

  private refreshBgEffect(): void {
    if (!this.isPerformanceMode || this.bgEffectId === 'none') {
      this.activeBgEffect?.dispose();
      this.activeBgEffect = null;
      return;
    }

    const bgCanvas = this.container.querySelector<HTMLCanvasElement>('#bb-viz-bg');
    if (!bgCanvas) return;

    if (this.bgEffectId === 'custom-image') {
      this.startBgLoop();
      return;
    }

    const effect = BG_EFFECTS.find(e => e.id === this.bgEffectId) ?? null;
    if (!effect) return;

    this.activeBgEffect?.dispose();
    this.activeBgEffect = effect;
    effect.init(bgCanvas);
    this.startBgLoop();
  }

  private drawCustomBackground(bgCanvas: HTMLCanvasElement): void {
    if (!this.bgImage || !this.bgImage.complete) return;
    const ctx = bgCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

    const img = this.bgImage;
    const canvasRatio = bgCanvas.width / bgCanvas.height;
    const imgRatio = img.width / img.height;

    let drawWidth = bgCanvas.width;
    let drawHeight = bgCanvas.height;
    let offsetX = 0;
    let offsetY = 0;

    if (imgRatio > canvasRatio) {
      drawHeight = bgCanvas.height;
      drawWidth = drawHeight * imgRatio;
      offsetX = (bgCanvas.width - drawWidth) / 2;
    } else {
      drawWidth = bgCanvas.width;
      drawHeight = drawWidth / imgRatio;
      offsetY = (bgCanvas.height - drawHeight) / 2;
    }

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  private startBgLoop(): void {
    if (this.bgRafId !== null) return;
    const tick = () => {
      const bgCanvas = this.container.querySelector<HTMLCanvasElement>('#bb-viz-bg');
      if (!bgCanvas || !this.isPerformanceMode) {
        this.bgRafId = null;
        return;
      }

      if (this.bgEffectId === 'custom-image') {
        this.drawCustomBackground(bgCanvas);
      } else if (this.activeBgEffect) {
        const rmsValues = new Map<number, number>();
        for (const [ch, samples] of this.channelWaveforms.entries()) {
          let sum = 0;
          for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
          rmsValues.set(ch, samples.length ? Math.sqrt(sum / samples.length) : 0);
        }
        this.activeBgEffect.draw(bgCanvas, rmsValues);
      }

      this.bgRafId = requestAnimationFrame(tick);
    };
    this.bgRafId = requestAnimationFrame(tick);
  }

  private stopBgLoop(): void {
    if (this.bgRafId !== null) {
      cancelAnimationFrame(this.bgRafId);
      this.bgRafId = null;
    }
    this.activeBgEffect?.dispose();
    this.activeBgEffect = null;
  }

  dispose(): void {
    this.performanceMode = false;
    this.applyRightPaneConstraints();
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
    this.levelTimers.forEach(t => clearTimeout(t));
    this.levelTimers.clear();
    this.stopBgLoop();
    document.body.classList.remove('bb-viz-wide-mode');
    const rightPane = document.getElementById('right-pane');
    if (rightPane) rightPane.style.minWidth = '';
  }
}
