import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { flushSync } from 'react-dom';
import type { Root } from 'react-dom/client';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { PlaybackManager, PlaybackPosition } from '@beatbax/app-core/playback/playback-manager';
import { mountReactRoot, unmountReactRoot } from '../../utils/react-root';
import {
  channelStates,
  clearAllSolo,
  isChannelAudible,
  setChannelVolume,
  toggleChannelMuted,
  toggleChannelSoloed,
  unmuteAll,
  type ChannelInfo,
} from '@beatbax/app-core/stores/channel.store';
import { settingFeaturePerChannelAnalyser } from '@beatbax/app-core/stores/settings.store';
import { FeatureFlag, isFeatureEnabled } from '@beatbax/app-core/utils/feature-flags';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { chipRegistry } from '@beatbax/engine/chips';
import { getChannelMeta } from '@beatbax/ui-tokens/channel-meta';
import { icon } from '../../utils/icons';
import { getMeterDisplayGain, scaleRmsForMeter } from '../../utils/meter-display';

const VU_SEGMENTS = 12;
const VU_YELLOW_THRESHOLD = 8;
const VU_RED_THRESHOLD = 10;
const PEAK_HOLD_MS = 1500;
const RAF_INTERVAL_MS = 33;
const DEFAULT_HEIGHT_PX = 200;
const MIN_HEIGHT_PX = 80;
const MAX_HEIGHT_PX = 400;

export type MixerDockMode = 'docked' | 'inline';

interface DesktopChannelMixerOptions {
  container: HTMLElement;
  inlineContainer?: HTMLElement;
  eventBus: EventBus;
  playbackManager?: PlaybackManager;
}

interface DesktopChannelMixerProps extends Omit<DesktopChannelMixerOptions, 'container' | 'inlineContainer'> {
  mixerRef: Ref<DesktopChannelMixerHandle>;
  onDockModeChanged?: (mode: MixerDockMode) => void;
}

export interface DesktopChannelMixerHandle {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  isVisible: () => boolean;
  getDockMode: () => MixerDockMode;
  setDockMode: (mode: MixerDockMode) => void;
  destroy: () => void;
}

interface ChannelVuState {
  level: number;
  peak: number;
  peakTime: number;
  lastUpdateTime: number;
}

interface ChannelPositionState {
  currentInstrument: string | null;
}

function clampHeight(value: number): number {
  return Math.max(MIN_HEIGHT_PX, Math.min(MAX_HEIGHT_PX, value));
}

function readInitialVisible(): boolean {
  if (!isFeatureEnabled(FeatureFlag.CHANNEL_MIXER)) return false;
  const rawVisible = storage.get(StorageKey.PANEL_VIS_CHANNEL_MIXER);
  return rawVisible === undefined ? true : rawVisible === 'true';
}

function readInitialHeight(): number {
  const rawHeight = storage.get(StorageKey.CHANNEL_MIXER_HEIGHT);
  const parsedHeight = rawHeight ? parseInt(rawHeight, 10) : NaN;
  return Number.isNaN(parsedHeight) ? DEFAULT_HEIGHT_PX : clampHeight(parsedHeight);
}

function readInitialDockMode(): MixerDockMode {
  return storage.get(StorageKey.CHANNEL_MIXER_DOCK_MODE) === 'inline' ? 'inline' : 'docked';
}

function readInitialMasterVolume(): number {
  const raw = storage.get(StorageKey.MASTER_VOLUME, '100');
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 100;
}

function computeRms(samples: Float32Array): number {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += (samples[i] ?? 0) * (samples[i] ?? 0);
  return Math.sqrt(sum / samples.length);
}

function getInstrumentName(ch: any): string {
  const instNode = ch.inst ?? ch.instrument;
  if (typeof instNode === 'string') return instNode;
  if (instNode && typeof instNode === 'object') return instNode.name ?? instNode.id ?? `Ch${ch.id}`;
  return `Ch${ch.id}`;
}

