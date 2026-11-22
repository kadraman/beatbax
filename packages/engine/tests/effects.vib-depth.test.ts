import { get } from '../src/effects/index.js';
import { vibratoAmplitudeHz } from '../src/effects/modulation.js';
import { midiToFreqForNote } from '../src/util/music.js';

function audioMock(gainSets: number[]) {
  return {
    sampleRate: 44100,
    createBuffer: () => ({ getChannelData: () => new Float32Array(64) }),
    createBufferSource: () => ({
      playbackRate: { setValueAtTime() {}, value: 1 },
      start() {},
      stop() {},
      connect() {},
      loop: false,
      buffer: null,
    }),
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime(value: number) { gainSets.push(value); },
      },
      connect() {},
    }),
    createOscillator: () => ({
      frequency: { setValueAtTime() {}, value: 4 },
      start() {},
      stop() {},
      connect() {},
    }),
  };
}

describe('vibrato depth', () => {
  test('C4, C5, and C6 use the note frequency, not the 440 Hz default', () => {
    const handler = get('vib');
    if (!handler) throw new Error('vib handler not found');

    for (const name of ['C4', 'C5', 'C6']) {
      const freq = midiToFreqForNote(name);
      if (freq === null) throw new Error(name);
      const gainSets: number[] = [];
      const osc = {
        _baseFreq: freq,
        frequency: {
          value: 440,
          getValueAtTime: () => 440,
          setValueAtTime() {},
        },
      };
      handler(audioMock(gainSets), [osc], [6, 4], 0, 1);
      const expected = vibratoAmplitudeHz(6, freq, 1);
      expect(gainSets.length).toBeGreaterThan(0);
      const actual = gainSets[gainSets.length - 1];
      expect(Math.abs(actual - expected) / expected).toBeLessThan(0.02);
      expect(Math.abs(actual - vibratoAmplitudeHz(6, 440, 1)) / expected).toBeGreaterThan(0.02);
    }
  });
});
