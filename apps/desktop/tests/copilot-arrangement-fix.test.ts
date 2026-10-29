/** @jest-environment node */

import { detectArrangementLayout } from '@beatbax/app-core/editor/arrangement-slice';
import { parseWithPeggy } from '@beatbax/engine/parser';
import {
  getLastAssistantChatContent,
  isArrangementLayoutFixConfirmation,
  isArrangementLayoutFixIntent,
  shouldTryLocalArrangementFix,
  tryApplyArrangementLayoutFix,
} from '../src/renderer/src/lib/copilot-arrangement-fix';

/** Frozen monolithic fixture (battle_fanfare 19-slot layout). Live song is section/form. */
const battleFanfareMonolith = `chip nes
bpm 155
inst lead type=pulse1
inst harm type=pulse2
inst tri type=triangle
inst kick type=noise
inst kick_dmc type=dmc
pat p = C4
seq pulse1_main = ${Array(19).fill('p').join(' ')}
seq pulse2_main = ${Array(19).fill('p').join(' ')}
seq tri_main = ${Array(19).fill('p').join(' ')}
seq noise_main = ${Array(19).fill('p').join(' ')}
seq dmc_main = ${Array(19).fill('p').join(' ')}
channel 1 => inst lead seq pulse1_main
channel 2 => inst harm seq pulse2_main
channel 3 => inst tri seq tri_main
channel 4 => inst kick seq noise_main
channel 5 => inst kick_dmc seq dmc_main
play`;

/** Minimal phased (channel-grouped) fixture — not a live sample song. */
const phasedFixture = `chip nes
bpm 90
inst lead type=pulse1
inst harm type=pulse2
inst bass type=triangle
inst kick type=noise
pat a = C4 E4
pat b = D4 F4
pat c = E4 G4
seq sq1_intro = a
seq sq1_main = b
seq sq1_bridge = c
seq sq2_intro = a
seq sq2_main = b
seq sq2_bridge = c
seq tri_intro = a
seq tri_main = b
seq tri_bridge = c
seq drum_intro = a
seq drum_main = b
seq drum_bridge = c
channel 1 => inst lead seq sq1_intro sq1_main sq1_bridge
channel 2 => inst harm seq sq2_intro sq2_main sq2_bridge
channel 3 => inst bass seq tri_intro tri_main tri_bridge
channel 4 => inst kick seq drum_intro drum_main drum_bridge
play
`;

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

describe('shouldTryLocalArrangementFix', () => {
  it('does not intercept unrelated Edit-mode prompts', () => {
    expect(shouldTryLocalArrangementFix('edit', 'make the kick louder')).toBe(false);
    expect(shouldTryLocalArrangementFix('edit', 'increase tempo to 140')).toBe(false);
  });

  it('still intercepts Edit-mode section-marker machine prompts', () => {
    expect(shouldTryLocalArrangementFix(
      'edit',
      'Insert these section marker comments into the current song immediately before the first `seq` definition.',
    )).toBe(true);
  });

  it('requires apply/fix verbs in Ask mode', () => {
    expect(shouldTryLocalArrangementFix('ask', 'explain section focus')).toBe(false);
    expect(shouldTryLocalArrangementFix('ask', 'please apply this change')).toBe(true);
  });
});

describe('tryApplyArrangementLayoutFix', () => {
  it('proposes phased restructure before confirmation', () => {
    const { ast } = parseWithPeggy(phasedFixture);
    expect(detectArrangementLayout(phasedFixture, ast)).toBe('phased');

    const result = tryApplyArrangementLayoutFix(
      phasedFixture,
      'please apply this change',
      'Phased layout detected. Add `# --- Section N ---` headers above cross-channel seq groups.',
    );
    expect(result.status).toBe('proposed');
    if (result.status !== 'proposed') return;
    expect(result.action).toBe('restructure_phased');
    expect(result.commandLabel).toMatch(/Restructure Phased Sections/i);
    expect(result.explanation).toMatch(/command palette/i);
  });

  it('restructures a phased song after confirmation', () => {
    const result = tryApplyArrangementLayoutFix(
      phasedFixture,
      'yes, run it',
      undefined,
      { confirmed: true, action: 'restructure_phased' },
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;

    const { ast: nextAst } = parseWithPeggy(result.song);
    expect(detectArrangementLayout(result.song, nextAst)).toBe('structured');
    expect(result.song).toMatch(/# --- Section 1:/);
  });

  it('reports already when section headers exist', () => {
    const applied = tryApplyArrangementLayoutFix(
      phasedFixture,
      'yes, run it',
      undefined,
      { confirmed: true, action: 'restructure_phased' },
    );
    expect(applied.status).toBe('applied');
    if (applied.status !== 'applied') return;

    const again = tryApplyArrangementLayoutFix(applied.song, 'please apply this change');
    expect(again.status).toBe('already');
  });

  it('ignores stale assistant context for unrelated follow-ups on structured songs', () => {
    const applied = tryApplyArrangementLayoutFix(
      phasedFixture,
      'yes, run it',
      undefined,
      { confirmed: true, action: 'restructure_phased' },
    );
    expect(applied.status).toBe('applied');
    if (applied.status !== 'applied') return;

    const followUp = tryApplyArrangementLayoutFix(
      applied.song,
      'make the kick louder',
      'Ran **Arrange: Restructure Phased Sections into Headers** locally — restructured 4 phased section(s). Review and save.',
    );
    expect(followUp.status).toBe('not_applicable');
  });

  it('is not applicable for unrelated edit prompts', () => {
    expect(tryApplyArrangementLayoutFix(phasedFixture, 'make the kick louder')).toEqual({
      status: 'not_applicable',
    });
  });

  it('proposes monolithic split for a battle_fanfare-shaped song before confirmation', () => {
    const { ast } = parseWithPeggy(battleFanfareMonolith);
    expect(detectArrangementLayout(battleFanfareMonolith, ast)).toBe('monolithic');

    const result = tryApplyArrangementLayoutFix(
      battleFanfareMonolith,
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

  it('splits a monolithic battle_fanfare-shaped song after confirmation', () => {
    const result = tryApplyArrangementLayoutFix(
      battleFanfareMonolith,
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
