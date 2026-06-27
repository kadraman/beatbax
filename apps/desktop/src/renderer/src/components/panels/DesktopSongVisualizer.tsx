import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { PlaybackManager, PlaybackPosition } from '@beatbax/app-core/playback/playback-manager';
import {
  channelStates,
  clearAllSolo,
  isChannelAudible,
  toggleChannelMuted,
  toggleChannelSoloed,
  unmuteAll,
  type ChannelInfo,
} from '@beatbax/app-core/stores/channel.store';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { settingFeaturePerChannelAnalyser } from '@beatbax/app-core/stores/settings.store';
import { getLoggingConfig } from '@beatbax/engine/util/logger';
import { getChannelMeta } from '@beatbax/ui-tokens/channel-meta';
import { icon } from '../../utils/icons';
import { getMeterDisplayGain, scaleSamplesForWaveform } from '../../utils/meter-display';

type BgEffectId = 'none' | 'starfield' | 'scanlines' | 'matrix-rain' | 'custom-image';

interface DesktopSongVisualizerOptions {
  eventBus: EventBus;
  playbackManager?: PlaybackManager;
  onPlay?: () => void;
  onStop?: () => void;
}

interface DesktopSongVisualizerProps extends DesktopSongVisualizerOptions {
  visualizerRef: Ref<DesktopSongVisualizerHandle>;
}

export interface DesktopSongVisualizerHandle {
  dispose: () => void;
}

