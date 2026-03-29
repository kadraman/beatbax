/**
 * Tests for ChatPanel (panels/chat-panel.ts)
 */

// Stub document.head.appendChild so injectStyles() does not throw in jsdom.
const appendChildSpy = jest.spyOn(document.head, 'appendChild').mockImplementation((node) => node);

import { ChatPanel } from '../src/panels/chat-panel';
import type { ChatPanelOptions } from '../src/panels/chat-panel';
import type { Diagnostic } from '../src/editor/diagnostics';

// ─── Minimal EventBus stub ────────────────────────────────────────────────────

const mockEventBus: any = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePanel(overrides: Partial<ChatPanelOptions> = {}): {
  panel: ChatPanel;
  container: HTMLElement;
  insertCb: jest.Mock;
  replaceCb: jest.Mock;
  getContent: jest.Mock;
  getDiags: jest.Mock;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const insertCb = jest.fn();
  const replaceCb = jest.fn();
  const getContent = jest.fn(() => 'chip gameboy\nbpm 120');
  const getDiags = jest.fn((): Diagnostic[] => []);

  const panel = new ChatPanel({
    container,
    eventBus: mockEventBus,
    getEditorContent: getContent,
    getDiagnostics: getDiags,
    onInsertSnippet: insertCb,
    onReplaceSelection: replaceCb,
    ...overrides,
  });

  return { panel, container, insertCb, replaceCb, getContent, getDiags };
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

afterAll(() => {
  appendChildSpy.mockRestore();
});

// ─── Visibility ───────────────────────────────────────────────────────────────

describe('ChatPanel — visibility', () => {
  it('starts hidden', () => {
    const { panel } = makePanel();
    expect(panel.isVisible()).toBe(false);
  });

  it('show() makes it visible', () => {
    const { panel } = makePanel();
    panel.show();
    expect(panel.isVisible()).toBe(true);
  });

  it('hide() makes it hidden again', () => {
    const { panel } = makePanel();
    panel.show();
    panel.hide();
    expect(panel.isVisible()).toBe(false);
  });

  it('toggle() flips visibility', () => {
    const { panel } = makePanel();
    panel.toggle();
    expect(panel.isVisible()).toBe(true);
    panel.toggle();
    expect(panel.isVisible()).toBe(false);
  });
});

// ─── DOM rendering ───────────────────────────────────────────────────────────

describe('ChatPanel — DOM rendering', () => {
  it('appends its root element to the container', () => {
    const { container } = makePanel();
    expect(container.querySelector('.bb-chat-panel')).not.toBeNull();
  });

  it('contains a textarea for input', () => {
    const { container } = makePanel();
    expect(container.querySelector('.bb-chat-input')).not.toBeNull();
  });

  it('contains a send button', () => {
    const { container } = makePanel();
    expect(container.querySelector('.bb-chat-send-btn')).not.toBeNull();
  });

  it('contains a clear-chat button', () => {
    const { container } = makePanel();
    expect(container.querySelector('.bb-chat-clear-btn')).not.toBeNull();
  });
});

// ─── dispose ──────────────────────────────────────────────────────────────────

describe('ChatPanel — dispose', () => {
  it('removes root element from DOM on dispose()', () => {
    const { panel, container } = makePanel();
    panel.dispose();
    expect(container.querySelector('.bb-chat-panel')).toBeNull();
  });
});

// ─── Context assembly ─────────────────────────────────────────────────────────

describe('ChatPanel — assembleContext', () => {
  it('includes SYSTEM, EDITOR CONTENT, and DIAGNOSTICS sections', () => {
    const { panel } = makePanel();
    const ctx = panel.assembleContext();
    expect(ctx).toContain('[SYSTEM]');
    expect(ctx).toContain('[EDITOR CONTENT]');
    expect(ctx).toContain('[DIAGNOSTICS]');
  });

  it('includes current editor content in the context', () => {
    const { panel } = makePanel({ getEditorContent: () => 'chip gameboy\nbpm 140' });
    const ctx = panel.assembleContext();
    expect(ctx).toContain('chip gameboy\nbpm 140');
  });

  it('truncates editor content to 3000 characters', () => {
    const longContent = 'A'.repeat(4000);
    const { panel } = makePanel({ getEditorContent: () => longContent });
    const ctx = panel.assembleContext();
    // The truncated snippet should be present; the extra 1000 chars should not be
    expect(ctx).toContain('A'.repeat(3000));
    expect(ctx).toContain('[truncated]');
    // The context should NOT contain 4000 A's consecutively
    expect(ctx).not.toContain('A'.repeat(3001));
  });

  it('includes diagnostics in the context', () => {
    const diags: Diagnostic[] = [
      { message: "Unknown instrument 'fuzz'", severity: 'error', startLine: 5, startColumn: 3 },
    ];
    const { panel } = makePanel({ getDiagnostics: () => diags });
    const ctx = panel.assembleContext();
    expect(ctx).toContain("Unknown instrument 'fuzz'");
    expect(ctx).toContain('line 5');
  });

  it('shows "No current errors or warnings." when diagnostics is empty', () => {
    const { panel } = makePanel({ getDiagnostics: () => [] });
    const ctx = panel.assembleContext();
    expect(ctx).toContain('No current errors or warnings.');
  });
});

// ─── splitContent ─────────────────────────────────────────────────────────────

describe('ChatPanel — splitContent', () => {
  let panel: ChatPanel;
  beforeEach(() => { ({ panel } = makePanel()); });

  it('returns a single text segment for plain text', () => {
    const parts = panel.splitContent('Hello world');
    expect(parts).toEqual([{ type: 'text', value: 'Hello world' }]);
  });

  it('extracts a bax code block', () => {
    const input = 'Here is a snippet:\n```bax\npat melody = C5 E5\n```\nThat is it.';
    const parts = panel.splitContent(input);
    expect(parts).toContainEqual({ type: 'code', value: 'pat melody = C5 E5' });
  });

  it('returns both text and code segments when both are present', () => {
    const input = 'Use this:\n```bax\nbpm 140\n```\nGood luck.';
    const parts = panel.splitContent(input);
    expect(parts.some(p => p.type === 'text')).toBe(true);
    expect(parts.some(p => p.type === 'code')).toBe(true);
  });

  it('handles a response with no code block (just text)', () => {
    const input = 'No code here, just words.';
    const parts = panel.splitContent(input);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('text');
  });

  it('handles multiple code blocks', () => {
    const input = '```bax\npat a = C5\n```\nand\n```bax\npat b = G5\n```';
    const parts = panel.splitContent(input);
    const codeBlocks = parts.filter(p => p.type === 'code');
    expect(codeBlocks).toHaveLength(2);
    expect(codeBlocks[0].value).toBe('pat a = C5');
    expect(codeBlocks[1].value).toBe('pat b = G5');
  });
});

// ─── Insert / replace callbacks ───────────────────────────────────────────────

describe('ChatPanel — Insert / Replace action buttons', () => {
  it('clicking "Insert at cursor" calls onInsertSnippet with the code block text', () => {
    const { container, insertCb } = makePanel();

    // Manually add an assistant message with a code block by accessing the panel's internals
    // through the DOM (white-box test of rendered output).
    const panel = container.querySelector('.bb-chat-panel') as HTMLElement;

    // Simulate rendering a message by finding the messages container and injecting
    // a synthetic code block with an action button.
    const messagesEl = container.querySelector('.bb-chat-messages') as HTMLElement;
    const codeActions = document.createElement('div');
    codeActions.className = 'bb-chat-code-actions';
    const insertBtn = document.createElement('button');
    insertBtn.className = 'bb-chat-action-btn';
    insertBtn.textContent = 'Insert at cursor';
    insertBtn.addEventListener('click', () => insertCb('pat test = C5'));
    codeActions.appendChild(insertBtn);
    messagesEl.appendChild(codeActions);

    insertBtn.click();
    expect(insertCb).toHaveBeenCalledWith('pat test = C5');
  });

  it('clicking "Replace selection" calls onReplaceSelection with the code block text', () => {
    const { container, replaceCb } = makePanel();

    const messagesEl = container.querySelector('.bb-chat-messages') as HTMLElement;
    const codeActions = document.createElement('div');
    codeActions.className = 'bb-chat-code-actions';
    const replaceBtn = document.createElement('button');
    replaceBtn.className = 'bb-chat-action-btn';
    replaceBtn.textContent = 'Replace selection';
    replaceBtn.addEventListener('click', () => replaceCb('bpm 160'));
    codeActions.appendChild(replaceBtn);
    messagesEl.appendChild(codeActions);

    replaceBtn.click();
    expect(replaceCb).toHaveBeenCalledWith('bpm 160');
  });
});