function getInstrumentVolumeRange(activeChip: string): { min: number; max: number; isAttenuation: boolean } {
  const plugin = chipRegistry.get(activeChip);
  const r = plugin?.instrumentVolumeRange;
  return {
    min: r?.min ?? 0,
    max: r?.max ?? 15,
    isAttenuation: r?.isAttenuation ?? false,
  };
}

function extractInstrumentVolume(
  inst: any,
  range: { min: number; max: number; isAttenuation?: boolean },
): number | null {
  if (!inst) return null;
  const { min, max, isAttenuation = false } = range;
  const span = max - min;
  const parse = (raw: number): number => {
    if (span <= 0) return 0;
    const clamped = Math.max(min, Math.min(max, raw));
    const norm = (clamped - min) / span;
    return isAttenuation ? 1 - norm : norm;
  };
  if (inst.vol !== undefined) {
    const v = Number(inst.vol);
    return Number.isNaN(v) ? null : parse(v);
  }
  if (inst.env) {
    const first = String(inst.env).split(',')[0]?.trim() ?? '';
    const v = parseInt(first, 10);
    return Number.isNaN(v) ? null : parse(v);
  }
  return null;
}

function volumeEnabledForChannel(activeChip: string, channelId: number): boolean {
  const plugin = chipRegistry.get(activeChip);
  if (!plugin) return false;
  if (typeof plugin.supportsVolumeForChannel === 'function') return plugin.supportsVolumeForChannel(channelId - 1);
  return plugin.supportsPerChannelVolume ?? false;
}

function volumeDisabledTitle(activeChip: string, _channelId: number): string {
  const plugin = chipRegistry.get(activeChip);
  const chipSupports = plugin?.supportsPerChannelVolume ?? false;
  if (chipSupports) return 'This channel has fixed amplitude - no runtime volume available';
  const chipName = activeChip.charAt(0).toUpperCase() + activeChip.slice(1);
  return `${chipName} uses envelope-driven amplitude - no per-channel volume available`;
}

function hasChannelStructureChanged(oldAst: any, newAst: any): boolean {
  if (!oldAst) return true;
  if ((oldAst.chip ?? 'gameboy') !== (newAst.chip ?? 'gameboy')) return true;
  if (!oldAst.channels && !newAst.channels) return false;
  if (!oldAst.channels || !newAst.channels) return true;
  if (oldAst.channels.length !== newAst.channels.length) return true;
  const oldIds = oldAst.channels.map((c: any) => c.id).sort((a: number, b: number) => a - b);
  const newIds = newAst.channels.map((c: any) => c.id).sort((a: number, b: number) => a - b);
  return oldIds.some((id: number, index: number) => id !== newIds[index]);
}

