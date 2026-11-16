import type { PlaybackOptions } from './playback-manager.js';

type PreviewPlaybackManager = {
  play: (source: string, options?: PlaybackOptions) => Promise<unknown>;
};

type PreviewEventBus = {
  on: (event: 'playback:stopped', handler: () => void) => () => void;
};

/** Wizard Preview: audio only — do not replace or animate open-song document chrome (#268). */
export const NEW_SONG_WIZARD_PREVIEW_OPTIONS: PlaybackOptions = {
  ephemeral: true,
  isolateDocumentUi: true,
};

/**
 * Play a New Song Wizard starter-kit preview without touching document UI.
 * Pattern Grid / Song Visualizer / transport time stay on the open song (#268).
 */
export function playNewSongWizardPreview(
  playbackManager: PreviewPlaybackManager,
  eventBus: PreviewEventBus,
  source: string,
  onEnded: () => void,
): void {
  const unsub = eventBus.on('playback:stopped', () => {
    unsub();
    onEnded();
  });
  void playbackManager.play(source, NEW_SONG_WIZARD_PREVIEW_OPTIONS).catch(() => {
    unsub();
    onEnded();
  });
}
