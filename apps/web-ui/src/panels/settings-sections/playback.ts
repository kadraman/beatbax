/**
 * Playback settings section.
 */

import { storage, StorageKey } from '../../utils/local-storage';
import {
  settingAudioBackend, settingAudioSampleRate,
  settingDefaultLoop, settingAudioBufferFrames,
} from '../../stores/settings.store';
import { sectionHeading, toggle, radioGroup, selectField, noteText } from './general';

export function buildPlaybackSection(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bb-settings-section';

  el.appendChild(sectionHeading('Audio'));

  el.appendChild(radioGroup(
    'Audio backend',
    'bb-settings-audio-backend',
    [
      { value: 'auto',    label: 'Auto' },
      { value: 'browser', label: 'Browser (WebAudio)' },
    ],
    // Normalise any legacy 'node-webaudio' value to 'auto'
    settingAudioBackend.get() === 'browser' ? 'browser' : 'auto',
    (v) => settingAudioBackend.set(v as any),
  ));
  el.appendChild(noteText('Auto uses the browser\'s built-in WebAudio API (the only option in the web UI). Browser forces this explicitly. Changes take effect after a page reload.'));

  el.appendChild(selectField(
    'Sample rate',
    [
      { value: '44100', label: '44 100 Hz (CD quality, default)' },
      { value: '48000', label: '48 000 Hz (broadcast)' },
      { value: '96000', label: '96 000 Hz (hi-res)' },
    ],
    settingAudioSampleRate.get(),
    (v) => settingAudioSampleRate.set(v as any),
  ));
  el.appendChild(noteText('Higher sample rates use more CPU. Most Game Boy audio is inaudible above 44 100 Hz. Takes effect after a page reload.'));

  el.appendChild(sectionHeading('Playback'));

  el.appendChild(toggle('Loop by default', settingDefaultLoop.get(), (v) => {
    settingDefaultLoop.set(v);
    // Sync the transport bar loop button immediately
    (window as any).__beatbax_setLoop?.(v);
  }));
  el.appendChild(noteText('When on, the loop button on the transport bar is pre-activated on every page load.'));

  el.appendChild(selectField(
    'Buffer size (offline render)',
    [
      { value: '1024', label: '1 024 frames' },
      { value: '2048', label: '2 048 frames' },
      { value: '4096', label: '4 096 frames (default)' },
      { value: '8192', label: '8 192 frames' },
    ],
    settingAudioBufferFrames.get(),
    (v) => settingAudioBufferFrames.set(v as any),
  ));
  el.appendChild(noteText('Larger buffers reduce crackling during WAV export but use more memory.'));

  return el;
}

export function resetPlaybackDefaults(): void {
  const defaults: Record<string, string> = {
    [StorageKey.AUDIO_BACKEND]:       'auto',
    [StorageKey.AUDIO_SAMPLE_RATE]:   '44100',
    [StorageKey.PLAYBACK_LOOP]:       'false',
    [StorageKey.AUDIO_BUFFER_FRAMES]: '4096',
  };
  for (const [key, val] of Object.entries(defaults)) storage.set(key, val);
  // Sync loop button to off when resetting
  (window as any).__beatbax_setLoop?.(false);
}