function DesktopChannelMixer({
  mixerRef,
  eventBus,
  playbackManager = undefined,
  onDockModeChanged,
}: DesktopChannelMixerProps): React.JSX.Element {
  const [ast, setAst] = useState<any>(null);
  const [channelInfo, setChannelInfo] = useState<Record<number, ChannelInfo>>({ ...channelStates.get() });
  const [positions, setPositions] = useState<Record<number, ChannelPositionState>>({});
  const [visible, setVisible] = useState(readInitialVisible);
  const [collapsed, setCollapsed] = useState(() => storage.get(StorageKey.CHANNEL_MIXER_COLLAPSED) === 'true');
  const [height] = useState(readInitialHeight);
  const [dockMode, setDockModeState] = useState<MixerDockMode>(readInitialDockMode);
  const [analyserEnabled, setAnalyserEnabled] = useState(settingFeaturePerChannelAnalyser.get());
  const [masterVolumePct, setMasterVolumePct] = useState(readInitialMasterVolume);
  const visibleRef = useRef(visible);
  const dockModeRef = useRef(dockMode);
  const astRef = useRef<any>(ast);
  const analyserEnabledRef = useRef(analyserEnabled);
  const channelInfoRef = useRef(channelInfo);
  const masterVolumePctRef = useRef(masterVolumePct);
  const vuStateRef = useRef<Map<number, ChannelVuState>>(new Map());
  const activeAnalyserChannelsRef = useRef<Set<number>>(new Set());
  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);

  const channels = ast?.channels ?? [];
  const activeChip = (ast?.chip ?? 'gameboy').toLowerCase();

  useEffect(() => { visibleRef.current = visible; }, [visible]);
  useEffect(() => { dockModeRef.current = dockMode; }, [dockMode]);
  useEffect(() => { astRef.current = ast; }, [ast]);
  useEffect(() => { analyserEnabledRef.current = analyserEnabled; }, [analyserEnabled]);
  useEffect(() => { channelInfoRef.current = channelInfo; }, [channelInfo]);
  useEffect(() => { masterVolumePctRef.current = masterVolumePct; }, [masterVolumePct]);

  const setMixerVisible = useCallback((nextVisible: boolean) => {
    flushSync(() => setVisible(nextVisible));
    storage.set(StorageKey.PANEL_VIS_CHANNEL_MIXER, String(nextVisible));
  }, []);

  const applyDockMode = useCallback((mode: MixerDockMode) => {
    flushSync(() => setDockModeState(mode));
    storage.set(StorageKey.CHANNEL_MIXER_DOCK_MODE, mode);
    onDockModeChanged?.(mode);
  }, [onDockModeChanged]);

  const stopRaf = useCallback(() => {
    if (rafIdRef.current !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
  }, []);

  const drawVuMeters = useCallback(() => {
    const now = Date.now();
    for (const [channelId, state] of vuStateRef.current.entries()) {
      if (state.peak > 0 && now - state.peakTime > PEAK_HOLD_MS) {
        state.peak = Math.max(0, state.peak - 1);
        if (state.peak > 0) state.peakTime = now;
      }
      if (state.level > 0 && now - state.lastUpdateTime > RAF_INTERVAL_MS) {
        state.level = Math.max(0, state.level - 1);
      }
      const vuEl = document.getElementById(`bb-channel-mixer-vu-${channelId}`);
      if (!vuEl) continue;
      const segs = vuEl.querySelectorAll<HTMLElement>('.bb-channel-mixer__vu-seg');
      for (let domIdx = 0; domIdx < segs.length; domIdx++) {
        const segIdx = VU_SEGMENTS - 1 - domIdx;
        const seg = segs[domIdx];
        const isLit = segIdx < state.level;
        const isPeak = segIdx === state.peak - 1 && state.peak > 0;
        seg?.classList.toggle('bb-channel-mixer__vu-seg--lit', isLit);
        seg?.classList.toggle('bb-channel-mixer__vu-seg--peak', isPeak && !isLit);
      }
    }
  }, []);

  const startRaf = useCallback(() => {
    if (rafIdRef.current !== null || typeof requestAnimationFrame === 'undefined') return;
    const loop = (timestamp: number) => {
      if (!visibleRef.current) {
        rafIdRef.current = null;
        return;
      }
      if (timestamp - lastFrameTimeRef.current >= RAF_INTERVAL_MS) {
        lastFrameTimeRef.current = timestamp;
        drawVuMeters();
      }
      rafIdRef.current = requestAnimationFrame(loop);
    };
    rafIdRef.current = requestAnimationFrame(loop);
  }, [drawVuMeters]);

  const updateVuLevel = useCallback((channelId: number, level: number) => {
    let state = vuStateRef.current.get(channelId);
    if (!state) {
      state = { level: 0, peak: 0, peakTime: 0, lastUpdateTime: 0 };
      vuStateRef.current.set(channelId, state);
    }
    const now = Date.now();
    const clamped = Math.max(0, Math.min(VU_SEGMENTS, level));
    state.level = clamped;
    state.lastUpdateTime = now;
    if (clamped >= state.peak) {
      state.peak = clamped;
      state.peakTime = now;
    }
    if (channelId !== 0) {
      const aggregate = Math.max(
        0,
        ...Array.from(vuStateRef.current.entries())
          .filter(([id]) => id !== 0)
          .map(([, channelState]) => channelState.level),
      );
      const masterLevel = Math.round(aggregate * (masterVolumePctRef.current / 100));
      let masterState = vuStateRef.current.get(0);
      if (!masterState) {
        masterState = { level: 0, peak: 0, peakTime: 0, lastUpdateTime: 0 };
        vuStateRef.current.set(0, masterState);
      }
      masterState.level = Math.max(0, Math.min(VU_SEGMENTS, masterLevel));
      masterState.lastUpdateTime = now;
      if (masterState.level >= masterState.peak) {
        masterState.peak = masterState.level;
        masterState.peakTime = now;
      }
    }
  }, []);

  const resetVuState = useCallback(() => {
    activeAnalyserChannelsRef.current.clear();
    for (const state of vuStateRef.current.values()) {
      state.level = 0;
      state.peak = 0;
      state.peakTime = 0;
      state.lastUpdateTime = 0;
    }
    drawVuMeters();
  }, [drawVuMeters]);

  const syncChannelInfoFromStore = useCallback(() => {
    setChannelInfo({ ...channelStates.get() });
  }, []);

  const runChannelStateAction = useCallback((action: () => void) => {
    flushSync(() => {
      action();
      syncChannelInfoFromStore();
    });
  }, [syncChannelInfoFromStore]);

  const handleToolbarAction = useCallback((event: ReactPointerEvent<HTMLButtonElement>, disabled: boolean, action: () => void) => {
    if (event.button !== 0 || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  }, []);

  const handleFaderPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>, channelId: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const shaft = event.currentTarget;
    const applyFromClientY = (clientY: number) => {
      const rect = shaft.getBoundingClientRect();
      if (rect.height === 0) return;
      const pct = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      setChannelVolume(channelId, parseFloat((1 - pct).toFixed(3)));
      syncChannelInfoFromStore();
    };
    applyFromClientY(event.clientY);
    shaft.setPointerCapture?.(event.pointerId);
    const onMove = (moveEvent: PointerEvent) => applyFromClientY(moveEvent.clientY);
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [syncChannelInfoFromStore]);

  const applyMasterVolumeFromPct = useCallback((pct: number) => {
    const next = Math.max(0, Math.min(100, Math.round(pct)));
    flushSync(() => setMasterVolumePct(next));
    eventBus.emit('master-volume:changed', { volumePct: next, source: 'mixer' });
  }, [eventBus]);

  const handleMasterFaderPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const shaft = event.currentTarget;
    const applyFromClientY = (clientY: number) => {
      const rect = shaft.getBoundingClientRect();
      if (rect.height === 0) return;
      const pct = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      applyMasterVolumeFromPct((1 - pct) * 100);
    };
    applyFromClientY(event.clientY);
    shaft.setPointerCapture?.(event.pointerId);
    const onMove = (moveEvent: PointerEvent) => applyFromClientY(moveEvent.clientY);
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [applyMasterVolumeFromPct]);

  useImperativeHandle(mixerRef, () => ({
    show: () => {
      setMixerVisible(true);
      startRaf();
    },
    hide: () => {
      setMixerVisible(false);
      stopRaf();
    },
    toggle: () => {
      const nextVisible = !visibleRef.current;
      setMixerVisible(nextVisible);
      if (nextVisible) startRaf();
      else stopRaf();
    },
    isVisible: () => visibleRef.current,
    getDockMode: () => dockModeRef.current,
    setDockMode: (mode: MixerDockMode) => applyDockMode(mode),
    destroy: () => {
      stopRaf();
      setVisible(false);
    },
  }), [applyDockMode, setMixerVisible, startRaf, stopRaf]);

  useEffect(() => {
    if (visible) startRaf();
    else stopRaf();
  }, [startRaf, stopRaf, visible]);

  useEffect(() => {
    const cleanups = [
      eventBus.on('parse:success', ({ ast: nextAst }) => {
        setAst((currentAst: any) => {
          if (!hasChannelStructureChanged(currentAst, nextAst)) return nextAst;
          vuStateRef.current.clear();
          activeAnalyserChannelsRef.current.clear();
          for (const ch of nextAst?.channels ?? []) {
            vuStateRef.current.set(ch.id, { level: 0, peak: 0, peakTime: 0, lastUpdateTime: 0 });
          }
          setPositions({});
          return nextAst;
        });
      }),
      eventBus.on('song:loaded', () => {
        vuStateRef.current.clear();
        activeAnalyserChannelsRef.current.clear();
        setAst(null);
        setPositions({});
      }),
      eventBus.on('playback:position-changed', ({ channelId, position }: { channelId: number; position: PlaybackPosition }) => {
        setPositions((current) => ({
          ...current,
          [channelId]: { currentInstrument: position.currentInstrument ?? null },
        }));
        const channelAnalyserActive = analyserEnabledRef.current && activeAnalyserChannelsRef.current.has(channelId);
        if (!channelAnalyserActive) updateVuLevel(channelId, Math.round(VU_SEGMENTS * 0.5));
      }),
      eventBus.on('playback:channel-waveform', ({ channelId, samples }) => {
        activeAnalyserChannelsRef.current.add(channelId);
        const rms = computeRms(samples);
        const gain = getMeterDisplayGain((astRef.current?.chip ?? 'gameboy').toLowerCase(), channelId);
        updateVuLevel(channelId, Math.round(scaleRmsForMeter(rms, gain) * VU_SEGMENTS));
      }),
      eventBus.on('playback:stopped', resetVuState),
      eventBus.on('master-volume:changed', ({ volumePct }) => {
        flushSync(() => setMasterVolumePct(Math.max(0, Math.min(100, Math.round(volumePct)))));
      }),
      channelStates.subscribe((states) => setChannelInfo({ ...states })),
      settingFeaturePerChannelAnalyser.subscribe((val) => {
        setAnalyserEnabled(val);
        playbackManager?.setPerChannelAnalyser?.(val);
        if (!val) activeAnalyserChannelsRef.current.clear();
      }),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [eventBus, playbackManager, resetVuState, updateVuLevel]);

  const anyMuted = Object.values(channelInfo).some((state) => state.muted);
  const anySoloed = Object.values(channelInfo).some((state) => state.soloed);
  const docked = dockMode === 'docked';

  return (
    <div
      className={`bb-channel-mixer${collapsed ? ' bb-channel-mixer--collapsed' : ''}${dockMode === 'inline' ? ' bb-channel-mixer--inline' : ''}`}
      id="bb-channel-mixer"
      style={{
        display: visible ? undefined : 'none',
        '--bb-channel-mixer-height': `${height}px`,
      } as CSSProperties}
    >
      <div className="bb-channel-mixer__toolbar">
        <button
          aria-label={collapsed ? 'Expand mixer' : 'Collapse mixer'}
          className="bb-channel-mixer__toolbar-btn"
          dangerouslySetInnerHTML={{ __html: icon(collapsed ? 'chevron-up' : 'chevron-down') }}
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            storage.set(StorageKey.CHANNEL_MIXER_COLLAPSED, String(next));
          }}
          title={collapsed ? 'Expand mixer' : 'Collapse mixer'}
          type="button"
        />
        <button
          aria-disabled={!anyMuted ? 'true' : undefined}
          aria-label="Unmute all channels"
          className="bb-channel-mixer__toolbar-btn"
          dangerouslySetInnerHTML={{ __html: icon('speaker-wave', 'w-3.5 h-3.5') }}
          data-aria-disabled={!anyMuted ? 'true' : undefined}
          id="bb-channel-mixer-unmute-all"
          onPointerDown={(event) => handleToolbarAction(event, !anyMuted, () => runChannelStateAction(unmuteAll))}
          title="Unmute all channels"
          type="button"
        />
        <button
          aria-disabled={!anySoloed ? 'true' : undefined}
          aria-label="Clear solo on all channels"
          className="bb-channel-mixer__toolbar-btn"
          dangerouslySetInnerHTML={{ __html: icon('eye', 'w-3.5 h-3.5') }}
          data-aria-disabled={!anySoloed ? 'true' : undefined}
          id="bb-channel-mixer-clear-solo"
          onPointerDown={(event) => handleToolbarAction(event, !anySoloed, () => runChannelStateAction(clearAllSolo))}
          title="Clear solo"
          type="button"
        />
        <span className="bb-channel-mixer__toolbar-label">CHANNEL MIXER</span>
        <button
          aria-label={docked ? 'Switch to inline mode (beside output panel)' : 'Switch to full-width docked mode'}
          className="bb-channel-mixer__toolbar-btn bb-channel-mixer__toolbar-btn--dock"
          dangerouslySetInnerHTML={{ __html: icon(docked ? 'arrows-pointing-in' : 'arrows-pointing-out', 'w-3.5 h-3.5') }}
          id="bb-channel-mixer-dock-mode"
          onPointerDown={(event) => handleToolbarAction(event, false, () => applyDockMode(docked ? 'inline' : 'docked'))}
          title={docked ? 'Switch to inline mode (beside output panel)' : 'Switch to full-width docked mode'}
          type="button"
        />
      </div>
      <div className="bb-channel-mixer__strips">
        {channels.length === 0 ? (
          <div className="bb-channel-mixer__empty">No channels defined - parse a song to see channels</div>
        ) : channels.map((ch: any) => (
          <ChannelStrip
            activeChip={activeChip}
            ast={ast}
            channel={ch}
            channelInfo={channelInfo}
            key={ch.id}
            onFaderPointerDown={handleFaderPointerDown}
            onMute={(channelId) => runChannelStateAction(() => toggleChannelMuted(channelId))}
            onSolo={(channelId) => runChannelStateAction(() => toggleChannelSoloed(channelId))}
            position={positions[ch.id]}
          />
        ))}
        {channels.length > 0 ? (
          <MasterStrip
            onFaderPointerDown={handleMasterFaderPointerDown}
            volumePct={masterVolumePct}
          />
        ) : null}
      </div>
    </div>
  );
}

