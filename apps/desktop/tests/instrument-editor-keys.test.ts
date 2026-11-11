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

  it('handles preview keys when the instrument modal is open and focus is not typing', () => {
    const panel = document.createElement('div');
    panel.dataset.bbInstEditorOpen = 'true';
    document.body.appendChild(panel);

    expect(shouldHandleInstrumentPreviewKey(keyEvent('a', panel), panel)).toBe(true);
  });

  it('does not handle preview keys in Monaco or other text fields', () => {
    const panel = document.createElement('div');
    panel.dataset.bbInstEditorOpen = 'true';
    const textarea = document.createElement('textarea');
    textarea.className = 'inputarea';
    document.body.appendChild(panel);
    document.body.appendChild(textarea);

    expect(shouldHandleInstrumentPreviewKey(keyEvent('a', textarea), panel)).toBe(false);
  });

  it('does not handle preview keys while a modifier chord is held', () => {
    const panel = document.createElement('div');
    panel.dataset.bbInstEditorOpen = 'true';
    document.body.appendChild(panel);

    expect(shouldHandleInstrumentPreviewKey(keyEvent('a', panel, { metaKey: true }), panel)).toBe(false);
    expect(shouldHandleInstrumentPreviewKey(keyEvent('a', panel, { ctrlKey: true }), panel)).toBe(false);
  });

  it('does not handle preview keys when the instrument modal is closed', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);

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
