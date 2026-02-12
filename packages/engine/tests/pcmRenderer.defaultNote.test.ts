/**
 * Test PCM renderer's handling of defaultNote for named instrument events
 */

import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { renderSongToPCM } from '../src/audio/pcmRenderer';

describe('PCM Renderer defaultNote handling', () => {
  test('named events with defaultNote should render pulse sounds', () => {
    const script = `
      chip gameboy
      bpm 240
      inst kick type=pulse1 duty=12.5 env=15,down note=C2
      pat p = kick . . .
      channel 1 => inst kick seq p
    `;
    const ast = parse(script);
    const song = resolveSong(ast);

    const samples = renderSongToPCM(song, {
      sampleRate: 44100,
      channels: 2,
      bpm: 240
    });

    // Check that we got samples
    expect(samples).toBeDefined();
    expect(samples.length).toBeGreaterThan(0);

    // Check that there's actual audio data (not all zeros/silence)
    let maxAmp = 0;
    for (let i = 0; i < samples.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(samples[i]));
    }
    expect(maxAmp).toBeGreaterThan(0.01); // Should have some signal
  });

  test('named events without defaultNote and noise type should render noise', () => {
    const script = `
      chip gameboy
      bpm 240
      inst snare type=noise env=15,down
      pat p = snare . . .
      channel 4 => inst snare seq p
    `;
    const ast = parse(script);
    const song = resolveSong(ast);

    const samples = renderSongToPCM(song, {
      sampleRate: 44100,
      channels: 2,
      bpm: 240
    });

    // Check that we got samples with audio
    expect(samples).toBeDefined();
    expect(samples.length).toBeGreaterThan(0);

    let maxAmp = 0;
    for (let i = 0; i < samples.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(samples[i]));
    }
    expect(maxAmp).toBeGreaterThan(0.01);
  });

  test('mixed named events with and without defaultNote', () => {
    const script = `
      chip gameboy
      bpm 240
      inst kick type=pulse1 duty=12.5 env=15,down note=C2
      inst snare type=noise env=15,down
      pat kick_pat = kick . . .
      pat snare_pat = snare . . .
      channel 1 => inst kick seq kick_pat
      channel 4 => inst snare seq snare_pat
    `;
    const ast = parse(script);
    const song = resolveSong(ast);

    const samples = renderSongToPCM(song, {
      sampleRate: 44100,
      channels: 2,
      bpm: 240
    });

    // Should render both channels successfully
    expect(samples).toBeDefined();
    expect(samples.length).toBeGreaterThan(0);

    let maxAmp = 0;
    for (let i = 0; i < samples.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(samples[i]));
    }
    expect(maxAmp).toBeGreaterThan(0.01);
  });
});
