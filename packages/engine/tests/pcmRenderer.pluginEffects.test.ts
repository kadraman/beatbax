import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';
import { renderSongToPCM } from '../src/audio/pcmRenderer.js';

function pluginPcmWarnings(): string[] {
  return (console.warn as jest.Mock).mock.calls
    .map((args) => args.map(String).join(' '))
    .filter((line) => line.includes('plugin-chip PCM render'));
}

describe('plugin PCM drops remaining note effects loudly', () => {
  const opts = { sampleRate: 8000, channels: 1 as const, bpm: 120 };

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('a vibrato on a plugin chip warns once for the whole render', () => {
    const song = resolveSong(parse(`
chip nes
bpm 120
inst lead type=pulse1 duty=50
pat p = C4<vib:4,6>:4 C5<vib:4,6>:4
channel 1 => inst lead pat p
`));
    renderSongToPCM(song, opts);
    const warnings = pluginPcmWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('vib');
    expect(warnings[0]).toContain('Desktop live playback still applies them');
  });

  test('a baked pitch macro does not warn', () => {
    const song = resolveSong(parse(`
chip nes
bpm 120
inst lead type=pulse1 duty=50
pat p = C4<pitch_env:[0,1,0]>:4
channel 1 => inst lead pat p
`));
    renderSongToPCM(song, opts);
    expect(pluginPcmWarnings()).toHaveLength(0);
  });

  test('Game Boy vibrato stays on the shared kernel and does not warn', () => {
    const song = resolveSong(parse(`
chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=gb:12,flat
pat p = C4<vib:4,6>:4
channel 1 => inst lead pat p
`));
    renderSongToPCM(song, opts);
    expect(pluginPcmWarnings()).toHaveLength(0);
  });
});
