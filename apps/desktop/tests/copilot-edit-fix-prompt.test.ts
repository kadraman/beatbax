import {
  buildMinimalEditFixPrompt,
  shouldOfferAskFixInEditMode,
} from '../src/renderer/src/lib/copilot-edit-fix-prompt';

describe('shouldOfferAskFixInEditMode', () => {
  it('hides the fix CTA for pure explain / Q&A replies', () => {
    expect(
      shouldOfferAskFixInEditMode(
        [
          '### Overview',
          'This song uses four Game Boy channels.',
          '',
          '### Playback',
          'The final `play` command starts all four channels together.',
        ].join('\n')
      )
    ).toBe(false);
  });

  it('offers the fix CTA when the reply includes section markers to add', () => {
    expect(
      shouldOfferAskFixInEditMode(
        [
          'Add section markers for clearer focus:',
          '# --- Section 1: Intro ---',
          '# --- Section 2: Verse ---',
        ].join('\n')
      )
    ).toBe(true);
  });

  it('offers the fix CTA for arrangement layout fix language', () => {
    expect(shouldOfferAskFixInEditMode('Apply the suggested fix to improve section focus.')).toBe(true);
  });
});

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
