import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { renderSongToPCM } from '../src/audio/pcmRenderer';

describe('PCM renderer note cut effect', () => {
  test('note cut silences note after specified ticks', () => {
    // Use a longer note with cut effect to verify gating
    // Note duration: 8 ticks, cut after 2 ticks
    // At 120 BPM: tick = (60/120)/4 = 0.125s, so cut at 0.25s
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=15,flat
pat p = C4<cut:2>:8
channel 1 => inst lead pat p`;
    
    const ast = parse(src as any);
    const song = resolveSong(ast);
    const sampleRate = 8000;
    const buf = renderSongToPCM(song as any, { sampleRate, channels: 1, bpm: 120 });
    
    // Calculate sample positions
    const tickSeconds = (60 / 120) / 4; // 0.125s per tick
    const cutTimeSec = 2 * tickSeconds; // Cut at 0.25s
    const fadeDuration = 0.005; // 5ms fade
    
    const cutSample = Math.floor(cutTimeSec * sampleRate);
    const fadeEndSample = Math.floor((cutTimeSec + fadeDuration) * sampleRate);
    
    // Before cut: should have significant amplitude
    let beforeCutSum = 0;
    const beforeSampleCount = Math.min(cutSample - 100, cutSample);
    for (let i = Math.max(0, cutSample - 200); i < beforeSampleCount; i++) {
      beforeCutSum += Math.abs(buf[i]);
    }
    const beforeCutAvg = beforeCutSum / Math.max(1, beforeSampleCount - Math.max(0, cutSample - 200));
    
    // After fade completes: should be silent (near zero)
    let afterFadeSum = 0;
    const afterSampleCount = Math.min(fadeEndSample + 200, buf.length);
    for (let i = fadeEndSample + 50; i < afterSampleCount; i++) {
      afterFadeSum += Math.abs(buf[i]);
    }
    const afterFadeAvg = afterFadeSum / Math.max(1, afterSampleCount - (fadeEndSample + 50));
    
    // Verify cut occurred: amplitude after fade should be much lower than before cut
    expect(beforeCutAvg).toBeGreaterThan(0.1); // Should have audible signal before cut
    expect(afterFadeAvg).toBeLessThan(0.01); // Should be nearly silent after fade
    expect(afterFadeAvg).toBeLessThan(beforeCutAvg * 0.05); // At least 95% reduction
  });

  test('note cut with zero ticks is ignored', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=15,flat
pat p = C4<cut:0>:4
channel 1 => inst lead pat p`;
    
    const ast = parse(src as any);
    const song = resolveSong(ast);
    const buf = renderSongToPCM(song as any, { sampleRate: 8000, channels: 1, bpm: 120 });
    
    // With cut:0, note should play normally (no cut)
    // Check that we have consistent amplitude throughout
    let sum = 0;
    const sampleCount = Math.min(1000, buf.length);
    for (let i = 0; i < sampleCount; i++) {
      sum += Math.abs(buf[i]);
    }
    const avg = sum / sampleCount;
    
    // Should have audible signal (cut:0 means no cutting)
    expect(avg).toBeGreaterThan(0.1);
  });

  test('note cut caps at note duration', () => {
    // Note with 4 ticks duration but cut at 10 ticks
    // Cut should be capped at note end (4 ticks)
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=15,flat
pat p = C4<cut:10>:4 . . .
channel 1 => inst lead pat p`;
    
    const ast = parse(src as any);
    const song = resolveSong(ast);
    const sampleRate = 8000;
    const buf = renderSongToPCM(song as any, { sampleRate, channels: 1, bpm: 120 });
    
    const tickSeconds = (60 / 120) / 4; // 0.125s per tick
    const noteDuration = 4 * tickSeconds; // Note is 4 ticks = 0.5s
    const noteEndSample = Math.floor(noteDuration * sampleRate);
    
    // After note ends, should be silent (rests follow)
    let afterNoteSum = 0;
    const afterCount = Math.min(noteEndSample + 500, buf.length);
    for (let i = noteEndSample + 100; i < afterCount; i++) {
      afterNoteSum += Math.abs(buf[i]);
    }
    const afterNoteAvg = afterNoteSum / Math.max(1, afterCount - (noteEndSample + 100));
    
    // Should be silent after note duration (due to rests or end of note)
    expect(afterNoteAvg).toBeLessThan(0.05);
  });

  test('note cut works with stereo rendering', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=15,flat pan=L
pat p = C4<cut:2>:8
channel 1 => inst lead pat p`;
    
    const ast = parse(src as any);
    const song = resolveSong(ast);
    const sampleRate = 8000;
    const buf = renderSongToPCM(song as any, { sampleRate, channels: 2, bpm: 120 });
    
    const tickSeconds = (60 / 120) / 4;
    const cutTimeSec = 2 * tickSeconds;
    const fadeDuration = 0.005;
    const fadeEndSample = Math.floor((cutTimeSec + fadeDuration) * sampleRate);
    
    // After fade: both channels should be silent
    let leftSum = 0, rightSum = 0;
    const afterCount = Math.min((fadeEndSample + 200) * 2, buf.length);
    for (let i = (fadeEndSample + 50) * 2; i < afterCount; i += 2) {
      leftSum += Math.abs(buf[i]);
      rightSum += Math.abs(buf[i + 1]);
    }
    const sampleCount = (afterCount - (fadeEndSample + 50) * 2) / 2;
    const leftAvg = leftSum / Math.max(1, sampleCount);
    const rightAvg = rightSum / Math.max(1, sampleCount);
    
    // Both channels should be nearly silent after cut
    expect(leftAvg).toBeLessThan(0.01);
    expect(rightAvg).toBeLessThan(0.01);
  });

  test('note cut with multiple notes in pattern', () => {
    // Pattern with multiple notes, each with different cut times
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=15,flat
pat p = C4<cut:1>:4 E4<cut:2>:4 G4<cut:3>:4
channel 1 => inst lead pat p`;
    
    const ast = parse(src as any);
    const song = resolveSong(ast);
    const buf = renderSongToPCM(song as any, { sampleRate: 8000, channels: 1, bpm: 120 });
    
    // Just verify it renders without crashing and produces output
    expect(buf.length).toBeGreaterThan(0);
    
    // Check that we have some non-zero samples (notes played)
    let nonZeroCount = 0;
    for (let i = 0; i < Math.min(2000, buf.length); i++) {
      if (Math.abs(buf[i]) > 0.05) nonZeroCount++;
    }
    expect(nonZeroCount).toBeGreaterThan(100); // Should have audible output
  });

  test('note cut combined with envelope', () => {
    // Note with both envelope and cut effect
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat p = C4<cut:3>:8
channel 1 => inst lead pat p`;
    
    const ast = parse(src as any);
    const song = resolveSong(ast);
    const sampleRate = 8000;
    const buf = renderSongToPCM(song as any, { sampleRate, channels: 1, bpm: 120 });
    
    const tickSeconds = (60 / 120) / 4;
    const cutTimeSec = 3 * tickSeconds; // 0.375s
    const fadeDuration = 0.005;
    const fadeEndSample = Math.floor((cutTimeSec + fadeDuration) * sampleRate);
    
    // After cut fade completes, should be silent regardless of envelope
    let afterFadeSum = 0;
    const afterCount = Math.min(fadeEndSample + 300, buf.length);
    for (let i = fadeEndSample + 50; i < afterCount; i++) {
      afterFadeSum += Math.abs(buf[i]);
    }
    const afterFadeAvg = afterFadeSum / Math.max(1, afterCount - (fadeEndSample + 50));
    
    expect(afterFadeAvg).toBeLessThan(0.01); // Cut should override envelope
  });
});
