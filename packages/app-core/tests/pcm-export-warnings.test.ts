import { collectPcmWavExportWarnings } from '../src/export/pcm-export-warnings';

function songWithEffects(chip: string, effects: unknown[]) {
  return {
    chip,
    channels: [
      {
        id: 1,
        events: [
          { type: 'note', token: 'C4', effects },
        ],
      },
    ],
  };
}

describe('collectPcmWavExportWarnings', () => {
  it('returns no warnings for NES songs without unsupported effects', () => {
    const warnings = collectPcmWavExportWarnings(songWithEffects('nes', [
      { type: 'pitch_env', params: ['[0,2,0]'] },
    ]));
    expect(warnings).toHaveLength(0);
  });

  it('does not warn about echo/retrig on Game Boy (PCM supports them — spec 112)', () => {
    const warnings = collectPcmWavExportWarnings(songWithEffects('gameboy', [
      { type: 'echo', params: [0.25, 50, 30] },
      { type: 'retrig', params: [4, -2] },
    ]));
    expect(warnings).toHaveLength(0);
  });

  it('warns about unsupported per-note effects on NES', () => {
    const warnings = collectPcmWavExportWarnings(songWithEffects('nes', [
      { type: 'vib', params: [4, 6] },
      { type: 'arp', params: [3, 7] },
    ]));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/NES WAV export uses the PCM renderer/i);
    expect(warnings[0]).toMatch(/vibrato/i);
    expect(warnings[0]).toMatch(/arpeggio/i);
    expect(warnings[0]).toMatch(/live playback/i);
  });

  it('does not warn about GB per-note effects (PCM supports them)', () => {
    const warnings = collectPcmWavExportWarnings(songWithEffects('gameboy', [
      { type: 'vib', params: [4, 6] },
      { type: 'arp', params: [3, 7] },
    ]));
    expect(warnings).toHaveLength(0);
  });

  it('recognizes famicom alias as NES', () => {
    const warnings = collectPcmWavExportWarnings(songWithEffects('famicom', [
      { type: 'bend', params: [2] },
    ]));
    expect(warnings.some((w) => /NES WAV export/i.test(w) && /pitch bend/i.test(w))).toBe(true);
  });
});
