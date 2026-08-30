import { buildMinimalEditFixPrompt } from '../src/renderer/src/lib/copilot-edit-fix-prompt';

describe('buildMinimalEditFixPrompt', () => {
  it('builds a marker-only edit prompt for section comments', () => {
    const prompt = buildMinimalEditFixPrompt('# --- Section 1: Fanfare ---');
    expect(prompt).toContain('section marker comments');
    expect(prompt).toContain('# --- Section 1: Fanfare ---');
  });

  it('includes a suggested fix snippet when provided', () => {
    const prompt = buildMinimalEditFixPrompt('inst leadA type=pulse1');
    expect(prompt).toContain('minimal fix');
    expect(prompt).toContain('inst leadA type=pulse1');
  });

  it('pulls section markers from assistant context when no snippet is provided', () => {
    const prompt = buildMinimalEditFixPrompt(undefined, [
      'Add these markers:',
      '# --- Section 1: Fanfare ---',
      '# --- Section 2: Theme A ---',
    ].join('\n'));
    expect(prompt).toContain('section focus');
    expect(prompt).toContain('# --- Section 1: Fanfare ---');
  });

  it('falls back to assistant context when no snippet is provided', () => {
    const prompt = buildMinimalEditFixPrompt(undefined, 'Change pulse13 to pulse1');
    expect(prompt).toContain('previous explanation');
    expect(prompt).toContain('Change pulse13 to pulse1');
  });
});
