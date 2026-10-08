import { addTokenUsage } from '../src/stores/chat.store.js';

describe('addTokenUsage', () => {
  it('sums reasoning tokens across repair turns', () => {
    expect(addTokenUsage(
      { promptTokens: 100, completionTokens: 50, totalTokens: 150, reasoningTokens: 40 },
      { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    )).toEqual({ promptTokens: 110, completionTokens: 55, totalTokens: 165, reasoningTokens: 40 });
  });

  it('keeps the reasoning flag when either turn had one', () => {
    expect(addTokenUsage(
      { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      { promptTokens: 1, completionTokens: 1, totalTokens: 2, reasoningPresent: true },
    )).toEqual({ promptTokens: 2, completionTokens: 2, totalTokens: 4, reasoningPresent: true });
  });

  it('adds no reasoning fields when neither turn reported them', () => {
    expect(addTokenUsage(
      { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      undefined,
    )).toEqual({ promptTokens: 1, completionTokens: 1, totalTokens: 2 });
  });
});