function MasterStrip({
  volumePct,
  onFaderPointerDown,
}: {
  volumePct: number;
  onFaderPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}): React.JSX.Element {
  return (
    <>
      <div className="bb-channel-mixer__master-separator" aria-hidden="true" />
      <div className="bb-channel-mixer__strip bb-channel-mixer__strip--master" id="bb-channel-mixer-master-strip">
        <div className="bb-channel-mixer__accent bb-channel-mixer__accent--master" />
        <div className="bb-channel-mixer__label bb-channel-mixer__label--master">MASTER</div>
        <div className="bb-channel-mixer__mid bb-channel-mixer__mid--master">
          <div className="bb-channel-mixer__fader-col bb-channel-mixer__fader-col--master" title="Master output volume">
            <div
              aria-label="Master volume"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={volumePct}
              className="bb-channel-mixer__fader-shaft"
              id="bb-channel-mixer-master-fader-shaft"
              onPointerDown={onFaderPointerDown}
              role="slider"
              tabIndex={0}
            >
              {[0, 25, 50, 75, 100].map((pct) => (
                <div
                  className={`bb-channel-mixer__fader-tick ${pct % 50 === 0 ? 'bb-channel-mixer__fader-tick--major' : 'bb-channel-mixer__fader-tick--minor'}`}
                  key={pct}
                  style={{ top: `${pct}%` }}
                />
              ))}
              <div
                className="bb-channel-mixer__fader-thumb bb-channel-mixer__fader-thumb--master"
                id="bb-channel-mixer-master-fader"
                style={{ top: `${100 - volumePct}%` }}
              />
            </div>
          </div>
          <div className="bb-channel-mixer__vu bb-channel-mixer__vu--master" id="bb-channel-mixer-vu-0">
            {Array.from({ length: VU_SEGMENTS }, (_, domIdx) => {
              const segIdx = VU_SEGMENTS - 1 - domIdx;
              const colorClass = segIdx >= VU_RED_THRESHOLD
                ? 'bb-channel-mixer__vu-seg--red'
                : segIdx >= VU_YELLOW_THRESHOLD
                  ? 'bb-channel-mixer__vu-seg--yellow'
                  : 'bb-channel-mixer__vu-seg--green';
              return <div className={`bb-channel-mixer__vu-seg ${colorClass}`} key={segIdx} />;
            })}
          </div>
        </div>
        <div className="bb-channel-mixer__inst bb-channel-mixer__inst--master" id="bb-channel-mixer-master-volume-readout">
          {String(volumePct).padStart(3, ' ')}%
        </div>
        <div className="bb-channel-mixer__master-caption">OUT</div>
      </div>
    </>
  );
}