interface ChannelDisplayState {
  currentInstrument: string | null;
  patternLabel: string;
  progress: number;
  positionLabel: string;
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

interface StarfieldStar {
  x: number;
  y: number;
  z: number;
  pz: number;
  speed: number;
  twinkle: number;
}

interface BgEffect {
  id: Exclude<BgEffectId, 'none' | 'custom-image'>;
  init: (canvas: HTMLCanvasElement) => void;
  draw: (canvas: HTMLCanvasElement, rmsValues: Map<number, number>) => void;
  dispose: () => void;
}

const MATRIX_GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZアカサタナハマヤラワンアイウエオキシチニヒミリヲ';

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

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cr: number): void {
  ctx.beginPath();
  ctx.moveTo(x + cr, y);
  ctx.lineTo(x + w - cr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + cr);
  ctx.lineTo(x + w, y + h - cr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
  ctx.lineTo(x + cr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - cr);
  ctx.lineTo(x, y + cr);
  ctx.quadraticCurveTo(x, y, x + cr, y);
  ctx.closePath();
}

const BG_EFFECTS: BgEffect[] = [
  {
    id: 'starfield',
    init(canvas) {
      (canvas as any).__bbStars = Array.from({ length: 260 }, () => createStarfieldStar());
    },
    draw(canvas, rmsValues) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const stars = ((canvas as any).__bbStars as StarfieldStar[]) ?? [];
      const avgRms = rmsValues.size > 0
        ? Array.from(rmsValues.values()).reduce((a, b) => a + b, 0) / rmsValues.size
        : 0;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const scale = Math.min(W, H) * 0.48;
      const speed = 0.007 + avgRms * 0.035;
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(0, 0, W, H);
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
        const alpha = Math.min(1, (0.35 + avgRms * 2.0) * s.twinkle * (0.22 + closeness * 0.7));
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
    dispose() {},
  },
  {
    id: 'scanlines',
    init(canvas) {
      (canvas as any).__bbScanState = { beamY: 0 };
    },
    draw(canvas, rmsValues) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width;
      const H = canvas.height;
      const avgRms = rmsValues.size > 0
        ? Array.from(rmsValues.values()).reduce((a, b) => a + b, 0) / rmsValues.size
        : 0;
      const bevel = Math.min(W, H) * 0.045;
      const scrX = bevel;
      const scrY = bevel;
      const scrW = W - bevel * 2;
      const scrH = H - bevel * 2;
      const r = Math.min(scrW, scrH) * 0.12;
      ctx.fillStyle = '#1a1a1e';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      roundedRect(ctx, scrX, scrY, scrW, scrH, r);
      ctx.clip();
      ctx.fillStyle = '#000804';
      ctx.fillRect(scrX, scrY, scrW, scrH);
      const staticAlpha = Math.min(0.28, 0.12 + avgRms * 0.18);
      const speckCount = Math.floor(Math.min(2400, Math.max(520, (scrW * scrH) / 450)));
      for (let i = 0; i < speckCount; i++) {
        const noiseX = scrX + Math.random() * scrW;
        const noiseY = scrY + Math.random() * scrH;
        const alpha = staticAlpha * (0.35 + Math.random() * 0.95);
        ctx.fillStyle = Math.random() > 0.48
          ? `rgba(245,255,245,${alpha * 0.9})`
          : `rgba(0,0,0,${alpha * 1.6})`;
        ctx.fillRect(noiseX, noiseY, Math.random() > 0.9 ? 2 : 1, Math.random() > 0.9 ? 2 : 1);
      }
      for (let y = scrY; y < scrY + scrH; y += 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(scrX, y, scrW, 2);
        ctx.fillStyle = 'rgba(42,255,120,0.075)';
        ctx.fillRect(scrX, y + 2, scrW, 1);
      }
      const state = (canvas as any).__bbScanState as { beamY: number };
      state.beamY = (state.beamY + 0.75 + avgRms * 4) % scrH;
      const beamAbsY = scrY + state.beamY;
      const beamGrad = ctx.createLinearGradient(0, beamAbsY - 10, 0, beamAbsY + 10);
      beamGrad.addColorStop(0, 'rgba(0,255,120,0)');
      beamGrad.addColorStop(0.5, `rgba(0,255,120,${0.045 + avgRms * 0.12})`);
      beamGrad.addColorStop(1, 'rgba(0,255,120,0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(scrX, beamAbsY - 10, scrW, 20);
      ctx.restore();
      roundedRect(ctx, scrX, scrY, scrW, scrH, r);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },
    dispose() {},
  },
  {
    id: 'matrix-rain',
    init(canvas) {
      const fontSize = Math.max(10, Math.floor(Math.min(canvas.width, canvas.height) / 44));
      const colStep = fontSize * 0.82;
      const colCount = Math.ceil(canvas.width / colStep) + 3;
      const rows = Math.ceil(canvas.height / fontSize);
      (canvas as any).__bbMatrixState = {
        columns: Array.from({ length: colCount }, (_, i) => createMatrixColumn(i * colStep, rows)),
        fontSize,
        colStep,
      };
    },
    draw(canvas, rmsValues) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const avgRms = rmsValues.size > 0
        ? Array.from(rmsValues.values()).reduce((a, b) => a + b, 0) / rmsValues.size
        : 0;
      const W = canvas.width;
      const H = canvas.height;
      const fontSize = Math.max(10, Math.floor(Math.min(W, H) / 44));
      const colStep = fontSize * 0.82;
      const rows = Math.ceil(H / fontSize);
      let state = (canvas as any).__bbMatrixState as { columns: MatrixColumn[]; fontSize: number; colStep: number } | undefined;
      if (!state || state.fontSize !== fontSize || state.colStep !== colStep) {
        const colCount = Math.ceil(W / colStep) + 3;
        state = { columns: Array.from({ length: colCount }, (_, i) => createMatrixColumn(i * colStep, rows)), fontSize, colStep };
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
          const green = Math.floor(col.green * (0.65 + alpha * 0.35));
          ctx.fillStyle = i === 0
            ? `rgba(${80 + green * 0.25},255,${95 + green * 0.2},${0.55 + Math.min(0.25, avgRms * 0.35)})`
            : `rgba(18,${green},${34 + Math.floor(green * 0.18)},${(0.04 + alpha * 0.5) * col.dim})`;
          ctx.fillText(col.glyphs[i] ?? '0', col.x, y);
        }
        if ((col.y - col.length) * state.fontSize > H) Object.assign(col, createMatrixColumn(col.x, rows));
      }
    },
    dispose() {},
  },
];

function validBgEffect(value: string | null): BgEffectId {
  return value === 'starfield' || value === 'scanlines' || value === 'matrix-rain' || value === 'custom-image'
    ? value
    : 'none';
}

