import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { PlaybackPosition, PlaybackManager } from '@beatbax/app-core/playback/playback-manager';
import {
  channelStates,
  isChannelAudible,
  toggleChannelMuted,
  toggleChannelSoloed,
  unmuteAll,
  clearAllSolo,
} from '@beatbax/app-core/stores/channel.store';
import { createLogger, getLoggingConfig } from '@beatbax/engine/util/logger';
import { icon } from '../utils/icons';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { settingFeaturePerChannelAnalyser } from '@beatbax/app-core/stores/settings.store';
import { getChannelMeta } from '../utils/chip-meta';
import { getMeterDisplayGain, scaleSamplesForWaveform } from '../utils/meter-display';

const log = createLogger('ui:song-visualizer');

type BgEffectId = 'none' | 'starfield' | 'scanlines' | 'matrix-rain' | 'custom-image';

interface BgEffect {
  id: Exclude<BgEffectId, 'none' | 'custom-image'>;
  init(canvas: HTMLCanvasElement): void;
  draw(canvas: HTMLCanvasElement, rmsValues: Map<number, number>): void;
  dispose(): void;
}

interface StarfieldStar {
  x: number;
  y: number;
  z: number;
  pz: number;
  speed: number;
  twinkle: number;
}

function createStarfieldStar(): StarfieldStar {
  const angle = Math.random() * Math.PI * 2;
  const radius = 0.02 + Math.pow(Math.random(), 0.55) * 1.45;
  const z = 0.35 + Math.random() * 1.35;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z,
    pz: z,
    speed: 0.55 + Math.random() * 1.15,
    twinkle: 0.65 + Math.random() * 0.7,
  };
}

interface MatrixColumn {
  x: number;
  y: number;
  speed: number;
  length: number;
  green: number;
  dim: number;
  glyphs: string[];
}

const MATRIX_GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZアカサタナハマヤラワンアイウエオキシチニヒミリヲ';

function createMatrixColumn(x: number, rows: number): MatrixColumn {
  const length = 12 + Math.floor(Math.random() * 26);
  return {
    x,
    y: -Math.random() * rows,
    speed: 0.18 + Math.random() * 0.52,
    length,
    green: 90 + Math.random() * 145,
    dim: 0.45 + Math.random() * 0.45,
    glyphs: Array.from({ length }, () => MATRIX_GLYPHS[Math.floor(Math.random() * MATRIX_GLYPHS.length)] ?? '0'),
  };
}

