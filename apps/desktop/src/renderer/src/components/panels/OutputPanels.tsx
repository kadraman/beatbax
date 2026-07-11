import { useCallback, useEffect, useImperativeHandle, useRef, useState, type MouseEvent, type ReactNode, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type * as monaco from 'monaco-editor';
import {
  applyQuickFixSuggestion,
  getQuickFixesForProblem,
} from '@beatbax/app-core/editor/code-actions';
import { FeatureFlag, isFeatureEnabled } from '@beatbax/app-core/utils/feature-flags';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import { copyTextToClipboard, formatProblemClipboardText } from '../../lib/copilot-error-prompt';

export interface DesktopOutputMessage {
  type: 'error' | 'warning' | 'info' | 'success';
  message: string;
  timestamp: Date;
  source?: string;
  loc?: { start?: { line?: number; column?: number } };
  suggestion?: string;
}

export interface DesktopOutputPanelHandle {
  addMessage: (msg: DesktopOutputMessage, skipRender?: boolean) => void;
  dismissQuickFixMenu: () => void;
  dispose: () => void;
}

interface DesktopOutputPanelOptions {
  singleTab: 'problems' | 'output';
  getTextModel?: () => monaco.editor.ITextModel | null;
  /** Desktop Copilot is available on this client (menu still respects AI feature flag). */
  copilotActions?: boolean;
}

interface DesktopOutputPanelProps extends DesktopOutputPanelOptions {
  eventBus: EventBus;
  panelRef: Ref<DesktopOutputPanelHandle>;
}

interface QuickFixMenuState {
  menu: HTMLElement | null;
  dismiss: (() => void) | null;
}

const MAX_MESSAGES = 1000;

function getIcon(type: DesktopOutputMessage['type']): string {
  switch (type) {
    case 'error':
      return '!';
    case 'warning':
      return '!';
    case 'success':
      return 'ok';
    case 'info':
    default:
      return 'i';
  }
}

function useProblemContextMenu(): {
  closeContextMenu: () => void;
  showProblemContextMenu: (
    event: MouseEvent,
    options: {
      message: DesktopOutputMessage;
      eventBus: EventBus;
      getTextModel?: () => monaco.editor.ITextModel | null;
      copilotActions: boolean;
    },
  ) => void;
} {
  const menuRef = useRef<QuickFixMenuState>({ menu: null, dismiss: null });

  const closeContextMenu = useCallback(() => {
    menuRef.current.dismiss?.();
    menuRef.current.menu?.remove();
    menuRef.current = { menu: null, dismiss: null };
  }, []);

  const appendMenuItem = (
    menu: HTMLElement,
    label: string,
    onClick: () => void,
    preferred = false,
  ) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `problems-quick-fix-item${preferred ? ' is-preferred' : ''}`;
    btn.textContent = label;
    btn.setAttribute('role', 'menuitem');
    btn.addEventListener('click', () => {
      onClick();
      closeContextMenu();
    });
    menu.appendChild(btn);
  };

  const appendSeparator = (menu: HTMLElement) => {
    const sep = document.createElement('div');
    sep.className = 'problems-context-menu-sep';
    sep.setAttribute('role', 'separator');
    menu.appendChild(sep);
  };

  const showProblemContextMenu = useCallback((
    event: MouseEvent,
    options: {
      message: DesktopOutputMessage;
      eventBus: EventBus;
      getTextModel?: () => monaco.editor.ITextModel | null;
      copilotActions: boolean;
    },
  ) => {
    const { message, eventBus, getTextModel, copilotActions } = options;
    const line = message.loc?.start?.line ?? 0;
    const column = message.loc?.start?.column ?? 1;
    const canNavigate = line > 0;
    const model = getTextModel?.();
    const fixes = model
      ? getQuickFixesForProblem(
        model,
        message.message,
        canNavigate ? { start: { line, column } } : undefined,
      )
      : [];

    closeContextMenu();
    event.preventDefault();

    const menu = document.createElement('div');
    menu.className = 'problems-quick-fix-menu';
    menu.setAttribute('role', 'menu');

    for (const fix of fixes) {
      appendMenuItem(menu, fix.title, () => {
        if (!model) return;
        if (line > 0) eventBus.emit('navigate:to', { line, column });
        applyQuickFixSuggestion(model, fix);
      }, fix.isPreferred);
    }

    const clipboardText = formatProblemClipboardText(message.message, {
      source: message.source,
      line,
      column,
    });

    if (fixes.length > 0) appendSeparator(menu);

    appendMenuItem(menu, 'Copy message', () => {
      void copyTextToClipboard(clipboardText);
    });

    if (copilotActions) {
      appendMenuItem(menu, 'Ask Copilot about this error', () => {
        eventBus.emit('copilot:ask-about-error', {
          message: message.message,
          source: message.source,
          line: canNavigate ? line : undefined,
          column: canNavigate ? column : undefined,
          autoSubmit: true,
        });
      });
    }

    document.body.appendChild(menu);

    const pad = 4;
    let left = event.clientX;
    let top = event.clientY;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
      menu.style.left = `${left}px`;
    }
    if (rect.bottom > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
      menu.style.top = `${top}px`;
    }

    const onDismiss = () => closeContextMenu();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.setTimeout(() => {
      document.addEventListener('click', onDismiss, { once: true });
      document.addEventListener('contextmenu', onDismiss, { once: true });
      document.addEventListener('keydown', onKeyDown, { once: true });
    }, 0);

    menuRef.current = {
      menu,
      dismiss: () => {
        document.removeEventListener('click', onDismiss);
        document.removeEventListener('contextmenu', onDismiss);
        document.removeEventListener('keydown', onKeyDown);
      },
    };
  }, [closeContextMenu]);

  useEffect(() => closeContextMenu, [closeContextMenu]);

  return { closeContextMenu, showProblemContextMenu };
}

