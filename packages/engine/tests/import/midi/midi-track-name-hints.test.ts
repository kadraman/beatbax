import { classifyStreams, hintChipRoleFromTrackName } from '../../../src/import/midi/roles';
import { defaultConvertOptions, parseImportConfig, resolveConvertOptions } from '../../../src/import/midi';
import type { QuantizedNote } from '../../../src/import/midi/types';

describe('hintChipRoleFromTrackName', () => {
  test('prefers chiptune / producer labels', () => {
    expect(hintChipRoleFromTrackName('Bassline')).toBe('wave');
    expect(hintChipRoleFromTrackName('SUB BASS')).toBe('wave');
    expect(hintChipRoleFromTrackName('808')).toBe('wave');
    expect(hintChipRoleFromTrackName('Saw Lead')).toBe('pulse1');
    expect(hintChipRoleFromTrackName('Melody Hook')).toBe('pulse1');
    expect(hintChipRoleFromTrackName('Pluck Arp')).toBe('pulse2');
    expect(hintChipRoleFromTrackName('Chords')).toBe('pulse2');
    expect(hintChipRoleFromTrackName('Pad FX')).toBe('pulse2');
    expect(hintChipRoleFromTrackName('Kick')).toBe('noise');
    expect(hintChipRoleFromTrackName('Claps')).toBe('noise');
    expect(hintChipRoleFromTrackName('Hi-Hat')).toBe('noise');
  });

  test('still recognizes orchestral stretch names', () => {
    expect(hintChipRoleFromTrackName('violinI:')).toBe('pulse1');
    expect(hintChipRoleFromTrackName('violinII:')).toBe('pulse2');
    expect(hintChipRoleFromTrackName('viola')).toBe('pulse2');
    expect(hintChipRoleFromTrackName('violoncello:')).toBe('wave');
  });

  test('returns null for unknown names', () => {
    expect(hintChipRoleFromTrackName('Track 1')).toBeNull();
    expect(hintChipRoleFromTrackName('')).toBeNull();
  });
});

describe('pitch-range refinement with partial trackMappings', () => {
  test('unmatched low track still refines to wave/triangle', () => {
    const opts = resolveConvertOptions({
      chip: 'gameboy',
      config: parseImportConfig({
        trackMappings: [{ midiTrack: 0, target: 'pulse1', instrument: 'lead' }],
      }),
    });
    const notes: QuantizedNote[] = [
      {
        startTick: 0,
        durationTicks: 4,
        pitch: 72,
        velocity: 100,
        midiChannel: 0,
        sourceTrackIndex: 0,
        sourceEventIndex: 0,
        trackName: 'Lead',
        program: 81,
        isDrum: false,
        shiftTicks: 0,
      },
      {
        startTick: 0,
        durationTicks: 4,
        pitch: 36,
        velocity: 100,
        midiChannel: 1,
        sourceTrackIndex: 1,
        sourceEventIndex: 0,
        trackName: 'Track 2',
        // No name/program role hint (GM 127 → null) so pitch-range refine applies.
        program: 127,
        isDrum: false,
        shiftTicks: 0,
      },
    ];
    const streams = classifyStreams(notes, opts, []);
    const overridden = streams.find((s) => s.sourceTrackIndex === 0);
    const fallback = streams.find((s) => s.sourceTrackIndex === 1);
    expect(overridden?.mappingOverride).toBe(true);
    expect(overridden?.roleHint).toBe('pulse1');
    expect(fallback?.mappingOverride).toBeFalsy();
    expect(fallback?.roleHint).toBe('wave');
  });
});
