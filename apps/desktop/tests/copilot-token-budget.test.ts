import {
  completionTokenLimit,
  contextBudgetHover,
  contextBudgetLevel,
  estimateContextBudget,
  estimatePromptTokens,
  estimateTokens,
  formatTokenCount,
  resolveReasoningEffort,
  resolveReplyBudget,
  resolveReplyBudgetsByTokenParam,
} from '../src/renderer/src/lib/copilot-token-budget';

const AUTO = { editReplyTokens: 'auto', askReplyTokens: 'auto' } as const;

describe('estimatePromptTokens', () => {
  it('counts song text at chars/2 and other text at chars/4', () => {
    const systemText = `${'i'.repeat(400)}${'s'.repeat(1000)}`;
    const estimate = estimatePromptTokens({ systemText, songChars: 1000, historyTexts: ['h'.repeat(40)], userText: 'u'.repeat(8) });
    expect(estimate).toEqual({ system: 100 + 500, history: 10, message: 2, prompt: 612 });
  });

  it('treats all system text as prose when songChars is omitted', () => {
    expect(estimatePromptTokens({ systemText: 'x'.repeat(400), historyTexts: [], userText: '' }).prompt).toBe(100);
  });

  it('prefers a provider-reported prompt figure', () => {
    expect(estimatePromptTokens({ systemText: 'x'.repeat(400), historyTexts: [], userText: '', actualPromptTokens: 77 }).prompt).toBe(77);
  });
});

describe('resolveReplyBudget', () => {
  it('uses the FR-006 ceilings when the window has room', () => {
    const base = { settings: AUTO, promptTokens: 5000, windowTokens: 128_000 };
    expect(resolveReplyBudget({ ...base, mode: 'edit', tokenParam: 'max_completion_tokens' }).tokens).toBe(16384);
    expect(resolveReplyBudget({ ...base, mode: 'edit', tokenParam: 'max_tokens' }).tokens).toBe(8192);
    expect(resolveReplyBudget({ ...base, mode: 'ask' }).tokens).toBe(2048);
  });

  it('fits Auto budgets to the room left in the window', () => {
    // 16k window, 9k prompt → 16384 − ceil(9000 × 1.1) = 6484.
    const fitted = resolveReplyBudget({ mode: 'edit', settings: AUTO, promptTokens: 9000, windowTokens: 16384 });
    expect(fitted).toMatchObject({ tokens: 6484, auto: true, fitted: true });
  });

  it('shrinks as chat history grows', () => {
    const early = resolveReplyBudget({ mode: 'edit', settings: AUTO, promptTokens: 6000, windowTokens: 16384 }).tokens;
    const later = resolveReplyBudget({ mode: 'edit', settings: AUTO, promptTokens: 8000, windowTokens: 16384 }).tokens;
    expect(later).toBeLessThan(early);
  });

  it('falls to the floor when the prompt alone fills the window', () => {
    expect(resolveReplyBudget({ mode: 'edit', settings: AUTO, promptTokens: 9000, windowTokens: 8192 }).tokens).toBe(2048);
    expect(resolveReplyBudget({ mode: 'ask', settings: AUTO, promptTokens: 9000, windowTokens: 8192 }).tokens).toBe(512);
  });

  it('never fits explicit values', () => {
    const explicit = resolveReplyBudget({
      mode: 'edit',
      settings: { editReplyTokens: 24576, askReplyTokens: 'auto' },
      promptTokens: 9000,
      windowTokens: 16384,
    });
    expect(explicit).toMatchObject({ tokens: 24576, auto: false, fitted: false });
  });

  it('resolves both dialects for mid-request token-parameter learning', () => {
    expect(resolveReplyBudgetsByTokenParam({ mode: 'edit', settings: AUTO, promptTokens: 1000, windowTokens: 128_000 }))
      .toEqual({ max_tokens: 8192, max_completion_tokens: 16384 });
  });

  it('SC-007: meter total stays within the window on Auto whenever the floor fits', () => {
    for (const windowTokens of [8192, 16384, 32768, 128_000]) {
      for (const songChars of [2000, 8000, 15_500, 40_000]) {
        for (const historyChars of [0, 4000, 20_000]) {
          const input = {
            systemText: `${'i'.repeat(6000)}${'s'.repeat(songChars)}`,
            songChars,
            historyTexts: historyChars ? ['h'.repeat(historyChars)] : [],
            userText: 'make the bass louder',
          };
          const { prompt } = estimatePromptTokens(input);
          for (const mode of ['edit', 'ask'] as const) {
            const budget = resolveReplyBudget({ mode, settings: AUTO, promptTokens: prompt, windowTokens });
            const floor = mode === 'edit' ? 2048 : 512;
            if (Math.ceil(prompt * 1.1) + floor > windowTokens) continue;
            const meter = estimateContextBudget({ ...input, reservedOutput: budget.tokens, windowTokens });
            expect(meter.total).toBeLessThanOrEqual(windowTokens);
          }
        }
      }
    }
  });
});

describe('resolveReasoningEffort', () => {
  it('maps every option', () => {
    expect(resolveReasoningEffort({ reasoningEffort: 'auto' })).toEqual({ level: 'low' });
    expect(resolveReasoningEffort({})).toEqual({ level: 'low' });
    expect(resolveReasoningEffort({ reasoningEffort: 'provider-default' })).toBeUndefined();
    expect(resolveReasoningEffort({ reasoningEffort: 'off' })).toEqual({ level: 'off' });
    expect(resolveReasoningEffort({ reasoningEffort: 'minimal' })).toEqual({ level: 'minimal' });
    expect(resolveReasoningEffort({ reasoningEffort: 'low' })).toEqual({ level: 'low' });
    expect(resolveReasoningEffort({ reasoningEffort: 'medium' })).toEqual({ level: 'medium' });
    expect(resolveReasoningEffort({ reasoningEffort: 'high' })).toEqual({ level: 'high' });
    expect(resolveReasoningEffort({ reasoningEffort: 'custom', reasoningEffortCustom: 'xhigh' }))
      .toEqual({ level: 'custom', value: 'xhigh' });
  });
});

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
    expect(completionTokenLimit('edit', 'max_completion_tokens')).toBe(16384);
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
      'Chat history',
      'This message',
      'Room for reply',
    ]);
    expect(hover.lastReply).toBe('1.2k → 800');
    expect(hover.hint).toBeUndefined();
  });

  it('offers a new chat when chat history is using a tight window', () => {
    const full = estimateContextBudget({
      systemText: 'x'.repeat(12000),
      historyTexts: ['y'.repeat(4000)],
      userText: 'hello',
      reservedOutput: 8192,
      windowTokens: 8192,
    });
    expect(contextBudgetHover(full).hint).toMatchObject({ action: 'new-chat', actionLabel: 'Start a new chat' });
  });

  it('points to the token window setting when a new chat cannot free space', () => {
    // Fresh Edit chat on sample.bax at 16k: instructions + song + reserved reply ≈ 93%.
    const fresh = estimateContextBudget({
      systemText: 'x'.repeat(20400),
      songChars: 7637,
      historyTexts: [],
      userText: '',
      reservedOutput: 8192,
      windowTokens: 16384,
    });
    expect(fresh.level).toBe('full');
    expect(contextBudgetHover(fresh).hint).toMatchObject({ action: 'open-settings', actionLabel: 'Open AI settings' });
  });
});
