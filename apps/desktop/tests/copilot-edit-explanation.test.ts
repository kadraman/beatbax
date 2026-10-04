import { extractEditExplanation, wrapBaxTokensForMarkdown } from '../src/renderer/src/lib/copilot-edit-explanation';

describe('extractEditExplanation', () => {
  it('reads prose after a fenced song', () => {
    const reply = [
      '```bax',
      'chip gameboy',
      'pat drums = kick hat',
      'play',
      '```',
      '',
      'Quieted the bass envelope so it no longer masks the lead. Drums are unchanged.',
    ].join('\n');
    expect(extractEditExplanation(reply)).toBe(
      'Quieted the bass envelope so it no longer masks the lead. Drums are unchanged.',
    );
  });

  it('reads prose before a fenced song', () => {
    const reply = [
      'Added a two-bar drum fill after the verse so the drop has more punch.',
      '```bax',
      'chip gameboy',
      'play',
      '```',
    ].join('\n');
    expect(extractEditExplanation(reply)).toContain('drum fill');
  });

  it('drops lines echoed from the previous-edit history stub', () => {
    const stub = [
      '[Previous Edit] Applied a full-song update. The live song is in [EDITOR CONTENT].',
      '**Explanation:**',
      'Added a two-bar drum fill after the verse.',
      '- Added pattern `fill` — `pat fill = snare snare`',
      'Stats: 1 changed lines, +1',
      'Do not reuse the previous full file from this turn.',
    ].join('\n');
    const reply = [
      'Added a two-bar drum fill after the verse.',
      '- Added pattern `fill` — `pat fill = snare snare`',
      'Stats: 2 changed lines, +2',
      'Do not reuse the previous full file from this turn.',
      '```bax',
      'play',
      '```',
      '**Explanation:**',
      'Added vibrato variations of the lead melody.',
    ].join('\n');
    expect(extractEditExplanation(reply, [stub])).toBe('**Explanation:**\nAdded vibrato variations of the lead melody.');
    expect(extractEditExplanation(reply)).toContain('Do not reuse');
  });

  it('drops filler and unfenced song dumps', () => {
    expect(extractEditExplanation('Here is the updated song:\n```bax\nplay\n```')).toBe('');
    expect(extractEditExplanation('chip gameboy\nbpm 120\npat x = C4\nplay')).toBe('');
  });
});

describe('wrapBaxTokensForMarkdown', () => {
  it('wraps BeatBax tokens in backticks for inline code', () => {
    expect(wrapBaxTokensForMarkdown('Changed E5:4, E5<leadTrem>:4, on pat melody.')).toBe(
      'Changed `E5:4`, `E5<leadTrem>:4`, on `pat melody`.',
    );
  });

  it('leaves existing inline code unchanged', () => {
    expect(wrapBaxTokensForMarkdown('Keep `E5:4` as-is.')).toBe('Keep `E5:4` as-is.');
  });
});