function ProblemMessage({
  copilotActions,
  eventBus,
  getTextModel,
  message,
  showProblemContextMenu,
}: {
  copilotActions: boolean;
  eventBus: EventBus;
  getTextModel?: () => monaco.editor.ITextModel | null;
  message: DesktopOutputMessage;
  showProblemContextMenu: ReturnType<typeof useProblemContextMenu>['showProblemContextMenu'];
}): ReactNode {
  const line = message.loc?.start?.line ?? 0;
  const column = message.loc?.start?.column ?? 1;
  const canNavigate = line > 0;
  const source = message.source ? `[${message.source}]` : '';
  const contextHint = copilotActions
    ? 'Right-click to copy or ask Copilot'
    : 'Right-click for quick fixes or to copy';

  const handleNavigate = () => {
    if (canNavigate) eventBus.emit('navigate:to', { line, column });
  };

  const handleContextMenu = (event: MouseEvent) => {
    showProblemContextMenu(event, {
      message,
      eventBus,
      getTextModel,
      copilotActions,
    });
  };

  return (
    <div
      className={`output-message output-${message.type}`}
      data-nav-line={canNavigate ? line : undefined}
      data-nav-col={canNavigate ? column : undefined}
      data-problem-message={message.message}
      onClick={handleNavigate}
      onContextMenu={handleContextMenu}
      style={{ cursor: 'pointer' }}
      title={canNavigate ? `Click to jump. ${contextHint}` : contextHint}
    >
      <div className="output-message-main">
        <span className="output-icon">{getIcon(message.type)}</span>
        {source ? <span className="output-source">{source}</span> : null}
        <span className="output-text">{message.message}</span>
        {canNavigate ? <span className="output-loc">line {line}, col {column}</span> : null}
      </div>
      {message.suggestion ? (
        <div className="output-suggestion">
          <span className="output-suggestion-icon" aria-hidden="true">?</span>
          <span>{message.suggestion}</span>
        </div>
      ) : null}
    </div>
  );
}

function OutputMessage({ message }: { message: DesktopOutputMessage }): ReactNode {
  const source = message.source ? `[${message.source}]` : '';

  return (
    <div className={`output-message output-${message.type}`}>
      <div className="output-message-main">
        <span className="output-icon">{getIcon(message.type)}</span>
        <span className="output-time">{message.timestamp.toLocaleTimeString()}</span>
        {source ? <span className="output-source">{source}</span> : null}
        <span className="output-text">{message.message}</span>
      </div>
    </div>
  );
}