const BG_EFFECTS: BgEffect[] = [
  {
    id: 'starfield',
    init(canvas) {
      const stars = Array.from({ length: 260 }, () => createStarfieldStar());
      (canvas as any).__bbStars = stars;
    },
    draw(canvas, rmsValues) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const stars = ((canvas as any).__bbStars as StarfieldStar[]) ?? [];
      const avgRms = rmsValues.size > 0
        ? Array.from(rmsValues.values()).reduce((a, b) => a + b, 0) / rmsValues.size
        : 0;
      const brightness = Math.min(1, 0.35 + avgRms * 2.0);
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const scale = Math.min(W, H) * 0.48;
      const speed = 0.007 + avgRms * 0.035;

      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const s of stars) {
        s.pz = s.z;
        s.z -= speed * s.speed;

        const x = cx + (s.x / s.z) * scale;
        const y = cy + (s.y / s.z) * scale;

        if (s.z <= 0.08 || x < -40 || x > W + 40 || y < -40 || y > H + 40) {
          Object.assign(s, createStarfieldStar());
          continue;
        }

        const px = cx + (s.x / s.pz) * scale;
        const py = cy + (s.y / s.pz) * scale;
        const closeness = Math.min(1, 1 / (s.z * 1.4));
        const alpha = Math.min(1, brightness * s.twinkle * (0.22 + closeness * 0.7));
        const size = Math.max(0.9, closeness * (1.8 + s.speed * 0.9));

        ctx.strokeStyle = `rgba(205,230,255,${alpha * 0.85})`;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.fillStyle = `rgba(235,245,255,${alpha})`;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    },
    dispose() {
      // no-op
    },
  },
  {
    id: 'scanlines',
    init(canvas) {
      (canvas as any).__bbScanState = { beamY: 0 };
    },
    draw(canvas, rmsValues) {
      const maybeCtx = canvas.getContext('2d');
      if (!maybeCtx) return;
      const ctx: CanvasRenderingContext2D = maybeCtx;

      const W = canvas.width;
      const H = canvas.height;
      const avgRms = rmsValues.size > 0
        ? Array.from(rmsValues.values()).reduce((a, b) => a + b, 0) / rmsValues.size
        : 0;

      // ── Bezel ──────────────────────────────────────────────────────────────
      // Fill entire canvas with bezel colour first (corners will show through).
      ctx.fillStyle = '#1a1a1e';
      ctx.fillRect(0, 0, W, H);

      // Bezel inset — the screen sits inside a border.
      const bevel = Math.min(W, H) * 0.045;
      const scrX = bevel;
      const scrY = bevel;
      const scrW = W - bevel * 2;
      const scrH = H - bevel * 2;
      // Corner radius: larger radius = more CRT barrel look.
      const r = Math.min(scrW, scrH) * 0.12;

      // Helper: draw a rounded-rect path.
      function roundedRect(x: number, y: number, w: number, h: number, cr: number): void {
        ctx.beginPath();
        ctx.moveTo(x + cr, y);
        ctx.lineTo(x + w - cr, y);
        ctx.quadraticCurveTo(x + w, y,       x + w, y + cr);
        ctx.lineTo(x + w, y + h - cr);
        ctx.quadraticCurveTo(x + w, y + h,   x + w - cr, y + h);
        ctx.lineTo(x + cr, y + h);
        ctx.quadraticCurveTo(x, y + h,       x, y + h - cr);
        ctx.lineTo(x, y + cr);
        ctx.quadraticCurveTo(x, y,           x + cr, y);
        ctx.closePath();
      }

      // ── Screen area (clipped to rounded rect) ──────────────────────────────
      ctx.save();
      roundedRect(scrX, scrY, scrW, scrH, r);
      ctx.clip();

      // Dark phosphor background
      ctx.fillStyle = '#000804';
      ctx.fillRect(scrX, scrY, scrW, scrH);

      // Analogue TV static, drawn before the scanline mask so it reads as noisy
      // phosphor rather than UI confetti.
      const staticAlpha = Math.min(0.28, 0.12 + avgRms * 0.18);
      const speckCount = Math.floor(Math.min(2400, Math.max(520, (scrW * scrH) / 450)));
      for (let i = 0; i < speckCount; i++) {
        const noiseX = scrX + Math.random() * scrW;
        const noiseY = scrY + Math.random() * scrH;
        const noiseSize = Math.random() > 0.9 ? 2 : 1;
        const noiseTone = Math.random();
        const alpha = staticAlpha * (0.35 + Math.random() * 0.95);

        ctx.fillStyle = noiseTone > 0.82
          ? `rgba(190,255,210,${alpha})`
          : noiseTone > 0.48
            ? `rgba(245,255,245,${alpha * 0.9})`
            : `rgba(0,0,0,${alpha * 1.6})`;
        ctx.fillRect(noiseX, noiseY, noiseSize, noiseSize);
      }

      const bandCount = 5 + Math.floor(Math.random() * 5);
      for (let i = 0; i < bandCount; i++) {
        const bandY = scrY + Math.random() * scrH;
        const bandH = 1 + Math.random() * 2;
        const bandX = scrX + Math.random() * scrW * 0.18;
        const bandW = scrW * (0.45 + Math.random() * 0.55);
        ctx.fillStyle = `rgba(205,255,220,${staticAlpha * (0.35 + Math.random() * 0.35)})`;
        ctx.fillRect(bandX, bandY, bandW, bandH);
      }

      // Retro monitor mask: persistent thin dark scanlines with a faint green
      // phosphor row between them.
      for (let y = scrY; y < scrY + scrH; y += 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(scrX, y, scrW, 2);
        ctx.fillStyle = 'rgba(42,255,120,0.075)';
        ctx.fillRect(scrX, y + 2, scrW, 1);
      }

      // Subtle vertical phosphor grille so the screen reads as a retro display.
      for (let x = scrX; x < scrX + scrW; x += 3) {
        ctx.fillStyle = 'rgba(42,255,120,0.025)';
        ctx.fillRect(x, scrY, 1, scrH);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x + 2, scrY, 1, scrH);
      }

      // A soft refresh sweep, no longer the only visible scanline.
      const state = (canvas as any).__bbScanState as { beamY: number };
      state.beamY = (state.beamY + 0.75 + avgRms * 4) % scrH;
      const beamAbsY = scrY + state.beamY;
      const beamAlpha = 0.045 + avgRms * 0.12;
      const beamGrad = ctx.createLinearGradient(0, beamAbsY - 10, 0, beamAbsY + 10);
      beamGrad.addColorStop(0,   'rgba(0,255,120,0)');
      beamGrad.addColorStop(0.5, `rgba(0,255,120,${beamAlpha})`);
      beamGrad.addColorStop(1,   'rgba(0,255,120,0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(scrX, beamAbsY - 10, scrW, 20);

      // Screen-space vignette (dark edges, bright centre)
      const vigCx = scrX + scrW / 2;
      const vigCy = scrY + scrH / 2;
      const vig = ctx.createRadialGradient(vigCx, vigCy, scrH * 0.25, vigCx, vigCy, scrH * 0.82);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = vig;
      ctx.fillRect(scrX, scrY, scrW, scrH);

      // Barrel-distortion illusion: subtle bright horizontal glare at top
      const glare = ctx.createLinearGradient(0, scrY, 0, scrY + scrH * 0.18);
      glare.addColorStop(0,   'rgba(255,255,255,0.04)');
      glare.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = glare;
      ctx.fillRect(scrX, scrY, scrW, scrH * 0.18);

      ctx.restore(); // end screen clip

      // ── Bezel border over the screen ──────────────────────────────────────
      // Inner shadow / bevel around the screen opening.
      roundedRect(scrX, scrY, scrW, scrH, r);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Outer bezel highlight (top/left brighter, bottom/right darker = 3-D look)
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = bevel * 0.6;
      roundedRect(bevel * 0.3, bevel * 0.3, W - bevel * 0.6, H - bevel * 0.6, r + bevel * 0.3);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = bevel * 0.35;
      roundedRect(bevel * 0.6, bevel * 0.6, W - bevel * 1.2, H - bevel * 1.2, r + bevel * 0.1);
      ctx.stroke();
    },
    dispose() {
      // no-op
    },
  },
  {
    id: 'matrix-rain',
    init(canvas) {
      const fontSize = Math.max(10, Math.floor(Math.min(canvas.width, canvas.height) / 44));
      const colStep = fontSize * 0.82;
      const colCount = Math.ceil(canvas.width / colStep) + 3;
      const rows = Math.ceil(canvas.height / fontSize);
      const columns = Array.from({ length: colCount }, (_, i) => createMatrixColumn(i * colStep, rows));
      (canvas as any).__bbMatrixState = { columns, fontSize, colStep };
    },
    draw(canvas, rmsValues) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;
      const avgRms = rmsValues.size > 0
        ? Array.from(rmsValues.values()).reduce((a, b) => a + b, 0) / rmsValues.size
        : 0;
      const nextFontSize = Math.max(10, Math.floor(Math.min(W, H) / 44));
      const nextColStep = nextFontSize * 0.82;
      const rows = Math.ceil(H / nextFontSize);
      let state = (canvas as any).__bbMatrixState as { columns: MatrixColumn[]; fontSize: number; colStep: number } | undefined;

      if (!state || state.fontSize !== nextFontSize || state.colStep !== nextColStep) {
        const colCount = Math.ceil(W / nextColStep) + 3;
        state = {
          columns: Array.from({ length: colCount }, (_, i) => createMatrixColumn(i * nextColStep, rows)),
          fontSize: nextFontSize,
          colStep: nextColStep,
        };
        (canvas as any).__bbMatrixState = state;
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = `${state.fontSize}px "Cascadia Code", "Consolas", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (const col of state.columns) {
        col.y += col.speed * (0.42 + avgRms * 1.45);

        if (Math.random() < 0.045) {
          const idx = Math.floor(Math.random() * col.glyphs.length);
          col.glyphs[idx] = MATRIX_GLYPHS[Math.floor(Math.random() * MATRIX_GLYPHS.length)] ?? '0';
        }

        for (let i = 0; i < col.length; i++) {
          const y = (col.y - i) * state.fontSize;
          if (y < -state.fontSize || y > H + state.fontSize) continue;

          const alpha = Math.max(0, 1 - i / col.length);
          const glyph = col.glyphs[i] ?? '0';
          const green = Math.floor(col.green * (0.65 + alpha * 0.35));
          const bodyAlpha = (0.04 + alpha * 0.5) * col.dim;

          if (i === 0) {
            ctx.fillStyle = `rgba(${80 + green * 0.25}, 255, ${95 + green * 0.2}, ${0.55 + Math.min(0.25, avgRms * 0.35)})`;
          } else {
            ctx.fillStyle = `rgba(18, ${green}, ${34 + Math.floor(green * 0.18)}, ${bodyAlpha})`;
          }
          ctx.fillText(glyph, col.x, y);
        }

        if ((col.y - col.length) * state.fontSize > H) {
          Object.assign(col, createMatrixColumn(col.x, rows));
        }
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
  onPlay?: () => void;
  onStop?: () => void;
}

export class SongVisualizer {
  private container: HTMLElement;
  private eventBus: EventBus;
  private playbackManager: PlaybackManager | null;
  private onPlay: (() => void) | null;
  private onStop: (() => void) | null;
  private ast: any = null;
  private unsubscribers: Array<() => void> = [];
  private levelTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private channelWaveforms: Map<number, Float32Array> = new Map();
  private analyserEnabled = false;
  private bgEffectId: BgEffectId = 'none';
  private bgImageData = '';
  private bgImage: HTMLImageElement | null = null;
  private activeBgEffect: BgEffect | null = null;
  private bgRafId: number | null = null;
  private performanceMode = false;
  private chromeHideTimer: ReturnType<typeof setTimeout> | null = null;
  private chromePinned = false;

  constructor(options: SongVisualizerOptions) {
    this.container = options.container;
    this.eventBus = options.eventBus;
    this.playbackManager = options.playbackManager ?? null;
    this.onPlay = options.onPlay ?? null;
    this.onStop = options.onStop ?? null;
    this.analyserEnabled = settingFeaturePerChannelAnalyser.get();
    this.refreshSettingsFromStorage();
    this.render();
    this.setupEventListeners();
  }

  private refreshSettingsFromStorage(): void {
    const savedEffect = storage.get(StorageKey.VIZ_BG_EFFECT, 'none');
    this.bgEffectId = (
      savedEffect === 'starfield' ||
      savedEffect === 'scanlines' ||
      savedEffect === 'matrix-rain' ||
      savedEffect === 'custom-image'
    )
      ? savedEffect
      : 'none';

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

  private get isBrowserFullscreen(): boolean {
    return document.fullscreenElement !== null;
  }

  private clearChromeHideTimer(): void {
    if (this.chromeHideTimer !== null) {
      clearTimeout(this.chromeHideTimer);
      this.chromeHideTimer = null;
    }
  }

  private setChromeHidden(hidden: boolean): void {
    const root = document.getElementById('bb-viz-root');
    if (!root || !this.performanceMode) return;
    root.classList.toggle('bb-viz--chrome-hidden', hidden);
  }

  private revealChrome(): void {
    if (!this.performanceMode) return;
    this.setChromeHidden(false);
    this.clearChromeHideTimer();
    if (this.chromePinned) return;
    this.chromeHideTimer = setTimeout(() => {
      this.chromeHideTimer = null;
      if (this.performanceMode && !this.chromePinned) this.setChromeHidden(true);
    }, 2200);
  }

  private pinChrome(): void {
    this.chromePinned = true;
    this.clearChromeHideTimer();
    this.setChromeHidden(false);
  }

  private unpinChrome(): void {
    this.chromePinned = false;
    this.revealChrome();
  }

  render(): void {
    this.stopBgLoop();
    this.container.innerHTML = '';
    this.applyRightPaneConstraints();
    document.body.classList.toggle('bb-viz-wide-mode', this.performanceMode);

    const root = document.createElement('div');
    root.className = [
      'bb-viz',
      this.isPerformanceMode ? 'bb-viz--fullscreen' : '',
      'bb-viz--layout-horizontal',
    ].filter(Boolean).join(' ');
    root.id = 'bb-viz-root';
    if (this.isPerformanceMode) root.tabIndex = -1;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Song Visualizer');

    const toolbar = document.createElement('div');
    toolbar.className = 'bb-viz__toolbar';
    if (this.isPerformanceMode) {
      toolbar.addEventListener('pointerenter', () => this.pinChrome());
      toolbar.addEventListener('pointerleave', () => this.unpinChrome());
      toolbar.addEventListener('focusin', () => this.pinChrome());
      toolbar.addEventListener('focusout', (event) => {
        const next = (event as FocusEvent).relatedTarget as Node | null;
        if (!toolbar.contains(next)) this.unpinChrome();
      });
    }

    const unmuteBtn = document.createElement('button');
    unmuteBtn.type = 'button';
    unmuteBtn.className = 'bb-viz__toolbar-btn';
    unmuteBtn.id = 'bb-viz-unmute-all';
    unmuteBtn.title = 'Unmute all channels';
    unmuteBtn.disabled = !Object.values(channelStates.get()).some(s => s.muted);
    unmuteBtn.innerHTML = icon('speaker-wave');
    unmuteBtn.addEventListener('click', () => unmuteAll());

    const clearSoloBtn = document.createElement('button');
    clearSoloBtn.type = 'button';
    clearSoloBtn.className = 'bb-viz__toolbar-btn';
    clearSoloBtn.id = 'bb-viz-clear-solo';
    clearSoloBtn.title = 'Clear solo';
    clearSoloBtn.disabled = !Object.values(channelStates.get()).some(s => s.soloed);
    clearSoloBtn.innerHTML = icon('eye');
    clearSoloBtn.addEventListener('click', () => clearAllSolo());

    const performanceTransport = document.createElement('div');
    performanceTransport.className = 'bb-viz__performance-transport';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'bb-viz__toolbar-btn bb-viz__performance-transport-btn';
    playBtn.title = 'Play current song';
    playBtn.setAttribute('aria-label', 'Play current song');
    playBtn.disabled = !this.onPlay;
    playBtn.innerHTML = icon('play');
    playBtn.addEventListener('click', () => this.onPlay?.());

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'bb-viz__toolbar-btn bb-viz__performance-transport-btn';
    stopBtn.title = 'Stop playback';
    stopBtn.setAttribute('aria-label', 'Stop playback');
    stopBtn.disabled = !this.onStop && !this.playbackManager;
    stopBtn.innerHTML = icon('stop');
    stopBtn.addEventListener('click', () => {
      if (this.onStop) {
        this.onStop();
        return;
      }
      this.playbackManager?.stop();
    });

    performanceTransport.appendChild(playBtn);
    performanceTransport.appendChild(stopBtn);

    const performanceBtn = document.createElement('button');
    performanceBtn.type = 'button';
    performanceBtn.className = 'bb-viz__toolbar-btn bb-viz__toolbar-btn--performance';
    performanceBtn.id = 'bb-viz-fullscreen';
    this.updatePerformanceButton(performanceBtn);
    performanceBtn.addEventListener('click', () => {
      if (!this.performanceMode) {
        this.performanceMode = true;
        this.render();
        return;
      }

      if (document.fullscreenElement) {
        const exitFullscreen = document.exitFullscreen?.();
        void exitFullscreen?.catch(() => { /* ignore */ });
        return;
      }

      const enterFullscreen = root.requestFullscreen?.();
      void enterFullscreen
        ?.then(() => this.updatePerformanceButton())
        .catch(() => { /* ignore */ });
    });

    const exitPerformanceBtn = document.createElement('button');
    exitPerformanceBtn.type = 'button';
    exitPerformanceBtn.className = 'bb-viz__toolbar-btn bb-viz__toolbar-btn--exit-performance';
    exitPerformanceBtn.id = 'bb-viz-exit';
    exitPerformanceBtn.title = 'Exit performance mode';
    exitPerformanceBtn.setAttribute('aria-label', 'Exit performance mode');
    exitPerformanceBtn.innerHTML = icon('x-mark');
    exitPerformanceBtn.addEventListener('click', () => {
      this.performanceMode = false;
      const finishExit = () => this.render();
      if (document.fullscreenElement) {
        const exitFullscreen = document.exitFullscreen?.();
        void exitFullscreen?.finally(finishExit);
        if (!exitFullscreen) finishExit();
        return;
      }
      this.render();
    });

    toolbar.appendChild(unmuteBtn);
    toolbar.appendChild(clearSoloBtn);
    if (this.isPerformanceMode) toolbar.appendChild(performanceTransport);
    toolbar.appendChild(performanceBtn);
    if (this.isPerformanceMode) toolbar.appendChild(exitPerformanceBtn);
    root.appendChild(toolbar);

    const bgCanvas = document.createElement('canvas');
    bgCanvas.id = 'bb-viz-bg';
    bgCanvas.className = this.isPerformanceMode && this.bgEffectId !== 'none' ? '' : 'bb-viz__bg-hidden';
    root.appendChild(bgCanvas);

    const channelsWrap = document.createElement('div');
    channelsWrap.className = [
      'bb-viz__channels',
      this.isPerformanceMode ? 'bb-viz__channels--vertical' : 'bb-viz__channels--horizontal',
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

    this.container.appendChild(root);
    this.syncCanvasResolution();
    this.refreshBgEffect();
    if (this.isPerformanceMode) {
      requestAnimationFrame(() => root.focus());
      this.revealChrome();
    } else {
      this.chromePinned = false;
      this.clearChromeHideTimer();
    }
  }

  private applyRightPaneConstraints(): void {
    const rightPane = document.getElementById('right-pane');
    if (rightPane && !this.performanceMode) {
      rightPane.style.minWidth = '300px';
    }
    window.dispatchEvent(new Event('resize'));
  }

  private updatePerformanceButton(
    button = document.getElementById('bb-viz-fullscreen') as HTMLButtonElement | null,
  ): void {
    if (!button) return;

    if (!this.performanceMode) {
      button.title = 'Enter performance mode';
      button.setAttribute('aria-label', 'Enter performance mode');
      button.innerHTML = icon('bolt');
      return;
    }

    if (this.isBrowserFullscreen) {
      button.title = 'Exit fullscreen';
      button.setAttribute('aria-label', 'Exit fullscreen');
      button.innerHTML = icon('arrows-pointing-in');
      return;
    }

    button.title = 'Enter fullscreen';
    button.setAttribute('aria-label', 'Enter fullscreen');
    button.innerHTML = icon('arrows-pointing-out');
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
    card.style.setProperty('--bb-ch-accent', meta.color);

    const header = document.createElement('div');
    header.className = 'bb-viz__card-header';

    const levelBar = document.createElement('div');
    levelBar.className = 'bb-viz__level-bar';
    levelBar.id = `bb-viz-level-${ch.id}`;
    levelBar.style.background = meta.color;
    levelBar.style.opacity = '0.35';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'bb-viz__title-block';

    const leftCol = document.createElement('div');
    leftCol.className = 'bb-viz__left-col';

    const channelTitle = document.createElement('span');
    channelTitle.className = 'bb-viz__channel-title';
    channelTitle.textContent = `Channel ${ch.id}`;

    const chipLabel = document.createElement('span');
    chipLabel.className = 'bb-viz__chip-label';
    chipLabel.textContent = meta.label;

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
    muteBtn.className = 'bb-cp__btn bb-cp__btn--mute';
    muteBtn.id = `bb-viz-mute-${ch.id}`;
    this.applyMuteStyle(muteBtn, isMuted);
    muteBtn.addEventListener('click', () => toggleChannelMuted(ch.id));

    const soloBtn = document.createElement('button');
    soloBtn.type = 'button';
    soloBtn.className = 'bb-cp__btn bb-cp__btn--solo';
    soloBtn.id = `bb-viz-solo-${ch.id}`;
    this.applySoloStyle(soloBtn, isSoloed);
    soloBtn.addEventListener('click', () => toggleChannelSoloed(ch.id));

    if (this.isPerformanceMode) {
      for (const btn of [muteBtn, soloBtn]) {
        btn.addEventListener('pointerenter', () => this.pinChrome());
        btn.addEventListener('pointerleave', () => this.unpinChrome());
        btn.addEventListener('focus', () => this.pinChrome());
        btn.addEventListener('blur', () => this.unpinChrome());
      }
    }

    ctrlRow.appendChild(muteBtn);
    ctrlRow.appendChild(soloBtn);

    leftCol.appendChild(titleBlock);
    leftCol.appendChild(ctrlRow);

    header.appendChild(levelBar);
    header.appendChild(leftCol);
    header.appendChild(right);
    card.appendChild(header);

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
      if (e.key === 'Escape' && this.performanceMode && !document.fullscreenElement) {
        this.performanceMode = false;
        this.render();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    this.unsubscribers.push(() => window.removeEventListener('keydown', onKeyDown));

    const onPointerMove = (event: PointerEvent) => {
      if (!this.performanceMode) return;
      const root = document.getElementById('bb-viz-root');
      if (!root?.contains(event.target as Node)) return;
      this.revealChrome();
    };
    document.addEventListener('pointermove', onPointerMove);
    this.unsubscribers.push(() => document.removeEventListener('pointermove', onPointerMove));

    const onFullscreenChange = () => {
      if (this.performanceMode) {
        this.updatePerformanceButton();
        const root = document.getElementById('bb-viz-root');
        // Double rAF: first lets the browser apply fullscreen layout,
        // second ensures paint + reflow are complete before syncing canvas sizes
        requestAnimationFrame(() => {
          root?.focus();
          requestAnimationFrame(() => {
            this.syncCanvasResolution();
            this.refreshBgEffect();
          });
        });
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    this.unsubscribers.push(() => document.removeEventListener('fullscreenchange', onFullscreenChange));
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

    ctx.beginPath();
    if (channelId === 3) {
      // Wave channel: smooth sine curve
      ctx.moveTo(0, h / 2 + Math.sin(0) * (h / 3));
      for (let x = 1; x < w; x++) {
        const t = (x / w) * Math.PI * 4;
        ctx.lineTo(x, h / 2 + Math.sin(t) * (h / 3));
      }
    } else if (channelId === 4) {
      // Noise channel: random jitter
      ctx.moveTo(0, h / 2);
      for (let x = 1; x < w; x += 2) {
        ctx.lineTo(x, h / 2 + (Math.random() - 0.5) * h * 0.75);
      }
    } else {
      // Pulse channels 1 & 2: proper square wave with hard vertical edges
      const period = Math.max(10, Math.floor(w / 6));
      let curY = h * 0.72;
      ctx.moveTo(0, curY);
      for (let x = 1; x < w; x++) {
        const targetY = Math.floor(x / period) % 2 ? h * 0.28 : h * 0.72;
        if (targetY !== curY) {
          ctx.lineTo(x, curY);    // horizontal segment up to edge
          ctx.lineTo(x, targetY); // vertical edge
          curY = targetY;
        }
      }
      ctx.lineTo(w, curY);
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
    const gain = getMeterDisplayGain(this.activeChip, channelId);
    const displaySamples = scaleSamplesForWaveform(samples, gain);

    const color = getChannelMeta(this.activeChip, channelId).color;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const sampleIdx = Math.min(Math.floor((x / w) * displaySamples.length), displaySamples.length - 1);
      const y = (h / 2) * (1 - displaySamples[sampleIdx]);
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

    // Resizing canvas attributes clears the pixel buffer — redraw stored waveforms
    this.redrawWaveforms();
  }

  private redrawWaveforms(): void {
    for (const [channelId, samples] of this.channelWaveforms.entries()) {
      this.drawAnalyserWaveform(channelId, samples);
    }
    // For channels with no analyser data, draw synthetic pulses
    if (this.channelWaveforms.size === 0 && !this.analyserEnabled) {
      for (const ch of (this.ast?.channels ?? [])) {
        this.pulse(ch.id, true);
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
    this.chromePinned = false;
    this.clearChromeHideTimer();
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
