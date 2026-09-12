/// <reference path="./test-types.d.ts" />

import {
  focusInstrumentEditorPanel,
  isInstrumentEditorTypingTarget,
  shouldHandleInstrumentPreviewKey,
} from '../src/renderer/src/lib/instrument-editor-keys';

function keyEvent(key: string, target: EventTarget | null, extra: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('instrument editor preview keys', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('treats form fields as typing targets', () => {
    const input = document.createElement('input');
    const select = document.createElement('select');
    const textarea = document.createElement('textarea');
    const button = document.createElement('button');

    expect(isInstrumentEditorTypingTarget(input)).toBe(true);
    expect(isInstrumentEditorTypingTarget(select)).toBe(true);
    expect(isInstrumentEditorTypingTarget(textarea)).toBe(true);
    expect(isInstrumentEditorTypingTarget(button)).toBe(false);
  });

  it('handles preview keys when the Instruments tab is active and focus is not typing', () => {
    const tab = document.createElement('div');
    tab.className = 'bb-right-tab-content--active';
    const panel = document.createElement('div');
    tab.appendChild(panel);
    document.body.appendChild(tab);

    expect(shouldHandleInstrumentPreviewKey(keyEvent('a', panel), panel)).toBe(true);
  });

  it('does not handle preview keys in Monaco or other text fields', () => {
    const tab = document.createElement('div');
    tab.className = 'bb-right-tab-content--active';
    const panel = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.className = 'inputarea';
    tab.appendChild(panel);
    document.body.appendChild(tab);
    document.body.appendChild(textarea);

    expect(shouldHandleInstrumentPreviewKey(keyEvent('a', textarea), panel)).toBe(false);
  });

  it('does not handle preview keys while a modifier chord is held', () => {
    const tab = document.createElement('div');
    tab.className = 'bb-right-tab-content--active';
    const panel = document.createElement('div');
    tab.appendChild(panel);
    document.body.appendChild(tab);

    expect(shouldHandleInstrumentPreviewKey(keyEvent('a', panel, { metaKey: true }), panel)).toBe(false);
    expect(shouldHandleInstrumentPreviewKey(keyEvent('a', panel, { ctrlKey: true }), panel)).toBe(false);
  });

  it('does not handle preview keys when the Instruments tab is hidden', () => {
    const tab = document.createElement('div');
    tab.className = 'bb-right-tab-content';
    const panel = document.createElement('div');
    tab.appendChild(panel);
    document.body.appendChild(tab);

    expect(shouldHandleInstrumentPreviewKey(keyEvent('a', panel), panel)).toBe(false);
  });

  it('focuses the panel without requiring it to be in tab order', () => {
    const panel = document.createElement('div');
    panel.tabIndex = -1;
    document.body.appendChild(panel);

    focusInstrumentEditorPanel(panel);

    expect(document.activeElement).toBe(panel);
  });
});
