import { buildMinimalEditFixPrompt } from '../src/renderer/src/lib/copilot-edit-fix-prompt';

describe('buildMinimalEditFixPrompt', () => {
  it('includes a suggested fix snippet when provided', () => {
    const prompt = buildMinimalEditFixPrompt('inst leadA type=pulse1');
    expect(prompt).toContain('minimal fix');
    expect(prompt).toContain('inst leadA type=pulse1');
  });

  it('falls back to assistant context when no snippet is provided', () => {
    const prompt = buildMinimalEditFixPrompt(undefined, 'Change pulse13 to pulse1');
    expect(prompt).toContain('previous explanation');
    expect(prompt).toContain('Change pulse13 to pulse1');
  });
});
