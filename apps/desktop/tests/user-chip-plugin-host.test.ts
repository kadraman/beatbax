/** @jest-environment node */

import { installEngineHostBridge } from '../src/renderer/src/plugins/engine-host-bridge';

describe('user chip engine host bridge', () => {
  it('populates supported named engine APIs before plugins run', () => {
    installEngineHostBridge();
    const host = globalThis.__BEATBAX_ENGINE_HOST__ as Record<string, Record<string, unknown>>;
    expect(typeof host.chips.chipRegistry).toBe('object');
    expect(typeof host.audio.Player).toBe('function');
    expect(typeof host.audio.createAudioContext).toBe('function');
    expect(typeof host['util/music'].noteToMidi).toBe('function');
    expect(typeof host['util/music'].midiToFreq).toBe('function');
    expect(typeof host.export.exportJSON).toBe('function');
    expect(typeof host.instruments.serializeInstrument).toBe('function');
    expect(typeof host.patterns.expandPattern).toBe('function');
    expect(typeof host.sequences.expandSequenceItems).toBe('function');
    expect(typeof host.scheduler.createScheduler).toBe('function');
    expect(typeof host.song.resolveSong).toBe('function');
    expect(typeof host.parser.parse).toBe('function');
    expect(typeof host.root.BeatBaxEngine).toBe('function');
  });
});