function ChannelStrip({
  activeChip,
  ast,
  channel,
  channelInfo,
  position,
  onMute,
  onSolo,
  onFaderPointerDown,
}: {
  activeChip: string;
  ast: any;
  channel: any;
  channelInfo: Record<number, ChannelInfo>;
  position?: ChannelPositionState;
  onMute: (channelId: number) => void;
  onSolo: (channelId: number) => void;
  onFaderPointerDown: (event: ReactPointerEvent<HTMLDivElement>, channelId: number) => void;
}): React.JSX.Element {
  const channelId = channel.id as number;
  const meta = getChannelMeta(activeChip, channelId);
  const info = channelInfo[channelId];
  const muted = info?.muted ?? false;
  const soloed = info?.soloed ?? false;
  const audible = isChannelAudible(channelInfo, channelId);
  const defaultInst = getInstrumentName(channel);
  const currentInst = position?.currentInstrument ?? defaultInst;
  const volEnabled = volumeEnabledForChannel(activeChip, channelId);
  const volRange = getInstrumentVolumeRange(activeChip);
  const instDef = ast?.insts?.[currentInst] ?? ast?.insts?.[defaultInst];
  const instNativeVol = extractInstrumentVolume(instDef, volRange);
  const volume = info?.volume ?? 1;

  return (
    <div
      className={`bb-channel-mixer__strip${audible ? '' : ' bb-channel-mixer__strip--silent'}`}
      data-channel={String(channelId)}
      id={`bb-channel-mixer-strip-${channelId}`}
      style={{ '--bb-ch-accent': meta.color } as CSSProperties}
    >
      <div className="bb-channel-mixer__accent" style={{ background: meta.color }} />
      <div className="bb-channel-mixer__label">{meta.label.toUpperCase()}</div>
      <div className="bb-channel-mixer__mid">
        <div
          className={`bb-channel-mixer__fader-col${volEnabled ? '' : ' bb-channel-mixer__fader-col--disabled'}`}
          title={volEnabled ? undefined : volumeDisabledTitle(activeChip, channelId)}
        >
          <div
            className="bb-channel-mixer__fader-shaft"
            onPointerDown={volEnabled ? (event) => onFaderPointerDown(event, channelId) : undefined}
          >
            {[0, 25, 50, 75, 100].map((pct) => (
              <div
                className={`bb-channel-mixer__fader-tick ${pct % 50 === 0 ? 'bb-channel-mixer__fader-tick--major' : 'bb-channel-mixer__fader-tick--minor'}`}
                key={pct}
                style={{ top: `${pct}%` }}
              />
            ))}
            <div
              className="bb-channel-mixer__fader-thumb"
              id={`bb-channel-mixer-fader-${channelId}`}
              style={{ top: `${(1 - volume) * 100}%` }}
            />
          </div>
        </div>
        <div className="bb-channel-mixer__vu" id={`bb-channel-mixer-vu-${channelId}`}>
          {Array.from({ length: VU_SEGMENTS }, (_, domIdx) => {
            const segIdx = VU_SEGMENTS - 1 - domIdx;
            const colorClass = segIdx >= VU_RED_THRESHOLD
              ? 'bb-channel-mixer__vu-seg--red'
              : segIdx >= VU_YELLOW_THRESHOLD
                ? 'bb-channel-mixer__vu-seg--yellow'
                : 'bb-channel-mixer__vu-seg--green';
            return <div className={`bb-channel-mixer__vu-seg ${colorClass}`} key={segIdx} />;
          })}
        </div>
        <div className="bb-channel-mixer__inst-vol-col" title={`Instrument native volume (${volRange.min}-${volRange.max} scale${volRange.isAttenuation ? ', attenuation' : ''})`}>
          <div className="bb-channel-mixer__inst-vol-shaft">
            {[0, 1, 2, 3, 4].map((index) => {
              const range = volRange.max - volRange.min;
              const rawVal = volRange.isAttenuation
                ? volRange.min + Math.round((index / 4) * range)
                : volRange.max - Math.round((index / 4) * range);
              return (
                <div
                  className="bb-channel-mixer__inst-vol-tick"
                  key={index}
                  style={{ top: `${(index / 4) * 100}%` }}
                  title={String(rawVal)}
                />
              );
            })}
            <div
              className="bb-channel-mixer__inst-vol-notch"
              id={`bb-channel-mixer-ref-${channelId}`}
              style={{
                display: instNativeVol === null ? 'none' : undefined,
                top: instNativeVol === null ? undefined : `${(1 - instNativeVol) * 100}%`,
              }}
              title={instNativeVol === null ? undefined : `Instrument level: ${Math.round(instNativeVol * volRange.max)}/${volRange.max} (${Math.round(instNativeVol * 100)}%)`}
            />
          </div>
        </div>
      </div>
      <div
        className="bb-channel-mixer__inst"
        data-default-inst={defaultInst}
        id={`bb-channel-mixer-inst-${channelId}`}
        title={`Instrument: ${currentInst}`}
      >
        {currentInst}
      </div>
      <div className="bb-channel-mixer__btn-row">
        <button
          aria-label={muted ? 'Unmute channel' : 'Mute channel'}
          aria-pressed={muted}
          className={`bb-cp__btn bb-cp__btn--mute${muted ? ' bb-cp__btn--active' : ''}`}
          id={`bb-channel-mixer-mute-${channelId}`}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            onMute(channelId);
          }}
          title={muted ? 'Unmute channel' : 'Mute channel'}
          type="button"
        >
          M
        </button>
        <button
          aria-label={soloed ? 'Unsolo channel' : 'Solo channel'}
          aria-pressed={soloed}
          className={`bb-cp__btn bb-cp__btn--solo${soloed ? ' bb-cp__btn--active' : ''}`}
          id={`bb-channel-mixer-solo-${channelId}`}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            onSolo(channelId);
          }}
          title={soloed ? 'Unsolo channel' : 'Solo channel'}
          type="button"
        >
          S
        </button>
      </div>
    </div>
  );
}

