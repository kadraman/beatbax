import {
  settingAudioBufferFrames,
  settingAudioSampleRate,
  settingDefaultLoop,
} from '@beatbax/app-core/stores/settings.store';
import { useStoreValue } from '../../hooks/useStoreValue';
import { NoteText, SectionHeading, SelectField, ToggleRow } from './form';

export function PlaybackSettingsSection(): React.JSX.Element {
  const sampleRate = useStoreValue(settingAudioSampleRate);
  const defaultLoop = useStoreValue(settingDefaultLoop);
  const bufferFrames = useStoreValue(settingAudioBufferFrames);

  return (
    <div className="bb-settings-section">
      <SectionHeading>Audio</SectionHeading>
      <SelectField
        label="Sample rate"
        onChange={(value) => settingAudioSampleRate.set(value as '44100' | '48000' | '96000')}
        options={[
          { value: '44100', label: '44 100 Hz (CD quality, default)' },
          { value: '48000', label: '48 000 Hz (broadcast)' },
          { value: '96000', label: '96 000 Hz (hi-res)' },
        ]}
        value={sampleRate}
      />
      <NoteText>Higher sample rates use more CPU. Most Game Boy audio is inaudible above 44 100 Hz. Applied on the next Play and on WAV export.</NoteText>

      <SectionHeading>Playback</SectionHeading>
      <ToggleRow
        checked={defaultLoop}
        label="Loop by default"
        onChange={(value) => {
          settingDefaultLoop.set(value);
          (window as any).__beatbax_setLoop?.(value);
        }}
      />
      <NoteText>When on, the loop button on the transport bar is pre-activated on every page load.</NoteText>

      <SelectField
        label="Buffer size (offline render)"
        onChange={(value) => settingAudioBufferFrames.set(value as '1024' | '2048' | '4096' | '8192')}
        options={[
          { value: '1024', label: '1 024 frames' },
          { value: '2048', label: '2 048 frames' },
          { value: '4096', label: '4 096 frames (default)' },
          { value: '8192', label: '8 192 frames' },
        ]}
        value={bufferFrames}
      />
      <NoteText>Larger buffers reduce crackling during WAV export but use more memory. Applied on the next WAV export.</NoteText>
    </div>
  );
}

export function resetPlaybackDefaults(): void {
  settingAudioSampleRate.set('44100');
  settingDefaultLoop.set(false);
  settingAudioBufferFrames.set('4096');
  (window as any).__beatbax_setLoop?.(false);
}
