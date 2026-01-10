import { applyModsToTokens } from '../src/expand/refExpander.js';

test('applyModsToTokens appends preset effects to tokens', () => {
  const tokens = ['C5', 'E5'];
  const mods = ['wobble'];
  const presets = { wobble: 'vib:4,6' };
  const out = applyModsToTokens(tokens, mods, presets as any);
  expect(out.tokens).toHaveLength(2);
  expect(out.tokens[0]).toMatch(/<vib:4,6>/);
  expect(out.tokens[1]).toMatch(/<vib:4,6>/);
});
