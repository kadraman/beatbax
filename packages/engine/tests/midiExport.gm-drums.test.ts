import { Midi } from '@tonejs/midi';
import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { buildMIDI } from '../src/export/midiExport';

describe('MIDI export GM programs and drum map', () => {
  test('maps pulse2 / triangle / wave to import-friendly GM programs', () => {
    const source = `
chip nes
bpm 120
inst lead type=pulse1 duty=25
inst harm type=pulse2 duty=50
inst bass type=triangle
pat a = C4
pat b = E3
pat c = A2
channel 1 => inst lead pat a
channel 2 => inst harm pat b
channel 3 => inst bass pat c
`;
    const song = resolveSong(parse(source) as any);
    const bytes = buildMIDI(song);
    const midi = new Midi(bytes);
    const programs = midi.tracks.filter((t) => t.notes.length > 0).map((t) => t.instrument.number);
    // pulse1→80, pulse2→89 (pad, not bass 34), triangle→39
    expect(programs).toEqual(expect.arrayContaining([80, 89, 39]));
    expect(programs).not.toContain(34);
  });

  test('maps full drum token names to GM keys', () => {
    const source = `
chip nes
bpm 120
inst kick type=noise noise_mode=normal noise_period=12
inst snare type=noise noise_mode=normal noise_period=7
inst hihat type=noise noise_mode=normal noise_period=2
pat drums = kick snare hihat
channel 4 => inst kick pat drums
`;
    const song = resolveSong(parse(source) as any);
    const bytes = buildMIDI(song);
    const midi = new Midi(bytes);
    const drumTrack = midi.tracks.find((t) => t.instrument.percussion || t.channel === 9);
    expect(drumTrack).toBeTruthy();
    const pitches = new Set(drumTrack!.notes.map((n) => n.midi));
    expect(pitches.has(36)).toBe(true); // kick
    expect(pitches.has(38)).toBe(true); // snare
    expect(pitches.has(42)).toBe(true); // hihat
    expect(pitches.has(39)).toBe(false); // not collapsed to default
  });
});
