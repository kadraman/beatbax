/**
 * Regression: Default song artist must accept multi-word values with spaces.
 *
 * The desktop settings field is a controlled React input backed by nanostores.
 * Trimming on every onChange strips trailing spaces mid-edit, which makes it
 * impossible to type names like "The BeatBax Team". Draft updates must keep
 * internal/trailing spaces; commit (blur) may normalize ends.
 */

import { settingSongArtist } from '@beatbax/app-core/stores/settings.store';
import {
  applyDefaultSongArtistDraft,
  commitDefaultSongArtist,
} from '../src/renderer/src/components/settings/editor';

beforeEach(() => {
  localStorage.clear();
  settingSongArtist.set('');
});

describe('Default song artist setting', () => {
  it('preserves spaces while drafting (no per-keystroke trim)', () => {
    applyDefaultSongArtistDraft('The');
    expect(settingSongArtist.get()).toBe('The');

    applyDefaultSongArtistDraft('The ');
    expect(settingSongArtist.get()).toBe('The ');

    applyDefaultSongArtistDraft('The BeatBax Team');
    expect(settingSongArtist.get()).toBe('The BeatBax Team');
  });

  it('trims only on commit (blur)', () => {
    applyDefaultSongArtistDraft('  The BeatBax Team  ');
    expect(settingSongArtist.get()).toBe('  The BeatBax Team  ');

    commitDefaultSongArtist(settingSongArtist.get());
    expect(settingSongArtist.get()).toBe('The BeatBax Team');
  });

  it('does not remove internal spaces when committing', () => {
    applyDefaultSongArtistDraft('The BeatBax Team');
    commitDefaultSongArtist(settingSongArtist.get());
    expect(settingSongArtist.get()).toBe('The BeatBax Team');
  });
});