function DesktopOutputPanel({
  copilotActions = false,
  eventBus,
  getTextModel,
  panelRef,
  singleTab,
}: DesktopOutputPanelProps): ReactNode {
  const messagesRef = useRef<DesktopOutputMessage[]>([]);
  const outputMessagesRef = useRef<HTMLDivElement | null>(null);
  const [, setRenderVersion] = useState(0);
  const { closeContextMenu, showProblemContextMenu } = useProblemContextMenu();
  const [copilotMenuEnabled, setCopilotMenuEnabled] = useState(
    () => copilotActions && isFeatureEnabled(FeatureFlag.AI_ASSISTANT),
  );
  const wantsProblems = singleTab !== 'output';
  const wantsOutput = singleTab !== 'problems';

  useEffect(() => {
    if (!copilotActions) {
      setCopilotMenuEnabled(false);
      return undefined;
    }
    setCopilotMenuEnabled(isFeatureEnabled(FeatureFlag.AI_ASSISTANT));
    return eventBus.on('feature-flag:changed', ({ flag, enabled }) => {
      if (flag === FeatureFlag.AI_ASSISTANT) setCopilotMenuEnabled(enabled);
    });
  }, [copilotActions, eventBus]);

  const rerender = useCallback(() => {
    setRenderVersion((version) => version + 1);
  }, []);

  const addMessage = useCallback((msg: DesktopOutputMessage, skipRender = false) => {
    messagesRef.current = [...messagesRef.current, msg].slice(-MAX_MESSAGES);
    if (!skipRender) rerender();
  }, [rerender]);

  const clearMessagesBySource = useCallback((
    source: string,
    type?: DesktopOutputMessage['type'],
  ) => {
    messagesRef.current = messagesRef.current.filter((msg) => {
      if (msg.source !== source) return true;
      if (type && msg.type !== type) return true;
      return false;
    });
    rerender();
  }, [rerender]);

  useImperativeHandle(panelRef, () => ({
    addMessage,
    dismissQuickFixMenu: closeContextMenu,
    dispose: closeContextMenu,
  }), [addMessage, closeContextMenu]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (wantsProblems) {
      cleanups.push(
        eventBus.on('parse:error', ({ error, message }) => {
          clearMessagesBySource('parser', 'error');
          addMessage({
            type: 'error',
            message: message || error.message || String(error),
            source: 'parser',
            timestamp: new Date(),
            loc: (error as Error & { location?: DesktopOutputMessage['loc'] }).location,
          });
        }),
        eventBus.on('playback:error', ({ error }) => {
          addMessage({
            type: 'error',
            message: `Playback error: ${error.message}`,
            source: 'playback',
            timestamp: new Date(),
          });
        }),
        eventBus.on('validation:warnings', ({ warnings }) => {
          clearMessagesBySource('parser', 'error');
          messagesRef.current = messagesRef.current.filter((msg) => !(msg.source === 'validation' && msg.type === 'warning'));
          messagesRef.current = [
            ...messagesRef.current,
            ...warnings.map((warning) => ({
              type: 'warning' as const,
              message: warning.message,
              source: 'validation',
              timestamp: new Date(),
              loc: warning.loc,
              suggestion: warning.suggestion,
            })),
          ].slice(-MAX_MESSAGES);
          rerender();
        }),
        eventBus.on('validation:errors', ({ errors }) => {
          messagesRef.current = messagesRef.current.filter((msg) => !(msg.source === 'validation' && msg.type === 'error'));
          messagesRef.current = [
            ...messagesRef.current,
            ...errors.map((error) => ({
              type: 'error' as const,
              message: error.message,
              source: 'validation',
              timestamp: new Date(),
              loc: error.loc,
              suggestion: error.suggestion,
            })),
          ].slice(-MAX_MESSAGES);
          rerender();
        }),
        eventBus.on('parse:success', () => {
          clearMessagesBySource('parser', 'error');
        }),
        eventBus.on('parse:started', closeContextMenu),
        eventBus.on('validation:errors', closeContextMenu),
        eventBus.on('validation:warnings', closeContextMenu),
        eventBus.on('navigate:to', closeContextMenu),
      );
    }

    if (wantsOutput) {
      cleanups.push(
        eventBus.on('export:started', ({ format }) => {
          addMessage({
            type: 'info',
            message: `Exporting to ${format}...`,
            source: 'export',
            timestamp: new Date(),
          });
        }),
        eventBus.on('export:success', ({ filename }) => {
          addMessage({
            type: 'success',
            message: `Successfully exported to ${filename}`,
            source: 'export',
            timestamp: new Date(),
          });
        }),
        eventBus.on('export:error', ({ format, error }) => {
          addMessage({
            type: 'error',
            message: `Export failed (${format}): ${error.message}`,
            source: 'export',
            timestamp: new Date(),
          });
        }),
        eventBus.on('playback:started', (data) => {
          const volMsg = typeof data?.volumePct === 'number' ? ` at ${data.volumePct}% volume` : '';
          addMessage({
            type: 'info',
            message: `Playback started${volMsg}`,
            source: 'playback',
            timestamp: new Date(),
          });
        }),
        eventBus.on('playback:paused', () => {
          addMessage({
            type: 'info',
            message: 'Playback paused',
            source: 'playback',
            timestamp: new Date(),
          });
        }),
        eventBus.on('playback:resumed', () => {
          addMessage({
            type: 'info',
            message: 'Playback resumed',
            source: 'playback',
            timestamp: new Date(),
          });
        }),
        eventBus.on('playback:stopped', () => {
          addMessage({
            type: 'info',
            message: 'Playback stopped',
            source: 'playback',
            timestamp: new Date(),
          });
        }),
        eventBus.on('playback:repeated', (data) => {
          const volMsg = typeof data?.volumePct === 'number' ? ` at ${data.volumePct}% volume` : '';
          addMessage({
            type: 'info',
            message: `Playback repeated${volMsg}`,
            source: 'playback',
            timestamp: new Date(),
          });
        }),
      );
    }

    return () => {
      closeContextMenu();
      for (const cleanup of cleanups) cleanup();
    };
  }, [
    addMessage,
    clearMessagesBySource,
    closeContextMenu,
    eventBus,
    rerender,
    wantsOutput,
    wantsProblems,
  ]);

  useEffect(() => {
    const list = outputMessagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  });

  const problems = messagesRef.current
    .filter((msg) => msg.type === 'error' || msg.type === 'warning')
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'error' ? -1 : 1));
  const outputs = messagesRef.current.filter((msg) => msg.type === 'info' || msg.type === 'success');
  const errorCount = problems.filter((msg) => msg.type === 'error').length;
  const warningCount = problems.filter((msg) => msg.type === 'warning').length;

  const content = singleTab === 'problems'
    ? (
        problems.length === 0
          ? <div className="empty-state">No problems detected</div>
          : (
              <>
                <div className="problems-summary">
                  {errorCount > 0 ? <span className="problem-count error-count">{errorCount} error{errorCount > 1 ? 's' : ''}</span> : null}
                  {warningCount > 0 ? <span className="problem-count warning-count">{warningCount} warning{warningCount > 1 ? 's' : ''}</span> : null}
                </div>
                <div className="output-messages" ref={outputMessagesRef}>
                  {problems.map((message, index) => (
                    <ProblemMessage
                      key={`${message.source ?? 'problem'}-${message.message}-${index}`}
                      copilotActions={copilotMenuEnabled}
                      eventBus={eventBus}
                      getTextModel={getTextModel}
                      message={message}
                      showProblemContextMenu={showProblemContextMenu}
                    />
                  ))}
                </div>
              </>
            )
      )
    : (
        outputs.length === 0
          ? <div className="empty-state">No output messages</div>
          : (
              <div className="output-messages" ref={outputMessagesRef}>
                {outputs.map((message, index) => (
                  <OutputMessage key={`${message.source ?? 'output'}-${message.message}-${index}`} message={message} />
                ))}
              </div>
            )
      );

  return (
    <div className="output-content" style={{ height: '100%' }}>
      {content}
    </div>
  );
}

export function createDesktopOutputPanel(
  container: HTMLElement,
  eventBus: EventBus,
  options: DesktopOutputPanelOptions,
): DesktopOutputPanelHandle {
  const handleRef = { current: null as DesktopOutputPanelHandle | null };
  let root: Root | null = createRoot(container);

  flushSync(() => {
    root?.render(
      <DesktopOutputPanel
        copilotActions={options.copilotActions}
        eventBus={eventBus}
        getTextModel={options.getTextModel}
        panelRef={(handle) => {
          handleRef.current = handle;
        }}
        singleTab={options.singleTab}
      />,
    );
  });

  const getHandle = () => {
    if (!handleRef.current) {
      throw new Error('Desktop output panel handle was not initialized');
    }
    return handleRef.current;
  };

  return {
    addMessage: (msg, skipRender) => getHandle().addMessage(msg, skipRender),
    dismissQuickFixMenu: () => getHandle().dismissQuickFixMenu(),
    dispose: () => {
      handleRef.current?.dispose();
      if (root) {
        root.unmount();
        root = null;
      }
    },
  };
}
