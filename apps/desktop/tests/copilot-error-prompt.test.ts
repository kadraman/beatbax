import {
  formatCopilotErrorPrompt,
  formatProblemClipboardText,
} from '../src/renderer/src/lib/copilot-error-prompt';

describe('formatCopilotErrorPrompt', () => {
  it('wraps the message with an explanation request', () => {
    expect(formatCopilotErrorPrompt('Unknown instrument type')).toBe(
      'Please explain this error and suggest how to fix it:\n\nUnknown instrument type',
    );
  });

  it('includes source and location when provided', () => {
    expect(formatCopilotErrorPrompt('Unknown Game Boy instrument type pulse13', {
      source: 'validation',
      line: 5,
      column: 12,
    })).toBe(
      'Please explain this error and suggest how to fix it:\n\n[validation] Unknown Game Boy instrument type pulse13 (line 5, col 12)',
    );
  });
});

describe('formatProblemClipboardText', () => {
  it('formats plain problem text without the Copilot wrapper', () => {
    expect(formatProblemClipboardText('Parse error', { source: 'parser', line: 2, column: 1 }))
      .toBe('[parser] Parse error (line 2, col 1)');
  });
});
