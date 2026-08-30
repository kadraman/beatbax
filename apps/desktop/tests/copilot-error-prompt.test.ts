import {
  formatCopilotErrorDisplay,
  formatCopilotErrorPrompt,
  formatProblemClipboardText,
  isCopilotErrorMachinePrompt,
  summarizeCopilotErrorMachinePrompt,
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

describe('formatCopilotErrorDisplay', () => {
  it('uses a short chat label without the full wrapper prompt', () => {
    expect(formatCopilotErrorDisplay('Section focus plays the whole song', {
      source: 'arrangement',
      line: 834,
      column: 1,
    })).toBe('Explain: [arrangement] Section focus plays the whole song (line 834, col 1)');
  });
});

describe('formatProblemClipboardText', () => {
  it('formats plain problem text without the Copilot wrapper', () => {
    expect(formatProblemClipboardText('Parse error', { source: 'parser', line: 2, column: 1 }))
      .toBe('[parser] Parse error (line 2, col 1)');
  });
});

describe('isCopilotErrorMachinePrompt', () => {
  it('detects the verbose Problems → Copilot wrapper prompt', () => {
    expect(isCopilotErrorMachinePrompt(formatCopilotErrorPrompt('Parse error'))).toBe(true);
    expect(isCopilotErrorMachinePrompt('Parse error')).toBe(false);
  });
});

describe('summarizeCopilotErrorMachinePrompt', () => {
  it('returns a short chat label for stored machine prompts', () => {
    expect(summarizeCopilotErrorMachinePrompt(formatCopilotErrorPrompt('Parse error', {
      source: 'validation',
      line: 3,
      column: 1,
    }))).toBe('Explain: [validation] Parse error (line 3, col 1)');
  });
});
