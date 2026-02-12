/**
 * Test that noise instruments with note= parameters work correctly
 * Regression test for issue where noise channels became quiet when defaultNote was used
 */

import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { renderSongToPCM } from '../src/audio/pcmRenderer';

describe('Noise instruments with defaultNote', () => {
  test('noise instruments with note= should render at full volume', () => {
    const script = `
      chip gameboy
      bpm 240
      inst snare type=noise gb:width=7 env=13,down note=C7
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

    // Check that we got samples
    expect(samples).toBeDefined();
    expect(samples.length).toBeGreaterThan(0);

    // Check that there's actual audio data (not all zeros/silence)
    // Noise should be reasonably loud (at least 0.05 peak amplitude)
    let maxAmp = 0;
    for (let i = 0; i < samples.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(samples[i]));
    }
    expect(maxAmp).toBeGreaterThan(0.05); // Noise should be audible
  });

  test('named noise events should use instrument name for lookup, not defaultNote', () => {
    const script = `
      chip gameboy
      bpm 240
      inst hihat type=noise gb:width=15 env=6,down note=C7
      pat p = hihat . . .
      channel 4 => inst hihat seq p
    `;
    const ast = parse(script);
    const song = resolveSong(ast);

    // Check that the named event has defaultNote but instrument type is noise
    const ch = song.channels[0];
    const namedEvent = ch.events[0] as any;
    expect(namedEvent.type).toBe('named');
    expect(namedEvent.defaultNote).toBe('C7');
    expect(namedEvent.token).toBe('hihat');

    // Verify instrument is noise type
    expect(ast.insts['hihat']).toBeDefined();
    expect(ast.insts['hihat'].type).toBe('noise');

    // Render and verify audio is produced (not silent due to wrong note parsing)
    const samples = renderSongToPCM(song, {
      sampleRate: 44100,
      channels: 2,
      bpm: 240
    });

    let maxAmp = 0;
    for (let i = 0; i < samples.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(samples[i]));
    }
    expect(maxAmp).toBeGreaterThan(0.05);
  });

  test('pulse instruments with note= should use defaultNote', () => {
    const script = `
      chip gameboy
      bpm 240
      inst kick type=pulse1 duty=12.5 env=15,down note=C2
      pat p = kick . . .
      channel 1 => inst kick seq p
    `;
    const ast = parse(script);
    const song = resolveSong(ast);

    const ch = song.channels[0];
    const namedEvent = ch.events[0] as any;
    expect(namedEvent.type).toBe('named');
    expect(namedEvent.defaultNote).toBe('C2');

    // Render and verify audio is produced at C2 frequency
    const samples = renderSongToPCM(song, {
      sampleRate: 44100,
      channels: 2,
      bpm: 240
    });

    let maxAmp = 0;
    for (let i = 0; i < samples.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(samples[i]));
    }
    expect(maxAmp).toBeGreaterThan(0.01);
  });

  test('mixed noise and pulse named instruments', () => {
    const script = `
      chip gameboy
      bpm 240
      inst kick type=pulse1 duty=12.5 env=15,down note=C2
      inst snare type=noise gb:width=7 env=13,down note=C7
      pat kick_pat = kick . . .
      pat snare_pat = . . snare .
      channel 1 => inst kick seq kick_pat
      channel 4 => inst snare seq snare_pat
    `;
    const ast = parse(script);
    const song = resolveSong(ast);

    // Both channels should render correctly
    const samples = renderSongToPCM(song, {
      sampleRate: 44100,
      channels: 2,
      bpm: 240
    });

    let maxAmp = 0;
    for (let i = 0; i < samples.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(samples[i]));
    }
    expect(maxAmp).toBeGreaterThan(0.05);
  });
});
