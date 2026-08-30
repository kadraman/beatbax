/** @jest-environment node */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { detectArrangementLayout } from '@beatbax/app-core/editor/arrangement-slice';
import { parseWithPeggy } from '@beatbax/engine/parser';
import {
  getLastAssistantChatContent,
  isArrangementLayoutFixConfirmation,
  isArrangementLayoutFixIntent,
  tryApplyArrangementLayoutFix,
} from '../src/renderer/src/lib/copilot-arrangement-fix';

const shadowTemplePath = resolve(__dirname, '../../../songs/nes/shadow_temple.bax');
const shadowTemple = readFileSync(shadowTemplePath, 'utf8');
const battleFanfarePath = resolve(__dirname, '../../../songs/nes/battle_fanfare.bax');
const battleFanfare = readFileSync(battleFanfarePath, 'utf8');

describe('isArrangementLayoutFixIntent', () => {
  it('detects typed apply follow-ups', () => {
    expect(isArrangementLayoutFixIntent('please apply this change')).toBe(true);
    expect(isArrangementLayoutFixIntent('Apply suggested fix')).toBe(true);
  });

  it('detects phased layout explanations', () => {
    expect(isArrangementLayoutFixIntent(
      'Phased layout detected. Add section headers above cross-channel seq groups.',
    )).toBe(true);
  });
});

describe('isArrangementLayoutFixConfirmation', () => {
  it('detects run confirmations', () => {
    expect(isArrangementLayoutFixConfirmation('yes, run it')).toBe(true);
    expect(isArrangementLayoutFixConfirmation('please run split')).toBe(true);
    expect(isArrangementLayoutFixConfirmation('explain section focus')).toBe(false);
  });
});

describe('tryApplyArrangementLayoutFix', () => {
  it('proposes phased restructure before confirmation', () => {
    const { ast } = parseWithPeggy(shadowTemple);
    expect(detectArrangementLayout(shadowTemple, ast)).toBe('phased');

    const result = tryApplyArrangementLayoutFix(
      shadowTemple,
      'please apply this change',
      'Phased layout detected. Add `# --- Section N ---` headers above cross-channel seq groups.',
    );
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') return;
    expect(result.action).toBe('restructure_phased');
    expect(result.commandLabel).toMatch(/Restructure Phased Sections/i);
    expect(result.explanation).toMatch(/command palette/i);
  });

  it('restructures shadow_temple after confirmation', () => {
    const result = tryApplyArrangementLayoutFix(
      shadowTemple,
      'yes, run it',
      undefined,
      { confirmed: true, action: 'restructure_phased' },
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;

    const { ast: nextAst } = parseWithPeggy(result.song);
    expect(detectArrangementLayout(result.song, nextAst)).toBe('structured');
    expect(result.song).toMatch(/# --- Section 1: Intro ---/);
    expect(result.song).toMatch(/Square 2 \(Arpeggio counter-melody\)/);
    expect(result.song).toMatch(/Timing summary:/);
  });

  it('reports already when section headers exist', () => {
    const applied = tryApplyArrangementLayoutFix(
      shadowTemple,
      'yes, run it',
      undefined,
      { confirmed: true, action: 'restructure_phased' },
    );
    expect(applied.status).toBe('applied');
    if (applied.status !== 'applied') return;

    const again = tryApplyArrangementLayoutFix(applied.song, 'please apply this change');
    expect(again.status).toBe('already');
  });

  it('is not applicable for unrelated edit prompts', () => {
    expect(tryApplyArrangementLayoutFix(shadowTemple, 'make the kick louder')).toEqual({
      status: 'not_applicable',
    });
  });

  it('proposes monolithic split for battle_fanfare before confirmation', () => {
    const { ast } = parseWithPeggy(battleFanfare);
    expect(detectArrangementLayout(battleFanfare, ast)).toBe('monolithic');

    const result = tryApplyArrangementLayoutFix(
      battleFanfare,
      'Section focus plays the whole song. Split channel seqs or add section markers.',
    );
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') return;
    expect(result.action).toBe('split_monolithic');
    expect(result.commandLabel).toMatch(/Split Monolithic Channel Sequences/i);
    expect(result.explanation).toMatch(/Edit mode cannot safely rewrite/i);
    expect(result.explanation).not.toMatch(/\$\{split\.sectionCount\}/);
    expect(result.explanation).toMatch(/5 groups/);
  });

  it('splits monolithic battle_fanfare after confirmation', () => {
    const result = tryApplyArrangementLayoutFix(
      battleFanfare,
      'yes, run it',
      undefined,
      { confirmed: true, action: 'split_monolithic' },
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;

    const { ast } = parseWithPeggy(result.song);
    expect(detectArrangementLayout(result.song, ast)).toBe('structured');
    expect(result.message).toMatch(/Split Monolithic Channel Sequences/i);
    expect(result.song).toMatch(/channel 1 => inst lead seq pulse1_fanfare/);
  });
});

describe('getLastAssistantChatContent', () => {
  it('returns the latest assistant reply', () => {
    expect(getLastAssistantChatContent([
      { role: 'user', content: 'explain error' },
      { role: 'assistant', content: 'Add section headers.' },
      { role: 'user', content: 'please apply this change' },
    ])).toBe('Add section headers.');
  });
});
