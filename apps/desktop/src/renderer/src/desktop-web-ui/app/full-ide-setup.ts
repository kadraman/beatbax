/**
 * Shared wiring for desktop-full IDE features: debug overlay, transport extras,
 * and MIDI step entry. Used by the Electron desktop client; web-ui main.ts
 * inlines equivalent logic for now.
 */

import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import { triggerEffectPreview, triggerStepEntryAudition } from '@beatbax/app-core/editor/codelens-preview';
import type { TransportControls } from '@beatbax/app-core/playback/transport-controls';
import type { PlaybackManager } from '@beatbax/app-core/playback/playback-manager';
import type { ClientCapabilities } from '@beatbax/app-core/client-profile';
import {
  settingDebugOverlay,
  settingDebugOverlayFontSize,
  settingDebugOverlayOpacity,
  settingDebugOverlayPosition,
  settingMidiInputDevice,
  settingMidiInputEnabled,
} from '@beatbax/app-core/stores/settings.store';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { MidiStepEntryController } from '../input/midi-step-entry-controller';
import { DebugOverlay } from '../ui/debug-overlay';

export interface OutputPanelLogHandle {
  addMessage: (message: {
    type: 'error' | 'warning' | 'info' | 'success';
    message: string;
    source?: string;
    timestamp: Date;
  }) => void;
}

export interface FullIdeTransportHandle {
  liveButton: HTMLButtonElement;
  rewindButton: HTMLButtonElement;
  loopButton: HTMLButtonElement;
  recordButton: HTMLButtonElement;
  bpmDownButton: HTMLButtonElement;
  bpmUpButton: HTMLButtonElement;
  volKnob: {
    onChange: (handler: (value: number) => void) => void;
  };
  setLoopActive: (active: boolean) => void;
  setVol: (pct: number) => void;
  setBpm: (bpm: number) => void;
}

function opLog(panel: OutputPanelLogHandle, message: string, source = 'app'): void {
  panel.addMessage({ type: 'info', message, source, timestamp: new Date() });
}

function opWarn(panel: OutputPanelLogHandle, message: string, source = 'app'): void {
  panel.addMessage({ type: 'warning', message, source, timestamp: new Date() });
}

export interface TransportDisplayState {
  currentBpm: number;
  currentSig: number;
}

export interface FullIdeSetupOptions {
  playbackManager: PlaybackManager;
  eventBus: EventBus;
  transportBar: FullIdeTransportHandle;
  transportControls: TransportControls;
  outputPanel: OutputPanelLogHandle;
  getEditor: () => BeatBaxEditor | null;
  getSource: () => string;
  runParse: (content: string) => void;
  capabilities: ClientCapabilities;
  transportDisplay: TransportDisplayState;
}

export interface FullIdeSetupHandle {
  dispose: () => void;
}