function getInstrumentName(ch: any, ast: any): string {
  if (ch.inst && ast?.insts?.[ch.inst]) return ch.inst;
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

function DesktopSongVisualizer({
  visualizerRef,
  eventBus,
  playbackManager = undefined,
  onPlay,
  onStop,
}: DesktopSongVisualizerProps): React.JSX.Element {
  const [ast, setAst] = useState<any>(null);
  const [channelInfo, setChannelInfo] = useState<Record<number, ChannelInfo>>(channelStates.get());
  const [positions, setPositions] = useState<Record<number, ChannelDisplayState>>({});
  const [analyserEnabled, setAnalyserEnabled] = useState(settingFeaturePerChannelAnalyser.get());
  const [performanceMode, setPerformanceMode] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(document.fullscreenElement !== null);
  const [bgEffectId, setBgEffectId] = useState<BgEffectId>(() => validBgEffect(storage.get(StorageKey.VIZ_BG_EFFECT, 'none') ?? null));
  const [bgImageData, setBgImageData] = useState(() => storage.get(StorageKey.VIZ_BG_IMAGE, '') ?? '');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const activeBgEffectRef = useRef<BgEffect | null>(null);
  const bgRafRef = useRef<number | null>(null);
  const levelTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const channelWaveformsRef = useRef<Map<number, Float32Array>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const channels = ast?.channels ?? [];
  const activeChip = (ast?.chip ?? 'gameboy').toLowerCase();
  const showDebug = useMemo(() => {
    const loggingCfg = getLoggingConfig();
    return loggingCfg.level === 'debug' && (!loggingCfg.modules || loggingCfg.modules.includes('ui:song-visualizer'));
  }, []);

  const stopBgLoop = useCallback(() => {
    if (bgRafRef.current !== null) {
      cancelAnimationFrame(bgRafRef.current);
      bgRafRef.current = null;
    }
    activeBgEffectRef.current?.dispose();
    activeBgEffectRef.current = null;
  }, []);

  const drawAnalyserWaveform = useCallback((channelId: number, samples: Float32Array) => {
    const canvas = canvasRefs.current.get(channelId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (samples.length === 0) return;
    const displaySamples = scaleSamplesForWaveform(samples, getMeterDisplayGain(activeChip, channelId));
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = getChannelMeta(activeChip, channelId).color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const sampleIdx = Math.min(Math.floor((x / w) * displaySamples.length), displaySamples.length - 1);
      const y = (h / 2) * (1 - (displaySamples[sampleIdx] ?? 0));
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [activeChip]);

  const drawSyntheticPulse = useCallback((channelId: number) => {
    const canvas = canvasRefs.current.get(channelId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = getChannelMeta(activeChip, channelId).color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (channelId === 3) {
      ctx.moveTo(0, h / 2);
      for (let x = 1; x < w; x++) {
        const t = (x / w) * Math.PI * 4;
        ctx.lineTo(x, h / 2 + Math.sin(t) * (h / 3));
      }
    } else if (channelId === 4) {
      ctx.moveTo(0, h / 2);
      for (let x = 1; x < w; x += 2) ctx.lineTo(x, h / 2 + (Math.random() - 0.5) * h * 0.75);
    } else {
      const period = Math.max(10, Math.floor(w / 6));
      let curY = h * 0.72;
      ctx.moveTo(0, curY);
      for (let x = 1; x < w; x++) {
        const targetY = Math.floor(x / period) % 2 ? h * 0.28 : h * 0.72;
        if (targetY !== curY) {
          ctx.lineTo(x, curY);
          ctx.lineTo(x, targetY);
          curY = targetY;
        }
      }
      ctx.lineTo(w, curY);
    }
    ctx.stroke();
  }, [activeChip]);

  const syncCanvasResolution = useCallback(() => {
    for (const canvas of canvasRefs.current.values()) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = Math.max(1, Math.floor(rect.width));
        canvas.height = Math.max(1, Math.floor(rect.height));
      }
    }
    const bg = bgCanvasRef.current;
    if (bg) {
      const rect = bg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        bg.width = Math.max(1, Math.floor(rect.width));
        bg.height = Math.max(1, Math.floor(rect.height));
      }
    }
    for (const [channelId, samples] of channelWaveformsRef.current.entries()) drawAnalyserWaveform(channelId, samples);
  }, [drawAnalyserWaveform]);

  const clearLevels = useCallback(() => {
    for (const timer of levelTimersRef.current.values()) clearTimeout(timer);
    levelTimersRef.current.clear();
  }, []);

  const syncChannelInfoFromStore = useCallback(() => {
    setChannelInfo({ ...channelStates.get() });
  }, []);

  const runChannelStateAction = useCallback((action: () => void) => {
    flushSync(() => {
      action();
      syncChannelInfoFromStore();
    });
  }, [syncChannelInfoFromStore]);

  const activateOnPointerDown = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  }, []);

  const activateOnKeyboardClick = useCallback((
    event: ReactMouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    if (event.detail !== 0) return;
    action();
  }, []);

  const resetAllChannels = useCallback(() => {
    setPositions({});
    clearLevels();
    channelWaveformsRef.current.clear();
    for (const canvas of canvasRefs.current.values()) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [clearLevels]);

  const refreshSettings = useCallback(() => {
    const savedEffect = validBgEffect(storage.get(StorageKey.VIZ_BG_EFFECT, 'none') ?? null);
    const savedImage = storage.get(StorageKey.VIZ_BG_IMAGE, '') ?? '';
    setBgEffectId(savedEffect === 'custom-image' && !savedImage ? 'none' : savedEffect);
    setBgImageData(savedImage);
  }, []);

  useImperativeHandle(visualizerRef, () => ({
    dispose: () => {
      setPerformanceMode(false);
      stopBgLoop();
      clearLevels();
      document.body.classList.remove('bb-viz-wide-mode');
    },
  }), [clearLevels, stopBgLoop]);

  useEffect(() => {
    const cleanups = [
      eventBus.on('parse:success', ({ ast: nextAst }) => {
        setAst(nextAst);
        setPositions({});
      }),
      eventBus.on('song:loaded', () => setAst(null)),
      eventBus.on('playback:position-changed', ({ channelId, position }) => {
        setPositions((current) => {
          const parts: string[] = [];
          if (position.sourceSequence) parts.push(position.sourceSequence);
          if (position.currentPattern) parts.push(position.currentPattern);
          else if (position.barNumber != null) parts.push(`Bar ${position.barNumber + 1}`);
          return {
            ...current,
            [channelId]: {
              currentInstrument: position.currentInstrument ?? null,
              patternLabel: parts.length > 0 ? parts.join(' • ') : '—',
              progress: Math.max(0, Math.min(1, position.progress ?? 0)),
              positionLabel: `${(position.eventIndex ?? 0) + 1}/${position.totalEvents ?? 0}`,
            },
          };
        });
        const bar = document.getElementById(`bb-viz-level-${channelId}`);
        if (bar) {
          const color = getChannelMeta(activeChip, channelId).color;
          bar.style.boxShadow = `0 0 6px 2px ${color}`;
          bar.style.opacity = '1';
          clearTimeout(levelTimersRef.current.get(channelId));
          levelTimersRef.current.set(channelId, setTimeout(() => {
            bar.style.boxShadow = 'none';
            bar.style.opacity = isChannelAudible(channelStates.get(), channelId) ? '0.35' : '0.15';
          }, 120));
        }
        if (!analyserEnabled) drawSyntheticPulse(channelId);
      }),
      eventBus.on('playback:stopped', resetAllChannels),
      eventBus.on('playback:channel-waveform', ({ channelId, samples }) => {
        channelWaveformsRef.current.set(channelId, samples);
        drawAnalyserWaveform(channelId, samples);
      }),
      eventBus.on('song-visualizer:settings-changed', refreshSettings),
      settingFeaturePerChannelAnalyser.subscribe((val) => {
        setAnalyserEnabled(val);
        playbackManager?.setPerChannelAnalyser(val);
        if (!val) channelWaveformsRef.current.clear();
      }),
      channelStates.subscribe((states) => setChannelInfo({ ...states })),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [activeChip, analyserEnabled, drawAnalyserWaveform, drawSyntheticPulse, eventBus, playbackManager, refreshSettings, resetAllChannels]);

  useEffect(() => {
    document.body.classList.toggle('bb-viz-wide-mode', performanceMode);
    return () => document.body.classList.remove('bb-viz-wide-mode');
  }, [performanceMode]);

  useEffect(() => {
    const rightPane = document.getElementById('right-pane');
    if (rightPane && !performanceMode) rightPane.style.minWidth = '300px';
    window.dispatchEvent(new Event('resize'));
  }, [performanceMode]);

  useEffect(() => {
    const onResize = () => syncCanvasResolution();
    window.addEventListener('resize', onResize);
    const id = requestAnimationFrame(syncCanvasResolution);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(id);
    };
  }, [syncCanvasResolution, channels.length, performanceMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && performanceMode && !document.fullscreenElement) setPerformanceMode(false);
    };
    const onFullscreenChange = () => {
      setFullscreenActive(document.fullscreenElement !== null);
      if (performanceMode) requestAnimationFrame(() => requestAnimationFrame(syncCanvasResolution));
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [performanceMode, syncCanvasResolution]);

  useEffect(() => {
    if (!bgImageData) {
      bgImageRef.current = null;
      return;
    }
    const img = new Image();
    img.src = bgImageData;
    bgImageRef.current = img;
  }, [bgImageData]);

  useEffect(() => {
    stopBgLoop();
    if (!performanceMode || bgEffectId === 'none') return undefined;
    const bgCanvas = bgCanvasRef.current;
    if (!bgCanvas) return undefined;
    const effect = bgEffectId === 'custom-image' ? null : BG_EFFECTS.find((entry) => entry.id === bgEffectId) ?? null;
    activeBgEffectRef.current = effect;
    effect?.init(bgCanvas);
    const tick = () => {
      const canvas = bgCanvasRef.current;
      if (!canvas || !performanceMode) {
        bgRafRef.current = null;
        return;
      }
      if (bgEffectId === 'custom-image') {
        const img = bgImageRef.current;
        const ctx = canvas.getContext('2d');
        if (img?.complete && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const canvasRatio = canvas.width / canvas.height;
          const imgRatio = img.width / img.height;
          let drawWidth = canvas.width;
          let drawHeight = canvas.height;
          let offsetX = 0;
          let offsetY = 0;
          if (imgRatio > canvasRatio) {
            drawHeight = canvas.height;
            drawWidth = drawHeight * imgRatio;
            offsetX = (canvas.width - drawWidth) / 2;
          } else {
            drawWidth = canvas.width;
            drawHeight = drawWidth / imgRatio;
            offsetY = (canvas.height - drawHeight) / 2;
          }
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        }
      } else if (activeBgEffectRef.current) {
        const rmsValues = new Map<number, number>();
        for (const [ch, samples] of channelWaveformsRef.current.entries()) {
          let sum = 0;
          for (let i = 0; i < samples.length; i++) sum += (samples[i] ?? 0) * (samples[i] ?? 0);
          rmsValues.set(ch, samples.length ? Math.sqrt(sum / samples.length) : 0);
        }
        activeBgEffectRef.current.draw(canvas, rmsValues);
      }
      bgRafRef.current = requestAnimationFrame(tick);
    };
    bgRafRef.current = requestAnimationFrame(tick);
    return stopBgLoop;
  }, [bgEffectId, performanceMode, stopBgLoop]);

  const performanceTitle = !performanceMode
    ? 'Enter performance mode'
    : fullscreenActive
      ? 'Exit fullscreen'
      : 'Enter fullscreen';
  const performanceIcon = !performanceMode
    ? 'bolt'
    : fullscreenActive
      ? 'arrows-pointing-in'
      : 'arrows-pointing-out';

  return (
    <div
      aria-label="Song Visualizer"
      className={`bb-viz${performanceMode ? ' bb-viz--fullscreen' : ''} bb-viz--layout-horizontal`}
      id="bb-viz-root"
      ref={rootRef}
      role="region"
    >
      <div className="bb-viz__toolbar">
        <button
          className="bb-viz__toolbar-btn"
          disabled={!Object.values(channelInfo).some((state) => state.muted)}
          dangerouslySetInnerHTML={{ __html: icon('speaker-wave') }}
          id="bb-viz-unmute-all"
          onClick={(event) => activateOnKeyboardClick(event, () => runChannelStateAction(unmuteAll))}
          onPointerDown={(event) => activateOnPointerDown(event, () => runChannelStateAction(unmuteAll))}
          title="Unmute all channels"
          type="button"
        />
        <button
          className="bb-viz__toolbar-btn"
          disabled={!Object.values(channelInfo).some((state) => state.soloed)}
          dangerouslySetInnerHTML={{ __html: icon('eye') }}
          id="bb-viz-clear-solo"
          onClick={(event) => activateOnKeyboardClick(event, () => runChannelStateAction(clearAllSolo))}
          onPointerDown={(event) => activateOnPointerDown(event, () => runChannelStateAction(clearAllSolo))}
          title="Clear solo"
          type="button"
        />
        {performanceMode ? (
          <div className="bb-viz__performance-transport">
            <button
              aria-label="Play current song"
              className="bb-viz__toolbar-btn bb-viz__performance-transport-btn"
              dangerouslySetInnerHTML={{ __html: icon('play') }}
              disabled={!onPlay}
              onClick={(event) => activateOnKeyboardClick(event, () => onPlay?.())}
              onPointerDown={(event) => activateOnPointerDown(event, () => onPlay?.())}
              title="Play current song"
              type="button"
            />
            <button
              aria-label="Stop playback"
              className="bb-viz__toolbar-btn bb-viz__performance-transport-btn"
              dangerouslySetInnerHTML={{ __html: icon('stop') }}
              disabled={!onStop && !playbackManager}
              onClick={(event) => activateOnKeyboardClick(event, () => (onStop ? onStop() : playbackManager?.stop()))}
              onPointerDown={(event) => activateOnPointerDown(event, () => (onStop ? onStop() : playbackManager?.stop()))}
              title="Stop playback"
              type="button"
            />
          </div>
        ) : null}
        <button
          aria-label={performanceTitle}
          className="bb-viz__toolbar-btn bb-viz__toolbar-btn--performance"
          dangerouslySetInnerHTML={{ __html: icon(performanceIcon) }}
          id="bb-viz-fullscreen"
          onClick={(event) => activateOnKeyboardClick(event, () => {
            if (!performanceMode) {
              flushSync(() => setPerformanceMode(true));
              return;
            }
            if (document.fullscreenElement) {
              void document.exitFullscreen?.().catch(() => undefined);
              return;
            }
            void rootRef.current?.requestFullscreen?.().catch(() => undefined);
          })}
          onPointerDown={(event) => activateOnPointerDown(event, () => {
            if (!performanceMode) {
              flushSync(() => setPerformanceMode(true));
              return;
            }
            if (document.fullscreenElement) {
              void document.exitFullscreen?.().catch(() => undefined);
              return;
            }
            void rootRef.current?.requestFullscreen?.().catch(() => undefined);
          })}
          title={performanceTitle}
          type="button"
        />
        {performanceMode ? (
          <button
            aria-label="Exit performance mode"
            className="bb-viz__toolbar-btn bb-viz__toolbar-btn--exit-performance"
            dangerouslySetInnerHTML={{ __html: icon('x-mark') }}
            id="bb-viz-exit"
            onClick={(event) => activateOnKeyboardClick(event, () => {
              flushSync(() => setPerformanceMode(false));
              if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
            })}
            onPointerDown={(event) => activateOnPointerDown(event, () => {
              flushSync(() => setPerformanceMode(false));
              if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
            })}
            title="Exit performance mode"
            type="button"
          />
        ) : null}
      </div>
      <canvas
        className={performanceMode && bgEffectId !== 'none' ? '' : 'bb-viz__bg-hidden'}
        id="bb-viz-bg"
        ref={bgCanvasRef}
      />
      <div className={`bb-viz__channels ${performanceMode ? 'bb-viz__channels--vertical' : 'bb-viz__channels--horizontal'}`}>
        {channels.length === 0 ? (
          <div className="bb-viz__empty">No channels defined</div>
        ) : channels.map((ch: any) => {
          const meta = getChannelMeta(activeChip, ch.id);
          const info = channelInfo[ch.id];
          const muted = info?.muted ?? false;
          const soloed = info?.soloed ?? false;
          const audible = isChannelAudible(channelInfo, ch.id);
          const position = positions[ch.id];
          const defaultInst = getInstrumentName(ch, ast);
          return (
            <div
              className={`bb-viz__card${audible ? '' : ' bb-viz__card--silent'}`}
              data-channel={String(ch.id)}
              id={`bb-viz-card-${ch.id}`}
              key={ch.id}
              style={{ '--bb-ch-accent': meta.color } as CSSProperties}
            >
              <div className="bb-viz__progress-wrap">
                <div className="bb-viz__progress-fill" id={`bb-viz-progress-${ch.id}`} style={{ width: `${Math.round((position?.progress ?? 0) * 100)}%` }} />
              </div>
              <div className="bb-viz__position" id={`bb-viz-pos-${ch.id}`} style={{ display: showDebug ? 'block' : 'none' }}>
                {position?.positionLabel ?? '0/0'}
              </div>
              <div className="bb-viz__card-header">
                <div
                  className="bb-viz__level-bar"
                  id={`bb-viz-level-${ch.id}`}
                  style={{ background: meta.color, opacity: audible ? '0.35' : '0.15' }}
                />
                <div className="bb-viz__left-col">
                  <div className="bb-viz__title-block">
                    <span className="bb-viz__channel-title">{`Channel ${ch.id}`}</span>
                    <span className="bb-viz__chip-label">{meta.label}</span>
                  </div>
                  <div className="bb-viz__ctrl-row">
                    <button
                      aria-pressed={muted}
                      className={`bb-cp__btn bb-cp__btn--mute${muted ? ' bb-cp__btn--active' : ''}`}
                      id={`bb-viz-mute-${ch.id}`}
                      onClick={(event) => activateOnKeyboardClick(event, () => runChannelStateAction(() => toggleChannelMuted(ch.id)))}
                      onPointerDown={(event) => activateOnPointerDown(event, () => runChannelStateAction(() => toggleChannelMuted(ch.id)))}
                      title={muted ? 'Unmute channel' : 'Mute channel'}
                      type="button"
                    >
                      M
                    </button>
                    <button
                      aria-pressed={soloed}
                      className={`bb-cp__btn bb-cp__btn--solo${soloed ? ' bb-cp__btn--active' : ''}`}
                      id={`bb-viz-solo-${ch.id}`}
                      onClick={(event) => activateOnKeyboardClick(event, () => runChannelStateAction(() => toggleChannelSoloed(ch.id)))}
                      onPointerDown={(event) => activateOnPointerDown(event, () => runChannelStateAction(() => toggleChannelSoloed(ch.id)))}
                      title={soloed ? 'Remove solo' : 'Solo this channel'}
                      type="button"
                    >
                      S
                    </button>
                  </div>
                </div>
                <div className="bb-viz__header-right">
                  <div
                    className="bb-viz__inst"
                    data-default-inst={defaultInst}
                    id={`bb-viz-inst-${ch.id}`}
                    style={{ color: position?.currentInstrument ? '#4affaf' : undefined }}
                  >
                    {position?.currentInstrument ?? defaultInst}
                  </div>
                  <div className="bb-viz__pattern" id={`bb-viz-pattern-${ch.id}`} style={{ color: position?.patternLabel ? '#9cdcfe' : undefined }}>
                    {position?.patternLabel ?? ''}
                  </div>
                  <canvas
                    className="bb-viz__wave-canvas"
                    height={performanceMode ? 220 : 80}
                    id={`bb-viz-wave-${ch.id}`}
                    ref={(canvas) => {
                      if (canvas) canvasRefs.current.set(ch.id, canvas);
                      else canvasRefs.current.delete(ch.id);
                    }}
                    width={320}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function createDesktopSongVisualizer(
  container: HTMLElement,
  options: DesktopSongVisualizerOptions,
): DesktopSongVisualizerHandle {
  const handleRef = { current: null as DesktopSongVisualizerHandle | null };
  let root: Root | null = createRoot(container);

  flushSync(() => {
    root?.render(
      <DesktopSongVisualizer
        {...options}
        visualizerRef={(handle) => {
          handleRef.current = handle;
        }}
      />,
    );
  });

  return {
    dispose: () => {
      handleRef.current?.dispose();
      if (root) {
        root.unmount();
        root = null;
      }
    },
  };
}
