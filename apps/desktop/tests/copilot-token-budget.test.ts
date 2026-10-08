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
import { estimateEditReplyTokens } from '../src/renderer/src/lib/copilot-budget-diagnostics';

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

  it('does not warn on the fill percentage alone', () => {
    expect(contextBudgetLevel({ total: 4000, window: 4096, history: 0, reservedOutput: 2048, replyFitted: false })).toBe('ok');
    expect(contextBudgetLevel({ total: 5000, window: 4096, history: 0, reservedOutput: 2048, replyFitted: false })).toBe('critical');
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
});

describe('meter warnings (FR-018, FR-019)', () => {
  const INSTRUCTION_CHARS = 12_763;

  function meterFor(input: {
    songChars: number;
    windowTokens: number;
    historyChars?: number;
    mode?: 'edit' | 'ask';
    settings?: Parameters<typeof resolveReplyBudget>[0]['settings'];
    reasoningEffort?: 'auto' | 'off';
  }) {
    const mode = input.mode ?? 'edit';
    const promptInput = {
      systemText: `${'i'.repeat(INSTRUCTION_CHARS)}${'s'.repeat(input.songChars)}`,
      songChars: input.songChars,
      historyTexts: input.historyChars ? ['h'.repeat(input.historyChars)] : [],
      userText: '',
    };
    const { prompt } = estimatePromptTokens(promptInput);
    const reply = resolveReplyBudget({ mode, settings: input.settings ?? AUTO, promptTokens: prompt, windowTokens: input.windowTokens });
    return estimateContextBudget({
      ...promptInput,
      reservedOutput: reply.tokens,
      windowTokens: input.windowTokens,
      reply,
      replyNeeded: mode === 'edit' ? estimateEditReplyTokens(input.songChars, input.reasoningEffort ?? 'auto') : undefined,
      reasoningOff: input.reasoningEffort === 'off',
    });
  }

  it('SC-008: no warning on a fresh sample.bax Edit chat at 16k, despite a high percentage', () => {
    const meter = meterFor({ songChars: 7637, windowTokens: 16384 });
    expect(meter.percent).toBeGreaterThanOrEqual(90);
    expect(meter.level).toBe('ok');
    expect(contextBudgetHover(meter).hint).toBeUndefined();
  });

  it('is amber with Start a new chat when history shrinks an Auto budget that still fits the song', () => {
    const meter = meterFor({ songChars: 7637, windowTokens: 16384, historyChars: 8000 });
    expect(meter.replyFitted).toBe(true);
    expect(meter.level).toBe('warning');
    expect(contextBudgetHover(meter).hint).toEqual({
      text: 'Chat history is shrinking the room for the reply.',
      newChat: true,
    });
  });

  it('SC-008: is red with both figures when the song reply does not fit (call-me-maybe.bax at 16k)', () => {
    const meter = meterFor({ songChars: 15_500, windowTokens: 16384 });
    expect(meter.level).toBe('critical');
    expect(contextBudgetHover(meter).hint).toEqual({
      text: "This song's reply needs about 8.8k tokens, but only about 4.3k fit.",
      detail: 'Try a larger num_ctx and Model token window, Reasoning effort Off, or a cloud model.',
      newChat: false,
    });
  });

  it('leaves Reasoning effort Off out of the suggestion when it is already Off', () => {
    const auto = meterFor({ songChars: 15_500, windowTokens: 16384, reasoningEffort: 'off' });
    expect(auto.level).toBe('critical');
    expect(contextBudgetHover(auto).hint?.detail).toBe('Try a larger num_ctx and Model token window, or a cloud model.');

    const explicit = meterFor({
      songChars: 15_500,
      windowTokens: 128_000,
      settings: { editReplyTokens: 4096, askReplyTokens: 'auto' },
      reasoningEffort: 'off',
    });
    expect(contextBudgetHover(explicit).hint?.detail).toBe('Raise the Edit reply budget, or use a cloud model.');
  });

  it('offers a new chat on a red meter only when history is part of the prompt', () => {
    const meter = meterFor({ songChars: 15_500, windowTokens: 16384, historyChars: 2000 });
    expect(meter.level).toBe('critical');
    expect(contextBudgetHover(meter).hint?.newChat).toBe(true);
  });

  it('names the Edit reply budget when an explicit budget is too small for the song', () => {
    const meter = meterFor({
      songChars: 15_500,
      windowTokens: 128_000,
      settings: { editReplyTokens: 4096, askReplyTokens: 'auto' },
    });
    expect(meter.level).toBe('critical');
    expect(contextBudgetHover(meter).hint).toMatchObject({
      text: "This song's reply needs about 8.8k tokens, but the Edit reply budget is 4.1k.",
      detail: 'Raise the Edit reply budget, set Reasoning effort to Off, or use a cloud model.',
    });
  });

  it('is red when an explicit budget overflows the window', () => {
    const meter = meterFor({
      songChars: 2000,
      windowTokens: 16384,
      settings: { editReplyTokens: 24576, askReplyTokens: 'auto' },
    });
    expect(meter.level).toBe('critical');
    expect(contextBudgetHover(meter).hint).toMatchObject({
      text: 'The prompt and reply budget are larger than the model window.',
      detail: 'Lower the reply budget, or raise num_ctx and the Model token window.',
    });
  });

  it('never applies the song-reply check in Ask mode', () => {
    const meter = meterFor({ songChars: 15_500, windowTokens: 16384, mode: 'ask' });
    expect(meter.replyNeeded).toBeUndefined();
    expect(meter.level).toBe('ok');
  });

  it('is red in Ask mode when the prompt leaves no room for the floor', () => {
    const meter = meterFor({ songChars: 15_500, windowTokens: 8192, mode: 'ask', historyChars: 2000 });
    expect(meter.total).toBeGreaterThan(meter.window);
    expect(meter.level).toBe('critical');
    expect(contextBudgetHover(meter).hint).toMatchObject({
      text: 'The prompt and reply budget are larger than the model window.',
      newChat: true,
    });
  });
});