export function setupFullIdeFeatures(options: FullIdeSetupOptions): FullIdeSetupHandle {
  const {
    playbackManager,
    eventBus,
    transportBar,
    transportControls,
    outputPanel,
    getEditor,
    getSource,
    runParse,
    capabilities,
    transportDisplay,
  } = options;

  const cleanups: Array<() => void> = [];
  const win = window as unknown as Record<string, unknown>;

  // ─── Debug overlay ──────────────────────────────────────────────────────────
  const debugOverlay = new DebugOverlay(
    playbackManager,
    settingDebugOverlayPosition.get(),
    settingDebugOverlayOpacity.get(),
    settingDebugOverlayFontSize.get(),
  );
  debugOverlay.toggle(settingDebugOverlay.get());
  cleanups.push(
    settingDebugOverlay.subscribe((enabled) => debugOverlay.toggle(enabled)),
    settingDebugOverlayPosition.subscribe((pos) => debugOverlay.setPosition(pos)),
    settingDebugOverlayOpacity.subscribe((pct) => debugOverlay.setOpacity(pct)),
    settingDebugOverlayFontSize.subscribe((px) => debugOverlay.setFontSize(px)),
  );

  // ─── Transport extras state ─────────────────────────────────────────────────
  let currentBpm = 120;
  let lastAstBpm = 120;
  let masterVolPct = storage.getJSON<number>(StorageKey.MASTER_VOLUME, 100) ?? 100;
  let loopMode = storage.getJSON<boolean>(StorageKey.PLAYBACK_LOOP, false) ?? false;
  let loopUserOverride = false;
  let bpmUserOverride = false;
  let liveMode = storage.getJSON<boolean>(StorageKey.FEATURE_HOT_RELOAD, false) ?? false;
  let hasParseErrors = false;
  let suppressLoadedEditorChangeContent: string | null = null;

  transportDisplay.currentBpm = currentBpm;
  transportDisplay.currentSig = 4;

  function syncTransportDisplay(): void {
    transportDisplay.currentBpm = currentBpm;
  }

  function setErrorState(hasErrors: boolean): void {
    hasParseErrors = hasErrors;
    transportControls.setHasErrors(hasErrors);
    transportBar.liveButton.disabled = hasErrors;
    if (hasErrors && liveMode) {
      liveMode = false;
      transportBar.liveButton.classList.remove('bb-live-btn--active');
      transportBar.liveButton.title = 'Toggle live-play mode';
      clearTimeout(win.__bb_liveTimer as ReturnType<typeof setTimeout> | undefined);
    }
  }

  function applyLiveMode(enabled: boolean): void {
    liveMode = enabled;
    storage.setJSON(StorageKey.FEATURE_HOT_RELOAD, liveMode);
    transportBar.liveButton.classList.toggle('bb-live-btn--active', liveMode);
    transportBar.liveButton.title = liveMode ? 'Live play ON — click to disable' : 'Toggle live-play mode';
    if (!liveMode) clearTimeout(win.__bb_liveTimer as ReturnType<typeof setTimeout> | undefined);
  }

  function applyLoopMode(enabled: boolean): void {
    loopMode = enabled;
    transportBar.loopButton.classList.toggle('bb-loop-btn--active', loopMode);
    transportBar.loopButton.title = loopMode ? 'Loop ON — click to disable' : 'Toggle loop playback';
    transportBar.setLoopActive(loopMode);
    playbackManager.setLoop(loopMode);
  }

  function applyMasterVolume(
    pct: number,
    source: 'transport' | 'mixer' | 'settings' = 'transport',
    emit = true,
  ): void {
    masterVolPct = Math.max(0, Math.min(100, Math.round(pct)));
    transportBar.setVol(masterVolPct);
    playbackManager.setMasterVolume(masterVolPct / 100);
    if (emit) eventBus.emit('master-volume:changed', { volumePct: masterVolPct, source });
  }

  win.__beatbax_setLiveMode = (enabled: boolean) => {
    if (hasParseErrors && enabled) return;
    applyLiveMode(enabled);
    opLog(outputPanel, enabled ? '⚡ Live play enabled (settings)' : '⚡ Live play disabled (settings)');
  };

  win.__beatbax_setLoop = (enabled: boolean) => {
    loopUserOverride = true;
    applyLoopMode(enabled);
    opLog(outputPanel, enabled ? '⟳ Loop enabled (settings)' : '⟳ Loop disabled (settings)');
  };

  transportBar.liveButton.addEventListener('click', () => {
    if (hasParseErrors) return;
    applyLiveMode(!liveMode);
    opLog(outputPanel, liveMode ? '⚡ Live play enabled' : '⚡ Live play disabled');
  });

  transportBar.rewindButton.addEventListener('click', () => {
    const wasPlaying = playbackManager.isPlaying();
    playbackManager.stop();
    if (wasPlaying) {
      setTimeout(() => playbackManager.play(getSource()), 80);
    }
  });

  transportBar.loopButton.addEventListener('click', () => {
    loopUserOverride = true;
    applyLoopMode(!loopMode);
    opLog(outputPanel, loopMode ? '⟳ Loop enabled' : '⟳ Loop disabled');
  });

  if (loopMode) applyLoopMode(true);
  if (liveMode) applyLiveMode(true);

  transportBar.setVol(masterVolPct);
  playbackManager.setMasterVolume(masterVolPct / 100);
  transportBar.volKnob.onChange((v) => {
    applyMasterVolume(v, 'transport');
  });
  cleanups.push(eventBus.on('master-volume:changed', ({ volumePct, source }) => {
    if (source === 'transport') return;
    applyMasterVolume(volumePct, source ?? 'settings', false);
  }));

  // ─── BPM nudge + override decoration ────────────────────────────────────────
  function injectBpmOverrideStyles(): void {
    if (document.getElementById('bb-bpm-override-styles')) return;
    const style = document.createElement('style');
    style.id = 'bb-bpm-override-styles';
    style.textContent = `
      .bb-bpm-override-after {
        font-style: italic;
        opacity: 0.6;
        color: #f0a050;
        pointer-events: none;
      }
      [data-theme="light"] .bb-bpm-override-after {
        color: #c07020;
      }
    `;
    document.head.appendChild(style);
  }
  injectBpmOverrideStyles();

  let bpmOverrideCollection: ReturnType<NonNullable<BeatBaxEditor['editor']>['createDecorationsCollection']> | null = null;

  function findBpmLine(): number {
    const source = getSource();
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*bpm\s+\d/.test(lines[i])) return i + 1;
    }
    return -1;
  }

  function clearBpmOverrideDecoration(): void {
    bpmOverrideCollection?.clear();
  }

  function applyBpmOverrideDecoration(bpm: number): void {
    const monacoEditor = getEditor()?.editor;
    if (!monacoEditor) return;
    const line = findBpmLine();
    if (line < 1) {
      clearBpmOverrideDecoration();
      return;
    }
    const model = monacoEditor.getModel();
    const endCol = model ? model.getLineMaxColumn(line) : 1;
    const decoration = {
      range: {
        startLineNumber: line,
        startColumn: endCol,
        endLineNumber: line,
        endColumn: endCol,
      },
      options: {
        showIfCollapsed: true,
        after: {
          content: `  ← runtime: ${bpm} BPM`,
          inlineClassName: 'bb-bpm-override-after',
        },
      },
    };
    if (bpmOverrideCollection) {
      bpmOverrideCollection.clear();
      bpmOverrideCollection = null;
    }
    bpmOverrideCollection = monacoEditor.createDecorationsCollection([decoration]);
  }

  function applyBpmStep(delta: number): void {
    bpmUserOverride = true;
    currentBpm = Math.min(300, Math.max(20, currentBpm + delta));
    syncTransportDisplay();
    transportBar.setBpm(currentBpm);
    playbackManager.setBpmOverride(currentBpm);
    applyBpmOverrideDecoration(currentBpm);
  }

  function attachHoldRepeat(
    btn: HTMLButtonElement,
    delta: number,
    stepFn: (step: number) => void,
  ): void {
    let repeatTimer: ReturnType<typeof setTimeout> | null = null;
    let intervalTimer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; }
      if (intervalTimer) { clearInterval(intervalTimer); intervalTimer = null; }
    };
    btn.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      stepFn(delta);
      repeatTimer = setTimeout(() => {
        intervalTimer = setInterval(() => stepFn(delta), 80);
      }, 400);
    });
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
  }

  attachHoldRepeat(transportBar.bpmDownButton, -1, applyBpmStep);
  attachHoldRepeat(transportBar.bpmUpButton, +1, applyBpmStep);

  // ─── Parse / song-load sync ─────────────────────────────────────────────────
  cleanups.push(
    eventBus.on('parse:error', () => setErrorState(true)),
    eventBus.on('validation:errors', ({ errors }) => setErrorState(errors.length > 0)),
    eventBus.on('parse:success', ({ ast, sourceBpm: evtSourceBpm }) => {
      try {
        const bpm = Number(evtSourceBpm ?? (ast as { bpm?: number })?.bpm ?? 120);
        if (!bpmUserOverride) {
          currentBpm = bpm;
          lastAstBpm = bpm;
          syncTransportDisplay();
          transportBar.setBpm(bpm);
        } else if (bpm !== lastAstBpm) {
          bpmUserOverride = false;
          playbackManager.setBpmOverride(null);
          clearBpmOverrideDecoration();
          currentBpm = bpm;
          lastAstBpm = bpm;
          syncTransportDisplay();
          transportBar.setBpm(bpm);
        } else {
          lastAstBpm = bpm;
          applyBpmOverrideDecoration(currentBpm);
        }

        let sig = Number((ast as { stepsPerBar?: number; time?: number })?.stepsPerBar
          ?? (ast as { time?: number })?.time ?? 0);
        if (!sig) {
          const m = getSource().match(/^\s*(?:stepsPerBar|time)\s+(\d+)/m);
          sig = m ? Number(m[1]) : 4;
        }
        transportDisplay.currentSig = sig;

        if (!loopUserOverride) {
          const songHasRepeat = (ast as { play?: { repeat?: boolean } })?.play?.repeat === true;
          const loopDefault = storage.getJSON<boolean>(StorageKey.PLAYBACK_LOOP, false) ?? false;
          const desired = songHasRepeat || loopDefault;
          if (desired !== loopMode) applyLoopMode(desired);
        }
      } catch { /* ignore */ }
    }),
    eventBus.on('song:loaded', ({ content }) => {
      loopUserOverride = false;
      bpmUserOverride = false;
      lastAstBpm = 120;
      suppressLoadedEditorChangeContent = content ?? null;
      playbackManager.setBpmOverride(null);
      clearBpmOverrideDecoration();
    }),
    eventBus.on('editor:changed', ({ content }) => {
      if (suppressLoadedEditorChangeContent !== null) {
        if (content === suppressLoadedEditorChangeContent) {
          suppressLoadedEditorChangeContent = null;
          return;
        }
        suppressLoadedEditorChangeContent = null;
      }

      clearTimeout(win.__bb_parseTimer as ReturnType<typeof setTimeout> | undefined);
      win.__bb_parseTimer = setTimeout(() => runParse(getSource()), 600);

      if (!liveMode || hasParseErrors) return;
      clearTimeout(win.__bb_liveTimer as ReturnType<typeof setTimeout> | undefined);
      win.__bb_liveTimer = setTimeout(() => playbackManager.play(getSource()), 800);
    }),
  );

  // ─── MIDI step entry ────────────────────────────────────────────────────────
  let midiController: MidiStepEntryController | null = null;

  if (!capabilities.midiStepEntry) {
    transportBar.recordButton.style.display = 'none';
  } else {
    midiController = new MidiStepEntryController({
      getEditor: () => getEditor()?.editor ?? null,
      onAuditionNote: (noteName) => {
        const monacoEditor = getEditor()?.editor;
        const model = monacoEditor?.getModel();
        const pos = monacoEditor?.getPosition();
        if (!model || !pos) return;
        triggerStepEntryAudition(model.getLineContent(pos.lineNumber), noteName);
      },
      onPreviewEffect: (effectName) => {
        triggerEffectPreview(effectName);
      },
      onWarning: (message) => {
        opWarn(outputPanel, message, 'midi');
      },
      onArmedChanged: (armed) => {
        transportBar.recordButton.classList.toggle('bb-record-btn--active', armed);
        transportBar.recordButton.title = armed
          ? 'MIDI Step Entry ON — click to stop'
          : 'Arm MIDI Step Entry (requires MIDI input enabled in Settings)';
      },
    });

    function updateRecordButtonEnabled(): void {
      const midiOn = settingMidiInputEnabled.get();
      const midiDeviceSelected = !!settingMidiInputDevice.get();
      const playing = playbackManager.isPlaying();
      transportBar.recordButton.disabled = !midiOn || !midiDeviceSelected || playing;
    }

    updateRecordButtonEnabled();
    transportBar.recordButton.title = 'Arm MIDI Step Entry (requires MIDI input enabled in Settings)';
    transportBar.recordButton.addEventListener('click', () => {
      void midiController?.toggleStepEntry();
    });

    cleanups.push(
      eventBus.on('playback:started', updateRecordButtonEnabled),
      eventBus.on('playback:stopped', updateRecordButtonEnabled),
      eventBus.on('playback:paused', updateRecordButtonEnabled),
      eventBus.on('playback:resumed', updateRecordButtonEnabled),
      settingMidiInputEnabled.subscribe(updateRecordButtonEnabled),
      settingMidiInputDevice.subscribe(updateRecordButtonEnabled),
      eventBus.on('parse:success', ({ ast, resolvedAst }) => {
        if (resolvedAst !== undefined) return;
        midiController?.setParsedAst(ast);
      }),
      eventBus.on('parse:error', () => {
        midiController?.setParsedAst(null);
      }),
    );

    void midiController.requestMidiAccess();
    win.__beatbax_midiStepEntry = midiController;
  }

  return {
    dispose: () => {
      midiController?.dispose();
      debugOverlay.destroy();
      clearBpmOverrideDecoration();
      delete win.__beatbax_setLiveMode;
      delete win.__beatbax_setLoop;
      delete win.__beatbax_midiStepEntry;
      for (const unsub of cleanups) unsub();
    },
  };
}
