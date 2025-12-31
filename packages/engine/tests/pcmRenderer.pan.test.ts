import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { renderSongToPCM } from '../src/audio/pcmRenderer';

describe('PCM renderer panning', () => {
  test('instrument default gb:pan=L results in left channel dominant', () => {
    const src = `chip gameboy\ninst lead type=pulse1 gb:pan=L\npat p = C4:4\nchannel 1 => inst lead pat p`;
    const ast = parse(src as any);
    const song = resolveSong(ast);
    const buf = renderSongToPCM(song as any, { sampleRate: 8000, channels: 2, bpm: 120 });
    // Inspect first 1024 samples sum per channel
    let leftSum = 0, rightSum = 0;
    for (let i = 0; i < Math.min(1024, buf.length / 2); i++) {
      leftSum += Math.abs(buf[i * 2 + 0]);
      rightSum += Math.abs(buf[i * 2 + 1]);
    }
    expect(leftSum).toBeGreaterThan(rightSum * 1.1);
  });

  test('inline pan R results in right channel dominant', () => {
    const src = `chip gameboy\ninst lead type=pulse1\npat p = C4<pan:R>:4\nchannel 1 => inst lead pat p`;
    const ast = parse(src as any);
    const song = resolveSong(ast);
    const buf = renderSongToPCM(song as any, { sampleRate: 8000, channels: 2, bpm: 120 });
    let leftSum = 0, rightSum = 0;
    for (let i = 0; i < Math.min(1024, buf.length / 2); i++) {
      leftSum += Math.abs(buf[i * 2 + 0]);
      rightSum += Math.abs(buf[i * 2 + 1]);
    }
    expect(rightSum).toBeGreaterThan(leftSum * 1.1);
  });
});