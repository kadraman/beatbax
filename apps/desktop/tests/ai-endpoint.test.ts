/** @jest-environment node */

import { isLocalAiEndpoint } from '../src/renderer/src/lib/ai-endpoint';

describe('isLocalAiEndpoint', () => {
  it('detects localhost and loopback hosts', () => {
    expect(isLocalAiEndpoint('http://localhost:11434/v1')).toBe(true);
    expect(isLocalAiEndpoint('http://127.0.0.1:1234/v1')).toBe(true);
    expect(isLocalAiEndpoint('http://[::1]:8080/v1')).toBe(true);
  });

  it('does not treat localhost in the path as local', () => {
    expect(isLocalAiEndpoint('https://example.com/localhost/v1')).toBe(false);
    expect(isLocalAiEndpoint('https://api.openai.com/v1')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isLocalAiEndpoint('')).toBe(false);
    expect(isLocalAiEndpoint('not-a-url')).toBe(false);
  });
});
