interface TransportBarProps {
  playbackState: 'stopped' | 'playing' | 'paused';
  bpm: number;
  timeLabel: string;
  onPlay(): void;
  onPause(): void;
  onStop(): void;
}

export function TransportBar({ playbackState, bpm, timeLabel, onPlay, onPause, onStop }: TransportBarProps): React.JSX.Element {
  return (
    <section className="transport-bar">
      <div className="transport-bar__controls">
        <button type="button" onClick={onPlay}>{playbackState === 'paused' ? 'Resume' : 'Play'}</button>
        <button type="button" onClick={onPause} disabled={playbackState === 'stopped'}>
          {playbackState === 'paused' ? 'Paused' : 'Pause'}
        </button>
        <button type="button" onClick={onStop} disabled={playbackState === 'stopped'}>Stop</button>
      </div>
      <div className="transport-bar__status">
        <span>BPM {bpm}</span>
        <span>{timeLabel}</span>
      </div>
    </section>
  );
}