export function createDesktopChannelMixer(options: DesktopChannelMixerOptions): DesktopChannelMixerHandle {
  const handleRef = { current: null as DesktopChannelMixerHandle | null };
  let root: Root | null = null;
  let host: HTMLElement | null = null;

  const mount = (mode: MixerDockMode) => {
    const target = mode === 'inline' && options.inlineContainer ? options.inlineContainer : options.container;
    if (!host) {
      host = document.createElement('div');
      host.className = 'bb-channel-mixer-react-host';
      root = mountReactRoot(host);
      flushSync(() => {
        root?.render(
          <DesktopChannelMixer
            eventBus={options.eventBus}
            mixerRef={(handle) => {
              handleRef.current = handle;
            }}
            onDockModeChanged={mount}
            playbackManager={options.playbackManager}
          />,
        );
      });
    }
    if (host.parentElement !== target) target.appendChild(host);
  };

  mount(readInitialDockMode());

  return {
    show: () => handleRef.current?.show(),
    hide: () => handleRef.current?.hide(),
    toggle: () => handleRef.current?.toggle(),
    isVisible: () => handleRef.current?.isVisible() ?? false,
    getDockMode: () => handleRef.current?.getDockMode() ?? readInitialDockMode(),
    setDockMode: (mode) => {
      mount(mode);
      handleRef.current?.setDockMode(mode);
    },
    destroy: () => {
      handleRef.current?.destroy();
      if (host) unmountReactRoot(host, root);
      root = null;
      host?.remove();
      host = null;
    },
  };
}
