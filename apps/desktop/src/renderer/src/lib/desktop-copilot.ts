import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { Diagnostic } from '@beatbax/app-core/editor/diagnostics';
import {
  FeatureFlag,
  isFeatureEnabled,
  setFeatureEnabled,
} from '@beatbax/app-core/utils/feature-flags';
import type { RightTabsController } from '../components/shell/tabs';
import {
  markLastAppliedEditUndoneInEditor,
  markLastPendingAppliedEdit,
  resolveStuckPendingAppliedEdits,
  setCopilotReviewActive,
} from '@beatbax/app-core/stores/chat.store';
import { collectSemanticChangeLines } from './bax-def-index';
import {
  buildChangeDecorationSpecs,
  collectChangeHighlightLines,
  MAX_INLINE_CHANGE_HIGHLIGHTS,
  revealChangeLine,
} from './copilot-change-highlights';
import {
  buildFocusedChangeDecorationSpecs,
  pendingReviewChanges,
  type ReviewableCopilotChange,
} from './copilot-change-review';
import {
  collectCopilotEditChanges,
  describeCopilotEditChange,
  refreshCopilotEditChangeLines,
  resolveCopilotChangeLineNumber,
  revertCopilotEditChange,
} from './copilot-edit-changes';
import { computeLineChangeDiff } from './line-change-diff';
import { createDesktopCopilotPanel, countAIChangeDiff, formatAIChangeBanner, type CopilotAddSelectionOptions, type CopilotAskAboutErrorOptions, type DesktopCopilotPanelHandle } from '../components/panels/DesktopCopilotPanel';
import { notifyEditorContentChanged } from './copilot-editor-sync';

interface PendingAIChange {
  baselineContent: string;
  /** Per-definition review; null uses legacy all-or-nothing Keep/Discard. */
  changes: ReviewableCopilotChange[] | null;
  currentPendingIndex: number;
  decorationIds: string[];
  banner: HTMLElement;
}

export interface DesktopCopilotOptions {
  rightTabs: RightTabsController;
  eventBus: EventBus;
  getEditor: () => BeatBaxEditor | null;
  getDiagnostics: () => Diagnostic[];
  runParse: (content: string) => void;
  onSettingsRefresh?: () => void;
  onOpenSettings?: () => void;
}

export interface DesktopCopilotHandle {
  show: (options?: { activate?: boolean }) => void;
  hide: () => void;
  toggle: () => boolean;
  isVisible: () => boolean;
  askAboutError: (options: CopilotAskAboutErrorOptions) => void;
  addSelectionToChat: (options: CopilotAddSelectionOptions) => void;
  dispose: () => void;
}

