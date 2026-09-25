import { hintChipRoleFromTrackName } from '../../../src/import/midi/roles';

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
