import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { Diagnostic } from '@beatbax/app-core/editor/diagnostics';
import {
  FeatureFlag,
  isFeatureEnabled,
  setFeatureEnabled,
} from '@beatbax/app-core/utils/feature-flags';
import type { RightTabsController } from '../components/shell/tabs';
import { createDesktopCopilotPanel, type DesktopCopilotPanelHandle } from '../components/panels/DesktopCopilotPanel';

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
  onSettingsRefresh?: () => void;
  onOpenSettings?: () => void;
}

export interface DesktopCopilotHandle {
  show: (options?: { activate?: boolean }) => void;
  hide: () => void;
  toggle: () => boolean;
  isVisible: () => boolean;
  dispose: () => void;
}

export function setupDesktopCopilot(options: DesktopCopilotOptions): DesktopCopilotHandle | null {
  const { rightTabs, eventBus, getEditor, getDiagnostics, onSettingsRefresh, onOpenSettings } = options;
  const aiContainer = document.createElement('div');
  aiContainer.style.cssText = 'flex:1 1 0;overflow:hidden;display:flex;flex-direction:column;';
  rightTabs.tabContents.ai!.appendChild(aiContainer);

  const aiTabBtn = rightTabs.tabButtons.ai;
  aiTabBtn?.classList.add('bb-right-tab--hidden');

  let chatPanel: DesktopCopilotPanelHandle | null = null;
  let pendingAIChange: PendingAIChange | null = null;
  let visible = false;

  function isCopilotOpen(): boolean {
    return visible
      && rightTabs.tabOpen.ai
      && !aiTabBtn?.classList.contains('bb-right-tab--hidden');
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
        }
      }
    }
    pendingAIChange.banner.remove();
    pendingAIChange = null;
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
        },
        onReplaceSelection: (text) => {
          const monacoEditor = getEditor()?.editor;
          if (!monacoEditor) return;
          const sel = monacoEditor.getSelection();
          if (!sel) return;
          monacoEditor.executeEdits('chat-panel', [{ range: sel, text, forceMoveMarkers: true }]);
          monacoEditor.focus();
        },
        onReplaceEditor: (text) => {
          getEditor()?.setValue(text);
          getEditor()?.focus();
        },
        onHighlightChanges: (addedLineNums, previousContent) => {
          const monacoEditor = getEditor()?.editor;
          if (!monacoEditor || addedLineNums.length === 0) return;
          clearPendingAIChange(false);
          const decorations = addedLineNums.map((lineNum) => ({
            range: { startLineNumber: lineNum, startColumn: 1, endLineNumber: lineNum, endColumn: 1 },
            options: {
              isWholeLine: true,
              className: 'bb-changed-line-added',
              overviewRulerColor: '#4ec94e',
              overviewRulerLane: 4,
            },
          }));
          const ids = monacoEditor.deltaDecorations([], decorations);
          const editorDom = monacoEditor.getDomNode();
          if (!editorDom) return;
          const banner = document.createElement('div');
          banner.className = 'bb-ai-change-banner';
          const dot = document.createElement('span');
          dot.className = 'bb-ai-change-banner-dot';
          dot.textContent = '⬤';
          const label = document.createElement('span');
          label.textContent = `AI: ${addedLineNums.length} changed line${addedLineNums.length !== 1 ? 's' : ''}`;
          const keepBtn = document.createElement('button');
          keepBtn.className = 'bb-ai-banner-keep';
          keepBtn.textContent = '✓ Keep';
          keepBtn.addEventListener('click', () => clearPendingAIChange(false));
          const discardBtn = document.createElement('button');
          discardBtn.className = 'bb-ai-banner-discard';
          discardBtn.textContent = '✗ Discard';
          discardBtn.addEventListener('click', () => clearPendingAIChange(true));
          banner.append(dot, label, keepBtn, discardBtn);
          editorDom.appendChild(banner);
          pendingAIChange = { previousContent, decorationIds: ids, banner };
        },
        onOpenSettings: () => {
          onSettingsRefresh?.();
          onOpenSettings?.();
        },
      });
    }
    return chatPanel;
  }

  function showCopilot(options: { activate?: boolean } = {}): void {
    const { activate = true } = options;
    visible = true;
    aiTabBtn?.classList.remove('bb-right-tab--hidden');
    rightTabs.tabOpen.ai = true;
    if (activate) {
      rightTabs.show('ai');
    }
    getChatPanel().show();
  }

  function hideCopilot(): void {
    visible = false;
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

  return {
    show: showCopilot,
    hide: hideCopilot,
    toggle,
    isVisible: isCopilotOpen,
    dispose: () => {
      clearPendingAIChange(false);
      unsubFeature();
      unsubPanel();
      chatPanel?.dispose();
      chatPanel = null;
    },
  };
}
