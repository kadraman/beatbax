import {
  completionTokenLimit,
  contextBudgetHover,
  contextBudgetLevel,
  estimateContextBudget,
  estimateTokens,
  formatTokenCount,
} from '../src/renderer/src/lib/copilot-token-budget';

describe('copilot-token-budget', () => {
  it('estimates tokens as chars/4', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('formats compact token counts', () => {
    expect(formatTokenCount(800)).toBe('800');
    expect(formatTokenCount(1200)).toBe('1.2k');
    expect(formatTokenCount(128000)).toBe('128k');
  });

  it('uses Edit/Ask completion budgets', () => {
    expect(completionTokenLimit('edit')).toBe(8192);
    expect(completionTokenLimit('ask')).toBe(2048);
  });

  it('marks high and full windows from reserved output + prompt', () => {
    const high = estimateContextBudget({
      systemText: 'x'.repeat(4000),
      historyTexts: [],
      userText: '',
      reservedOutput: 2048,
      windowTokens: 4096,
    });
    expect(contextBudgetLevel(high.ratio)).toBe('high');
    expect(high.level).toBe('high');

    const full = estimateContextBudget({
      systemText: 'x'.repeat(12000),
      historyTexts: [],
      userText: 'hello',
      reservedOutput: 8192,
      windowTokens: 8192,
    });
    expect(full.level).toBe('full');
  });

  it('prefers actual prompt tokens when provided', () => {
    const budget = estimateContextBudget({
      systemText: 'abcd',
      historyTexts: [],
      userText: 'efgh',
      reservedOutput: 10,
      windowTokens: 100,
      actualPromptTokens: 40,
    });
    expect(budget.prompt).toBe(40);
    expect(budget.total).toBe(50);
  });

  it('builds a compact hover model', () => {
    const budget = estimateContextBudget({
      systemText: 'abcd',
      historyTexts: [],
      userText: '',
      reservedOutput: 10,
      windowTokens: 100,
    });
    const hover = contextBudgetHover(budget, { lastPrompt: 1200, lastCompletion: 800 });
    expect(hover.heading).toBe('Model window');
    expect(hover.usedLabel).toBe(`${formatTokenCount(budget.total)} / ${formatTokenCount(budget.window)}`);
    expect(hover.rows.map((row) => row.label)).toEqual([
      'Instructions + song',
      'Chat',
      'This message',
      'Room for reply',
    ]);
    expect(hover.lastReply).toBe('1.2k → 800');
    expect(hover.hint).toBeUndefined();
  });

  it('hints to start a new chat when the window is tight', () => {
    const full = estimateContextBudget({
      systemText: 'x'.repeat(12000),
      historyTexts: [],
      userText: 'hello',
      reservedOutput: 8192,
      windowTokens: 8192,
    });
    expect(contextBudgetHover(full).hint).toBe('Start a new chat');
  });
});
