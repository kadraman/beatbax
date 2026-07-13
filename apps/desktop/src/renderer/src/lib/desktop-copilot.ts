import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { Diagnostic } from '@beatbax/app-core/editor/diagnostics';
import {
  FeatureFlag,
  isFeatureEnabled,
  setFeatureEnabled,
} from '@beatbax/app-core/utils/feature-flags';
import type { RightTabsController } from '../components/shell/tabs';
import { markLastPendingAppliedEdit } from '@beatbax/app-core/stores/chat.store';
import { createDesktopCopilotPanel, countAIChangeDiff, formatAIChangeBanner, type CopilotAskAboutErrorOptions, type DesktopCopilotPanelHandle } from '../components/panels/DesktopCopilotPanel';
import { notifyEditorContentChanged } from './copilot-editor-sync';

interface PendingAIChange {
  previousContent: string;
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

  function clearPendingAIChange(restore = false): void {
    if (!pendingAIChange) return;
    const monacoEditor = getEditor()?.editor;
    if (monacoEditor) {
      monacoEditor.deltaDecorations(pendingAIChange.decorationIds, []);
      if (restore) {
        const model = monacoEditor.getModel();
        if (model) {
          monacoEditor.executeEdits('chat-undo', [{
            range: model.getFullModelRange(),
            text: pendingAIChange.previousContent,
            forceMoveMarkers: true,
          }]);
          monacoEditor.focus();
          syncEditorAfterChange();
        }
      }
    }
    pendingAIChange.banner.remove();
    pendingAIChange = null;
    markLastPendingAppliedEdit(restore ? 'discarded' : 'kept');
    if (!restore) syncEditorAfterChange();
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
        onReplaceEditor: (text) => {
          const wrapper = getEditor();
          const monacoEditor = wrapper?.editor;
          const model = monacoEditor?.getModel();
          // Replace via executeEdits (not setValue) so the change is a single
          // undoable operation — setValue() wipes Monaco's undo stack.
          if (monacoEditor && model) {
            monacoEditor.pushUndoStop();
            monacoEditor.executeEdits('chat-panel-replace', [{
              range: model.getFullModelRange(),
              text,
              forceMoveMarkers: true,
            }]);
            monacoEditor.pushUndoStop();
            monacoEditor.focus();
          } else {
            wrapper?.setValue(text);
            wrapper?.focus();
          }
          syncEditorAfterChange();
        },
        onHighlightChanges: (diff, previousContent) => {
          const monacoEditor = getEditor()?.editor;
          const { total: changeCount } = countAIChangeDiff(diff);
          if (!monacoEditor || changeCount === 0) return;
          clearPendingAIChange(false);

          const decorations: Array<{
            range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
            options: Record<string, unknown>;
          }> = [];

          for (const lineNum of diff.added) {
            decorations.push({
              range: { startLineNumber: lineNum, startColumn: 1, endLineNumber: lineNum, endColumn: 1 },
              options: {
                isWholeLine: true,
                className: 'bb-changed-line-added',
                overviewRulerColor: '#4ec94e',
                overviewRulerLane: 4,
              },
            });
          }

          for (const block of diff.modified) {
            const wasHint = block.removed
              .map((row) => `was: − ${row.text.trim() || '(empty line)'}`)
              .join('   ');
            for (const lineNum of block.newLines) {
              decorations.push({
                range: { startLineNumber: lineNum, startColumn: 1, endLineNumber: lineNum, endColumn: 1 },
                options: {
                  isWholeLine: true,
                  className: 'bb-changed-line-modified',
                  after: lineNum === block.line ? {
                    content: `  ${wasHint}`,
                    inlineClassName: 'bb-changed-line-removed-hint',
                  } : undefined,
                  overviewRulerColor: '#dcdcaa',
                  overviewRulerLane: 4,
                },
              });
            }
          }

          for (const anchor of diff.removed) {
            const hint = anchor.removed
              .map((row) => `− ${row.text.trim() || '(empty line)'}`)
              .join('   ');
            decorations.push({
              range: {
                startLineNumber: anchor.line,
                startColumn: 1,
                endLineNumber: anchor.line,
                endColumn: 1,
              },
              options: {
                isWholeLine: true,
                className: 'bb-changed-line-removed',
                after: {
                  content: `  ${hint}`,
                  inlineClassName: 'bb-changed-line-removed-hint',
                },
                overviewRulerColor: '#f48771',
                overviewRulerLane: 4,
              },
            });
          }

          const ids = monacoEditor.deltaDecorations([], decorations);
          const editorDom = monacoEditor.getDomNode();
          if (!editorDom) return;
          const banner = document.createElement('div');
          banner.className = 'bb-ai-change-banner';
          const dot = document.createElement('span');
          dot.className = 'bb-ai-change-banner-dot';
          dot.textContent = '⬤';
          const label = document.createElement('span');
          label.textContent = formatAIChangeBanner(diff);

          const regionLines = new Set<number>();
          const sortedAdded = [...diff.added].sort((a, b) => a - b);
          for (let k = 0; k < sortedAdded.length; k++) {
            if (k === 0 || sortedAdded[k] !== sortedAdded[k - 1] + 1) regionLines.add(sortedAdded[k]);
          }
          for (const block of diff.modified) regionLines.add(block.line);
          for (const anchor of diff.removed) regionLines.add(anchor.line);
          const regions = [...regionLines].sort((a, b) => a - b);
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
            const line = regions[currentRegion];
            monacoEditor.revealLineInCenter(line);
            monacoEditor.setPosition({ lineNumber: line, column: 1 });
            monacoEditor.focus();
            updateCounter();
          };

          const prevBtn = document.createElement('button');
          prevBtn.className = 'bb-ai-banner-nav';
          prevBtn.textContent = '↑';
          prevBtn.title = 'Previous change';
          prevBtn.addEventListener('click', () => goToRegion(-1));
          const nextBtn = document.createElement('button');
          nextBtn.className = 'bb-ai-banner-nav';
          nextBtn.textContent = '↓';
          nextBtn.title = 'Next change';
          nextBtn.addEventListener('click', () => goToRegion(1));

          const keepBtn = document.createElement('button');
          keepBtn.className = 'bb-ai-banner-keep';
          keepBtn.textContent = '✓ Keep';
          keepBtn.addEventListener('click', () => clearPendingAIChange(false));
          const discardBtn = document.createElement('button');
          discardBtn.className = 'bb-ai-banner-discard';
          discardBtn.textContent = '✗ Discard';
          discardBtn.addEventListener('click', () => clearPendingAIChange(true));

          banner.append(dot, label);
          if (regions.length > 1) {
            updateCounter();
            banner.append(prevBtn, nextBtn, counter);
          }
          banner.append(keepBtn, discardBtn);
          editorDom.appendChild(banner);
          pendingAIChange = { previousContent, decorationIds: ids, banner };
          if (regions.length > 0) goToRegion(1);
        },
        onOpenSettings: () => {
          onSettingsRefresh?.();
          onOpenSettings?.();
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
    dispose: () => {
      shortcutAbortController.abort();
      clearPendingAIChange(false);
      unsubFeature();
      unsubPanel();
      unsubAsk();
      chatPanel?.dispose();
      chatPanel = null;
    },
  };
}
