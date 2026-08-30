import { readFileSync } from 'fs';
import { resolve } from 'path';
import { detectArrangementLayout } from '../src/editor/arrangement-slice';
import {
  BATTLE_FANFARE_SECTION_SPLITS,
  splitMonolithicChannelSeqs,
} from '../src/editor/arrangement-monolithic-split';

const battleFanfarePath = resolve(__dirname, '../../../songs/nes/battle_fanfare.bax');
const battleFanfare = readFileSync(battleFanfarePath, 'utf8');

function battleFanfareAst() {
  return {
    channels: [
      { id: 1, inst: 'lead', seqSpecTokens: ['pulse1_main'] },
      { id: 2, inst: 'harm', seqSpecTokens: ['pulse2_main'] },
      { id: 3, inst: 'tri', seqSpecTokens: ['tri_main'] },
      { id: 4, inst: 'kick', seqSpecTokens: ['noise_main'] },
      { id: 5, inst: 'kick_dmc', seqSpecTokens: ['dmc_main'] },
    ],
    seqs: Object.fromEntries(
      ['pulse1_main', 'pulse2_main', 'tri_main', 'noise_main', 'dmc_main'].map((name) => [name, Array(19).fill('pat')]),
    ),
  };
}

describe('splitMonolithicChannelSeqs', () => {
  it('splits battle_fanfare into five aligned section seq groups', () => {
    const ast = battleFanfareAst();
    expect(detectArrangementLayout(battleFanfare, ast)).toBe('monolithic');

    const result = splitMonolithicChannelSeqs(battleFanfare, ast, BATTLE_FANFARE_SECTION_SPLITS);
    expect(result).not.toBeNull();
    expect(result!.sectionCount).toBe(5);
    expect(result!.source).toMatch(/# --- Section 1: Fanfare ---/);
    expect(result!.source).toMatch(/# --- Section 5: Outro ---/);
    expect(result!.source).toMatch(/seq pulse1_fanfare = /);
    expect(result!.source).toMatch(/seq pulse1_outro = /);
    expect(result!.source).not.toMatch(/^seq pulse1_main = /m);
    expect(result!.source).toMatch(
      /channel 1 => inst lead\s+seq pulse1_fanfare pulse1_theme_a pulse1_theme_b pulse1_transition_reprise pulse1_outro/,
    );
    const splitAst = {
      channels: [
        { id: 1, inst: 'lead', seqSpecTokens: ['pulse1_fanfare', 'pulse1_theme_a', 'pulse1_theme_b', 'pulse1_transition_reprise', 'pulse1_outro'] },
        { id: 2, inst: 'harm', seqSpecTokens: ['pulse2_fanfare', 'pulse2_theme_a', 'pulse2_theme_b', 'pulse2_transition_reprise', 'pulse2_outro'] },
        { id: 3, inst: 'tri', seqSpecTokens: ['tri_fanfare', 'tri_theme_a', 'tri_theme_b', 'tri_transition_reprise', 'tri_outro'] },
        { id: 4, inst: 'kick', seqSpecTokens: ['noise_fanfare', 'noise_theme_a', 'noise_theme_b', 'noise_transition_reprise', 'noise_outro'] },
        { id: 5, inst: 'kick_dmc', seqSpecTokens: ['dmc_fanfare', 'dmc_theme_a', 'dmc_theme_b', 'dmc_transition_reprise', 'dmc_outro'] },
      ],
    };
    expect(detectArrangementLayout(result!.source, splitAst)).toBe('structured');
  });

  it('preserves spaced * N repetition as one slot when splitting seq bodies', () => {
    const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst harm type=pulse2 duty=25 env=10,down
pat a = C4 E4 G4 C5
pat b = D4 F4 A4 D5
pat c = E4 G4 B4 E5
pat d = F4 A4 C5 F5
seq pulse1_main = a b * 2 c d
seq pulse2_main = a b * 2 c d
channel 1 => inst lead seq pulse1_main
channel 2 => inst harm seq pulse2_main
play`;
    const ast = {
      channels: [
        { id: 1, inst: 'lead', seqSpecTokens: ['pulse1_main'] },
        { id: 2, inst: 'harm', seqSpecTokens: ['pulse2_main'] },
      ],
      seqs: {
        pulse1_main: ['a', 'b', 'b', 'c', 'd'],
        pulse2_main: ['a', 'b', 'b', 'c', 'd'],
      },
    };
    const sections = [
      { label: 'First', tokenCount: 2 },
      { label: 'Second', tokenCount: 2 },
    ];
    const result = splitMonolithicChannelSeqs(src, ast, sections);
    expect(result).not.toBeNull();
    expect(result!.source).toMatch(/seq pulse1_first = a b\*2/);
    expect(result!.source).toMatch(/seq pulse1_second = c d/);
    expect(result!.source).toMatch(/seq pulse2_first = a b\*2/);
    expect(result!.source).not.toMatch(/seq pulse1_first = a b \* 2 c/);
  });
});