export function setupDesktopCopilot(options: DesktopCopilotOptions): DesktopCopilotHandle | null {
  const { rightTabs, eventBus, getEditor, getDiagnostics, runParse, onSettingsRefresh, onOpenSettings } = options;
  const aiContainer = document.createElement('div');
  aiContainer.style.cssText = 'flex:1 1 0;overflow:hidden;display:flex;flex-direction:column;';
  rightTabs.tabContents.ai!.appendChild(aiContainer);

  const aiTabBtn = rightTabs.tabButtons.ai;
  aiTabBtn?.classList.add('bb-right-tab--hidden');

  let chatPanel: DesktopCopilotPanelHandle | null = null;
  let pendingAIChange: PendingAIChange | null = null;
  let focusPendingReviewChange: ((changeId: string) => void) | null = null;
  let copilotReviewUndoOpen = false;
  let copilotUndoWatchBaseline: string | null = null;
  const shortcutAbortController = new AbortController();

  function isCopilotOpen(): boolean {
    return rightTabs.tabOpen.ai
      && !aiTabBtn?.classList.contains('bb-right-tab--hidden');
  }

  function syncEditorAfterChange(): void {
    const wrapper = getEditor();
    wrapper?.cancelPendingChangeNotification();
    const content = wrapper?.getValue() ?? '';
    notifyEditorContentChanged(content, eventBus, runParse);
  }

  function beginCopilotReviewUndoGroup(): void {
    const monacoEditor = getEditor()?.editor;
    if (!monacoEditor || copilotReviewUndoOpen) return;
    monacoEditor.pushUndoStop();
    copilotReviewUndoOpen = true;
  }

  function endCopilotReviewUndoGroup(): void {
    if (!copilotReviewUndoOpen) return;
    getEditor()?.editor?.pushUndoStop();
    copilotReviewUndoOpen = false;
  }

  function applyReviewEditorContent(content: string, source: string): void {
    const monacoEditor = getEditor()?.editor;
    const model = monacoEditor?.getModel();
    if (!monacoEditor || !model || model.getValue() === content) return;
    monacoEditor.executeEdits(source, [{
      range: model.getFullModelRange(),
      text: content,
      forceMoveMarkers: true,
    }]);
  }

  function checkCopilotUndoWatch(content: string): void {
    if (pendingAIChange || !copilotUndoWatchBaseline) return;
    if (content !== copilotUndoWatchBaseline) return;
    if (markLastAppliedEditUndoneInEditor()) {
      copilotUndoWatchBaseline = null;
    }
  }

  function revertEntireCopilotEdit(): void {
    if (!pendingAIChange) return;
    const snapshot = pendingAIChange;
    applyReviewEditorContent(snapshot.baselineContent, 'copilot-review-revert-entire');
    if (snapshot.changes) {
      snapshot.changes = snapshot.changes.map((change) => ({ ...change, status: 'discarded' as const }));
      pendingAIChange = snapshot;
    }
    copilotUndoWatchBaseline = null;
    finalizeReview('discarded');
  }

  function dismissPendingBanner(settleAbandonedReview = false): void {
    if (!pendingAIChange) {
      setCopilotReviewActive(false);
      return;
    }
    if (settleAbandonedReview) {
      resolveStuckPendingAppliedEdits('kept');
    }
    focusPendingReviewChange = null;
    getEditor()?.editor?.deltaDecorations(pendingAIChange.decorationIds, []);
    pendingAIChange.banner.remove();
    pendingAIChange = null;
    setCopilotReviewActive(false);
  }

  function revealEditorChange(changeId: string, fallbackLine: number): void {
    const monacoEditor = getEditor()?.editor;
    const model = monacoEditor?.getModel();
    if (!monacoEditor || !model) return;

    if (focusPendingReviewChange) {
      focusPendingReviewChange(changeId);
      return;
    }

    const lineNumber = resolveCopilotChangeLineNumber(model.getValue(), changeId, fallbackLine);
    revealChangeLine(monacoEditor, lineNumber);
  }

  function finalizeReview(outcome: 'kept' | 'discarded'): void {
    if (!pendingAIChange) return;
    const monacoEditor = getEditor()?.editor;
    const model = monacoEditor?.getModel();
    const baseline = pendingAIChange.baselineContent;
    const changes = pendingAIChange.changes;
    dismissPendingBanner();
    endCopilotReviewUndoGroup();

    const current = model?.getValue() ?? '';
    if (model && changes) {
      const lineDiff = computeLineChangeDiff(baseline, current);
      const counts = countAIChangeDiff(lineDiff);
      markLastPendingAppliedEdit(outcome, {
        changeDetails: changes.map((change) => ({
          id: change.id,
          kind: change.kind,
          name: change.name,
          action: change.action,
          previousLine: change.previousLine,
          nextLine: change.nextLine,
          lineNumber: change.lineNumber,
          reviewStatus: change.status,
        })),
        changedLines: counts.total,
        linesAdded: counts.added,
        linesRemoved: counts.removed,
        linesModified: counts.modified,
      });
    } else {
      markLastPendingAppliedEdit(outcome);
    }

    if (outcome === 'kept' && current !== baseline) {
      copilotUndoWatchBaseline = baseline;
    } else {
      copilotUndoWatchBaseline = null;
    }
    syncEditorAfterChange();
  }

  function clearPendingAIChange(restore = false): void {
    if (!pendingAIChange) return;

    if (pendingAIChange.changes) {
      const monacoEditor = getEditor()?.editor;
      const model = monacoEditor?.getModel();
      const snapshot = pendingAIChange;
      if (restore && model && monacoEditor) {
        let content = model.getValue();
        for (const change of snapshot.changes!) {
          if (change.status !== 'pending') continue;
          content = revertCopilotEditChange(content, change, snapshot.baselineContent);
          change.status = 'discarded';
        }
        applyReviewEditorContent(content, 'copilot-review-discard-remaining');
        snapshot.changes = refreshCopilotEditChangeLines(content, snapshot.changes!);
      } else if (snapshot.changes) {
        snapshot.changes = snapshot.changes.map((change) => (
          change.status === 'pending' ? { ...change, status: 'kept' as const } : change
        ));
      }
      pendingAIChange = snapshot;
      const anyKept = snapshot.changes!.some((change) => change.status === 'kept');
      finalizeReview(restore && !anyKept ? 'discarded' : 'kept');
      return;
    }

    const baseline = pendingAIChange.baselineContent;
    const monacoEditor = getEditor()?.editor;
    if (monacoEditor) {
      monacoEditor.deltaDecorations(pendingAIChange.decorationIds, []);
      if (restore) {
        applyReviewEditorContent(baseline, 'copilot-review-discard-legacy');
        monacoEditor.focus();
      }
    }
    dismissPendingBanner();
    endCopilotReviewUndoGroup();
    markLastPendingAppliedEdit(restore ? 'discarded' : 'kept');
    if (restore) {
      copilotUndoWatchBaseline = null;
    } else {
      const current = getEditor()?.getValue() ?? '';
      copilotUndoWatchBaseline = current !== baseline ? baseline : null;
    }
    syncEditorAfterChange();
  }

  function getChatPanel(): DesktopCopilotPanelHandle {
    if (!chatPanel) {
      chatPanel = createDesktopCopilotPanel(aiContainer, {
        getEditorContent: () => getEditor()?.getValue() ?? '',
        getDiagnostics,
        onInsertSnippet: (text) => {
          const monacoEditor = getEditor()?.editor;
          if (!monacoEditor) return;
          const pos = monacoEditor.getPosition();
          if (!pos) return;
          monacoEditor.executeEdits('chat-panel', [{
            range: {
              startLineNumber: pos.lineNumber,
              startColumn: pos.column,
              endLineNumber: pos.lineNumber,
              endColumn: pos.column,
            },
            text,
            forceMoveMarkers: true,
          }]);
          monacoEditor.focus();
          syncEditorAfterChange();
        },
        onReplaceSelection: (text) => {
          const monacoEditor = getEditor()?.editor;
          if (!monacoEditor) return;
          const sel = monacoEditor.getSelection();
          if (!sel) return;
          monacoEditor.executeEdits('chat-panel', [{ range: sel, text, forceMoveMarkers: true }]);
          monacoEditor.focus();
          syncEditorAfterChange();
        },
        onReplaceEditor: (text, options) => {
          const wrapper = getEditor();
          const monacoEditor = wrapper?.editor;
          const model = monacoEditor?.getModel();
          // Replace via executeEdits (not setValue) so the change is a single
          // undoable operation — setValue() wipes Monaco's undo stack.
          if (monacoEditor && model) {
            if (options?.beginCopilotReview) {
              beginCopilotReviewUndoGroup();
            } else {
              monacoEditor.pushUndoStop();
            }
            monacoEditor.executeEdits('chat-panel-replace', [{
              range: model.getFullModelRange(),
              text,
              forceMoveMarkers: true,
            }]);
            if (!options?.beginCopilotReview) {
              monacoEditor.pushUndoStop();
            }
            monacoEditor.focus();
          } else {
            wrapper?.setValue(text);
            wrapper?.focus();
          }
          syncEditorAfterChange();
        },
        onHighlightChanges: (diff, previousContent) => {
          const monacoEditor = getEditor()?.editor;
          const model = monacoEditor?.getModel();
          const { total: changeCount } = countAIChangeDiff(diff);
          if (!monacoEditor || !model || changeCount === 0) return;
          dismissPendingBanner(true);

          const semanticChanges = collectCopilotEditChanges(previousContent, model.getValue())
            .map((change) => ({ ...change, status: 'pending' as const }));

          if (semanticChanges.length > 0) {
            const applyPerChangeReview = (): void => {
              const editorDom = monacoEditor.getDomNode();
              if (!editorDom) return;

              const banner = document.createElement('div');
              banner.className = 'bb-ai-change-banner';
              const dot = document.createElement('span');
              dot.className = 'bb-ai-change-banner-dot';
              dot.textContent = '⬤';
              const label = document.createElement('span');
              label.className = 'bb-ai-change-banner-label';

              let currentPendingIndex = 0;
              let decorationIds: string[] = [];

              const state: PendingAIChange = {
                baselineContent: previousContent,
                changes: semanticChanges,
                currentPendingIndex: 0,
                decorationIds: [],
                banner,
              };
              pendingAIChange = state;
              setCopilotReviewActive(true);

              const refreshDecorations = (): void => {
                const pending = pendingReviewChanges(state.changes!);
                const current = pending[currentPendingIndex];
                const specs = current
                  ? buildFocusedChangeDecorationSpecs(model, current)
                  : [];
                decorationIds = monacoEditor.deltaDecorations(decorationIds, specs);
                state.decorationIds = decorationIds;
              };

              const updateBanner = (): void => {
                const pending = pendingReviewChanges(state.changes!);
                if (pending.length === 0) {
                  const kept = state.changes!.some((change) => change.status === 'kept');
                  finalizeReview(kept ? 'kept' : 'discarded');
                  return;
                }
                if (currentPendingIndex >= pending.length) currentPendingIndex = 0;
                const current = pending[currentPendingIndex];
                label.textContent = describeCopilotEditChange(current);
                refreshDecorations();
                revealChangeLine(monacoEditor, current.lineNumber);
                counter.textContent = `${currentPendingIndex + 1}/${pending.length}`;
              };

              const counter = document.createElement('span');
              counter.className = 'bb-ai-banner-counter';

              const goToPending = (step: number): void => {
                const pending = pendingReviewChanges(state.changes!);
                if (pending.length === 0) return;
                currentPendingIndex = (currentPendingIndex + step + pending.length) % pending.length;
                state.currentPendingIndex = currentPendingIndex;
                updateBanner();
              };

              const keepCurrentChange = (): void => {
                const pending = pendingReviewChanges(state.changes!);
                const current = pending[currentPendingIndex];
                if (!current) return;
                current.status = 'kept';
                updateBanner();
              };

              const discardCurrentChange = (): void => {
                const pending = pendingReviewChanges(state.changes!);
                const current = pending[currentPendingIndex];
                if (!current) return;
                const nextContent = revertCopilotEditChange(model.getValue(), current, previousContent);
                applyReviewEditorContent(nextContent, 'copilot-review-discard');
                syncEditorAfterChange();
                current.status = 'discarded';
                state.changes = refreshCopilotEditChangeLines(model.getValue(), state.changes!);
                currentPendingIndex = Math.min(currentPendingIndex, Math.max(0, pendingReviewChanges(state.changes!).length - 1));
                state.currentPendingIndex = currentPendingIndex;
                updateBanner();
              };

              const prevBtn = document.createElement('button');
              prevBtn.className = 'bb-ai-banner-nav';
              prevBtn.textContent = '↑';
              prevBtn.title = 'Previous change';
              prevBtn.addEventListener('click', () => goToPending(-1));
              const nextBtn = document.createElement('button');
              nextBtn.className = 'bb-ai-banner-nav';
              nextBtn.textContent = '↓';
              nextBtn.title = 'Next change';
              nextBtn.addEventListener('click', () => goToPending(1));

              const keepBtn = document.createElement('button');
              keepBtn.className = 'bb-ai-banner-keep';
              keepBtn.textContent = '✓ Keep';
              keepBtn.title = 'Keep this change';
              keepBtn.addEventListener('click', keepCurrentChange);
              const discardBtn = document.createElement('button');
              discardBtn.className = 'bb-ai-banner-discard';
              discardBtn.textContent = '✗ Discard';
              discardBtn.title = 'Discard this change';
              discardBtn.addEventListener('click', discardCurrentChange);

              banner.append(dot, label, prevBtn, nextBtn, counter, keepBtn, discardBtn);
              editorDom.appendChild(banner);

              focusPendingReviewChange = (changeId: string): void => {
                const pending = pendingReviewChanges(state.changes!);
                const idx = pending.findIndex((change) => change.id === changeId);
                if (idx >= 0) {
                  currentPendingIndex = idx;
                  state.currentPendingIndex = idx;
                  updateBanner();
                  return;
                }
                const resolved = state.changes!.find((change) => change.id === changeId);
                if (resolved) {
                  const lineNumber = resolveCopilotChangeLineNumber(model.getValue(), changeId, resolved.lineNumber);
                  const specs = buildFocusedChangeDecorationSpecs(model, { ...resolved, lineNumber });
                  decorationIds = monacoEditor.deltaDecorations(decorationIds, specs);
                  state.decorationIds = decorationIds;
                  revealChangeLine(monacoEditor, lineNumber);
                }
              };

              updateBanner();
            };

            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(applyPerChangeReview);
            });
            return;
          }

          const lineRegions = collectChangeHighlightLines(diff);
          const semanticRegions = collectSemanticChangeLines(previousContent, model.getValue());
          const regions = semanticRegions.length > 0 && semanticRegions.length < lineRegions.length
            ? semanticRegions
            : lineRegions;
          const highlightCap = lineRegions.length > MAX_INLINE_CHANGE_HIGHLIGHTS
            ? new Set(lineRegions.slice(0, MAX_INLINE_CHANGE_HIGHLIGHTS))
            : undefined;
          const applyHighlights = (): void => {
            const specs = buildChangeDecorationSpecs(model, diff, { onlyLines: highlightCap });
            const ids = monacoEditor.deltaDecorations([], specs);
            const editorDom = monacoEditor.getDomNode();
            if (!editorDom) return;
            const banner = document.createElement('div');
            banner.className = 'bb-ai-change-banner';
            const dot = document.createElement('span');
            dot.className = 'bb-ai-change-banner-dot';
            dot.textContent = '⬤';
            const label = document.createElement('span');
            const bannerText = formatAIChangeBanner(diff);
            label.textContent = highlightCap
              ? `${bannerText} — showing ${MAX_INLINE_CHANGE_HIGHLIGHTS} of ${lineRegions.length} lines`
              : bannerText;

            let currentRegion = -1;

            const counter = document.createElement('span');
            counter.className = 'bb-ai-banner-counter';
            const updateCounter = (): void => {
              const pos = currentRegion < 0 ? 1 : currentRegion + 1;
              counter.textContent = `${pos}/${regions.length}`;
            };

            const goToRegion = (step: number): void => {
              if (regions.length === 0) return;
              currentRegion = (currentRegion + step + regions.length) % regions.length;
              revealChangeLine(monacoEditor, regions[currentRegion]);
              updateCounter();
            };

            const prevBtn = document.createElement('button');
            prevBtn.className = 'bb-ai-banner-nav';
            prevBtn.textContent = '↑';
            prevBtn.title = 'Previous change';
            prevBtn.addEventListener('click', () => goToRegion(-1));
            const nextBtn = document.createElement('button');
            nextBtn.className = 'bb-ai-banner-nav';
            nextBtn.textContent = 'Next change';
            nextBtn.addEventListener('click', () => goToRegion(1));

            banner.append(dot, label);
            if (regions.length > 0) {
              updateCounter();
              banner.append(prevBtn, nextBtn, counter);
            }
            editorDom.appendChild(banner);
            pendingAIChange = {
              baselineContent: previousContent,
              changes: null,
              currentPendingIndex: 0,
              decorationIds: ids,
              banner,
            };
            setCopilotReviewActive(true);
            if (regions.length > 0) goToRegion(1);
          };

          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(applyHighlights);
          });
        },
        onOpenSettings: () => {
          onSettingsRefresh?.();
          onOpenSettings?.();
        },
        onRevealEditorChange: revealEditorChange,
        copilotReviewActions: {
          onKeepRemaining: () => clearPendingAIChange(false),
          onDiscardRemaining: () => clearPendingAIChange(true),
          onRevertEntire: revertEntireCopilotEdit,
        },
      });
    }
    return chatPanel;
  }

  function askAboutError(options: CopilotAskAboutErrorOptions): void {
    if (!isFeatureEnabled(FeatureFlag.AI_ASSISTANT)) {
      setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true);
    }
    showCopilot({ activate: true });
    getChatPanel().askAboutError(options);
  }

  function addSelectionToChat(options: CopilotAddSelectionOptions): void {
    if (!isFeatureEnabled(FeatureFlag.AI_ASSISTANT)) {
      setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true);
    }
    showCopilot({ activate: true });
    getChatPanel().addSelectionToChat(options);
  }

  function showCopilot(options: { activate?: boolean } = {}): void {
    const { activate = true } = options;
    aiTabBtn?.classList.remove('bb-right-tab--hidden');
    rightTabs.tabOpen.ai = true;
    if (activate) {
      rightTabs.show('ai');
    }
    getChatPanel().show();
  }

  function hideCopilot(): void {
    getChatPanel().hide();
    rightTabs.close('ai');
    aiTabBtn?.classList.add('bb-right-tab--hidden');
    rightTabs.tabOpen.ai = false;
  }

  function toggle(): boolean {
    if (!isFeatureEnabled(FeatureFlag.AI_ASSISTANT)) {
      setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true);
      showCopilot();
      return true;
    }
    if (isCopilotOpen()) {
      hideCopilot();
      return false;
    }
    showCopilot();
    return true;
  }

  if (isFeatureEnabled(FeatureFlag.AI_ASSISTANT)) {
    showCopilot({ activate: false });
  }

  resolveStuckPendingAppliedEdits('kept');
  setCopilotReviewActive(false);

  const unsubFeature = eventBus.on('feature-flag:changed', ({ flag, enabled }) => {
    if (flag !== FeatureFlag.AI_ASSISTANT) return;
    if (enabled) showCopilot();
    else hideCopilot();
    onSettingsRefresh?.();
  });

  const unsubPanel = eventBus.on('panel:toggled', ({ panel, visible }) => {
    if (panel !== 'ai-assistant') return;
    if (visible) {
      setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true);
      showCopilot();
    } else {
      hideCopilot();
    }
  });

  const unsubAsk = eventBus.on('copilot:ask-about-error', (payload) => {
    askAboutError(payload);
  });

  const unsubSelection = eventBus.on('copilot:add-selection', (payload) => {
    addSelectionToChat(payload);
  });

  const unsubEditor = eventBus.on('editor:changed', ({ content }) => {
    checkCopilotUndoWatch(content);
  });

  window.addEventListener('keydown', (event) => {
    const isIKey = event.key.toLowerCase() === 'i' || event.code === 'KeyI';
    if (!isIKey || !event.altKey || !event.shiftKey || event.metaKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const aiActive = rightTabs.tabOpen.ai && rightTabs.activeTab === 'ai';
    eventBus.emit('panel:toggled', { panel: 'ai-assistant', visible: !aiActive });
  }, { capture: true, signal: shortcutAbortController.signal });

  return {
    show: showCopilot,
    hide: hideCopilot,
    toggle,
    isVisible: isCopilotOpen,
    askAboutError,
    addSelectionToChat,
    dispose: () => {
      shortcutAbortController.abort();
      clearPendingAIChange(false);
      endCopilotReviewUndoGroup();
      copilotUndoWatchBaseline = null;
      unsubFeature();
      unsubPanel();
      unsubAsk();
      unsubSelection();
      unsubEditor();
      chatPanel?.dispose();
      chatPanel = null;
    },
  };
}
