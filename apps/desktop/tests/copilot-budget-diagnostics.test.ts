import {
  checkReplyFits,
  describeLengthStop,
  estimateEditReplyTokens,
  replyFitDismissalKey,
} from '../src/renderer/src/lib/copilot-budget-diagnostics';
import { estimatePromptTokens, resolveReplyBudget } from '../src/renderer/src/lib/copilot-token-budget';

const AUTO = { editReplyTokens: 'auto', askReplyTokens: 'auto' } as const;
/** Edit system prompt instructions around the song (characters). */
const INSTRUCTION_CHARS = 6000;

function editBudgetFor(songChars: number, windowTokens: number, tokenParam: 'max_tokens' | 'max_completion_tokens') {
  const { prompt } = estimatePromptTokens({
    systemText: `${'i'.repeat(INSTRUCTION_CHARS)}${'s'.repeat(songChars)}`,
    songChars,
    historyTexts: [],
    userText: 'Add vibrato to the last note of each phrase',
  });
  return resolveReplyBudget({ mode: 'edit', settings: AUTO, tokenParam, promptTokens: prompt, windowTokens });
}

describe('describeLengthStop', () => {
  it('returns null for any stop other than length', () => {
    expect(describeLengthStop({ content: '', finishReason: 'stop', budget: 8192, mode: 'edit' })).toBeNull();
    expect(describeLengthStop({ content: '', budget: 8192, mode: 'edit' })).toBeNull();
  });

  it('SC-001: names reasoning and the Edit reply budget when reasoning tokens used it all', () => {
    const result = describeLengthStop({
      content: '',
      finishReason: 'length',
      usage: { completionTokens: 8192, reasoningTokens: 8192 },
      budget: 8192,
      mode: 'edit',
    });
    expect(result?.kind).toBe('reasoning-exhausted');
    expect(result?.message).toContain('reasoning');
    expect(result?.message).toContain('8,192 reasoning tokens');
    expect(result?.message).toContain('Edit reply budget (8,192 tokens)');
    expect(result?.message).toContain('Settings → AI');
  });

  it('detects reasoning from the reasoning field when no count is reported', () => {
    const result = describeLengthStop({ content: '', finishReason: 'length', reasoningPresent: true, budget: 4096, mode: 'edit' });
    expect(result?.kind).toBe('reasoning-exhausted');
    expect(result?.message).not.toContain('reasoning tokens)');
  });

  it('reports a cut-off song when partial content came back', () => {
    const result = describeLengthStop({
      content: '```bax\nchip gameboy\npat a = C4',
      finishReason: 'length',
      usage: { completionTokens: 8192, reasoningTokens: 200 },
      budget: 8192,
      mode: 'edit',
    });
    expect(result?.kind).toBe('cut-off');
    expect(result?.message).toContain('cut off at the Edit reply budget');
    expect(result?.message).toContain('New chat');
  });

  it('uses the Ask budget wording in Ask mode', () => {
    expect(describeLengthStop({ content: 'partial', finishReason: 'length', budget: 2048, mode: 'ask' })?.message)
      .toContain('Ask reply budget (2,048 tokens)');
  });
});

describe('checkReplyFits', () => {
  it('adds the reasoning margin unless reasoning is Off or Provider default', () => {
    expect(estimateEditReplyTokens(1000, 'auto')).toBe(500 + 1024);
    expect(estimateEditReplyTokens(1000, 'off')).toBe(500);
    expect(estimateEditReplyTokens(1000, 'provider-default')).toBe(500);
  });

  it('SC-006: warns for a call-me-maybe-sized song on a 16k window', () => {
    const songChars = 15_500;
    const budget = editBudgetFor(songChars, 16_384, 'max_tokens');
    const warning = checkReplyFits({ songChars, budget, windowTokens: 16_384, reasoningEffort: 'auto' });
    expect(warning).not.toBeNull();
    expect(warning?.message).toMatch(/needs about 8\.\dk tokens to reply, but only about 6\.\dk fit in your 16k model window/);
  });

  it('SC-006: no warning for the same song on the OpenAI 128k default window', () => {
    const songChars = 15_500;
    const budget = editBudgetFor(songChars, 128_000, 'max_completion_tokens');
    expect(checkReplyFits({ songChars, budget, windowTokens: 128_000, reasoningEffort: 'auto' })).toBeNull();
  });

  it('no warning for sample.bax on a 16k window', () => {
    const songChars = 7637;
    const budget = editBudgetFor(songChars, 16_384, 'max_tokens');
    expect(checkReplyFits({ songChars, budget, windowTokens: 16_384, reasoningEffort: 'auto' })).toBeNull();
  });

  it('applies to explicit budgets too', () => {
    const warning = checkReplyFits({
      songChars: 15_500,
      budget: { tokens: 4096, auto: false },
      windowTokens: 128_000,
      reasoningEffort: 'off',
    });
    expect(warning?.message).toContain('Edit reply budget is 4.1k');
  });
});

describe('replyFitDismissalKey', () => {
  it('changes with song text and settings', () => {
    const base = { songText: 'chip gameboy', budget: 6000, reasoningEffort: 'auto', windowTokens: 16384 };
    expect(replyFitDismissalKey(base)).toBe(replyFitDismissalKey({ ...base }));
    expect(replyFitDismissalKey(base)).not.toBe(replyFitDismissalKey({ ...base, songText: 'chip nes' }));
    expect(replyFitDismissalKey(base)).not.toBe(replyFitDismissalKey({ ...base, budget: 7000 }));
    expect(replyFitDismissalKey(base)).not.toBe(replyFitDismissalKey({ ...base, reasoningEffort: 'off' }));
  });
});
