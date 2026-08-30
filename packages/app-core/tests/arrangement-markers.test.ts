import { readFileSync } from 'fs';
import { resolve } from 'path';
import { addDefaultSectionMarkers, mergeSectionMarkersFromCopilotTexts } from '../src/editor/arrangement-markers';
import { detectArrangementLayout } from '../src/editor/arrangement-slice';

const battleFanfarePath = resolve(__dirname, '../../../songs/nes/battle_fanfare.bax');
const battleFanfare = readFileSync(battleFanfarePath, 'utf8');

function battleFanfareAst() {
  return {
    channels: [
      { seqSpecTokens: ['pulse1_main'] },
      { seqSpecTokens: ['pulse2_main'] },
      { seqSpecTokens: ['tri_main'] },
      { seqSpecTokens: ['noise_main'] },
      { seqSpecTokens: ['dmc_main'] },
    ],
  };
}

describe('addDefaultSectionMarkers', () => {
  it('inserts markers before seq groups on phased songs', () => {
    const phased = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4 G4 C5
seq part_a = a
seq part_b = a a
channel 1 => inst lead seq part_a part_b
play`;
    const ast = {
      seqs: { part_a: ['a'], part_b: ['a', 'a'] },
      channels: [{ id: 1, inst: 'lead', seqSpecTokens: ['part_a', 'part_b'] }],
    };
    expect(detectArrangementLayout(phased, ast)).toBe('phased');

    const result = mergeSectionMarkersFromCopilotTexts(
      phased,
      '# --- Section 1: Intro ---',
      '# --- Section 2: Main ---',
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.song).toMatch(/# --- Section 1: Intro ---/);
  });

  it('places a single missing marker at its section group, not the first seq', () => {
    const phased = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4 G4 C5
# --- Section 1: Intro ---
seq part_a = a

seq part_b = a a
channel 1 => inst lead seq part_a part_b
play`;

    const result = mergeSectionMarkersFromCopilotTexts(
      phased,
      '# --- Section 1: Intro ---',
      '# --- Section 2: Main ---',
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;

    const lines = result.song.split('\n');
    const section2Idx = lines.findIndex((line) => /# --- Section 2: Main ---/.test(line));
    const partBIdx = lines.findIndex((line) => /^seq part_b/.test(line));
    expect(section2Idx).toBeGreaterThanOrEqual(0);
    expect(partBIdx).toBeGreaterThan(section2Idx);
    expect(lines.slice(section2Idx + 1, partBIdx).every((line) => line.trim() === '')).toBe(true);
  });

  it('maps several missing markers to their original section ordinals', () => {
    const phased = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 E4 G4 C5
# --- Section 1: One ---
seq part_a = a

seq part_b = a a

seq part_c = a a a
channel 1 => inst lead seq part_a part_b part_c
play`;

    const result = mergeSectionMarkersFromCopilotTexts(
      phased,
      '# --- Section 1: One ---',
      '# --- Section 2: Two ---',
      '# --- Section 3: Three ---',
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;

    const lines = result.song.split('\n');
    const idx = (label: string) => lines.findIndex((line) => line.includes(label));
    expect(idx('Section 2: Two')).toBeLessThan(idx('seq part_b'));
    expect(idx('Section 3: Three')).toBeLessThan(idx('seq part_c'));
    expect(idx('Section 2: Two')).toBeGreaterThan(idx('seq part_a'));
  });

  it('does not change monolithic layout classification on battle_fanfare', () => {
    expect(detectArrangementLayout(battleFanfare, battleFanfareAst())).toBe('monolithic');

    const result = addDefaultSectionMarkers(battleFanfare);
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;

    expect(detectArrangementLayout(result.song, battleFanfareAst())).toBe('monolithic');
  });
});
