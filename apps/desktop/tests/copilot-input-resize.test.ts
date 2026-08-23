/** @jest-environment jsdom */

import {
  adjustCopilotInputHeight,
  COPILOT_INPUT_MAX_ROWS,
  COPILOT_INPUT_MIN_ROWS,
} from '../src/renderer/src/lib/copilot-input-resize';

describe('adjustCopilotInputHeight', () => {
  it('sets an explicit pixel height and hides overflow by default', () => {
    const textarea = document.createElement('textarea');
    textarea.style.lineHeight = '18px';
    textarea.style.padding = '7px 10px';
    textarea.style.boxSizing = 'border-box';
    document.body.appendChild(textarea);

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get() {
        const lines = (textarea.value.match(/\n/g)?.length ?? 0) + 1;
        return lines * 18 + 14;
      },
    });

    textarea.value = 'one line';
    adjustCopilotInputHeight(textarea);
    expect(textarea.style.height).toMatch(/^\d+px$/);
    expect(textarea.style.overflowY).toBe('hidden');

    textarea.value = Array(COPILOT_INPUT_MAX_ROWS + 4).fill('line').join('\n');
    adjustCopilotInputHeight(textarea);
    expect(textarea.style.overflowY).toBe('auto');

    textarea.remove();
  });

  it('exports sensible defaults', () => {
    expect(COPILOT_INPUT_MIN_ROWS).toBe(2);
    expect(COPILOT_INPUT_MAX_ROWS).toBeGreaterThan(COPILOT_INPUT_MIN_ROWS);
  });
});
