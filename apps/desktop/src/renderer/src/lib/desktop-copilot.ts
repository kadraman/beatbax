import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { Diagnostic } from '@beatbax/app-core/editor/diagnostics';
import {
  FeatureFlag,
  isFeatureEnabled,
  setFeatureEnabled,
} from '@beatbax/app-core/utils/feature-flags';
import { ChatPanel } from '@web-ui/panels/chat-panel';
import type { buildRightTabs } from '@web-ui/app/tabs';

type RightTabs = ReturnType<typeof buildRightTabs>;

interface PendingAIChange {
  previousContent: string;
  decorationIds: string[];
  banner: HTMLElement;
}

export interface DesktopCopilotOptions {
  rightTabs: RightTabs;
  eventBus: EventBus;
  getEditor: () => BeatBaxEditor | null;
  getDiagnostics: () => Diagnostic[];
  onSettingsRefresh?: () => void;
}

export interface DesktopCopilotHandle {
  toggle: () => void;
  dispose: () => void;
}

export function setupDesktopCopilot(options: DesktopCopilotOptions): DesktopCopilotHandle | null {
  const { rightTabs, eventBus, getEditor, getDiagnostics, onSettingsRefresh } = options;
  const aiContainer = document.createElement('div');
  aiContainer.style.cssText = 'flex:1 1 0;overflow:hidden;display:flex;flex-direction:column;';
  rightTabs.tabContents.ai!.appendChild(aiContainer);

  const aiTabBtn = rightTabs.tabButtons.ai;
  aiTabBtn?.classList.add('bb-right-tab--hidden');

  let chatPanel: ChatPanel | null = null;
  let pendingAIChange: PendingAIChange | null = null;

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

  function getChatPanel(): ChatPanel {
    if (!chatPanel) {
      chatPanel = new ChatPanel({
        container: aiContainer,
        eventBus,
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
      });
    }
    return chatPanel;
  }

  function showCopilot(): void {
    aiTabBtn?.classList.remove('bb-right-tab--hidden');
    rightTabs.tabOpen.ai = true;
    getChatPanel().show();
    rightTabs.show('ai');
  }

  function hideCopilot(): void {
    getChatPanel().hide();
    rightTabs.close('ai');
    aiTabBtn?.classList.add('bb-right-tab--hidden');
    rightTabs.tabOpen.ai = false;
  }

  function toggle(): void {
    const nowEnabled = !isFeatureEnabled(FeatureFlag.AI_ASSISTANT);
    setFeatureEnabled(FeatureFlag.AI_ASSISTANT, nowEnabled);
    if (nowEnabled) showCopilot();
    else hideCopilot();
  }

  if (isFeatureEnabled(FeatureFlag.AI_ASSISTANT)) {
    showCopilot();
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
      setFeatureEnabled(FeatureFlag.AI_ASSISTANT, false);
      hideCopilot();
    }
  });

  return {
    toggle,
    dispose: () => {
      clearPendingAIChange(false);
      unsubFeature();
      unsubPanel();
      chatPanel = null;
    },
  };
}
