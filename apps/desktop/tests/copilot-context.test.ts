/** @jest-environment node */

import type { Diagnostic } from '@beatbax/app-core/editor/diagnostics';
import type { AISettings } from '@beatbax/app-core/stores/chat.store';
import { buildCopilotContext, buildSongStructureSummary } from '../src/renderer/src/lib/copilot-context';

const defaultSettings: AISettings = {
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'test-key',
  model: 'gpt-4.1',
  maxContextChars: 3000,
};

const sampleSong = [
  'inst leadA type=pulse1',
  'effect leadVib = vib:3,5',
  'pat melody_pat = C5:4 D5:4',
  'pat mystery = C5<unknownFx>:4',
  'seq lead_seq = melody_pat',
  'channel 1 => inst leadA seq lead_seq',
  'play auto repeat',
].join('\n');

describe('buildCopilotContext', () => {
  it('includes syntax reference, effect guidance, and defined names', () => {
    const context = buildCopilotContext(
      defaultSettings,
      'ask',
      () => sampleSong,
      () => [],
    );

    expect(context).toContain('[BEATBAX SYNTAX REFERENCE]');
    expect(context).toContain('[EFFECT GUIDANCE]');
    expect(context).toContain('[DEFINED NAMES]');
    expect(context).toContain('[EDITOR CONTENT]');
    expect(context).toContain('[DIAGNOSTICS]');
    expect(context).toContain('Instruments defined in this song: leadA');
    expect(context).toContain('Effects defined in this song: leadVib');
    expect(context).toContain('unknownFx');
  });

  it('warns against bar separators and invalid pattern commas', () => {
    const context = buildCopilotContext(
      defaultSettings,
      'edit',
      () => sampleSong,
      () => [],
    );

    expect(context).toContain('NEVER use bar separators `|`');
    expect(context).toContain('durations are encoded as `:N` or `/N`');
    expect(context).toContain('put duration AFTER the effects');
    expect(context).toContain('C4<vib:3,5>:4');
  });

  it('does not truncate editor content in edit mode', () => {
    const longSong = `${sampleSong}\n${'// padding\n'.repeat(500)}`;
    const context = buildCopilotContext(
      defaultSettings,
      'edit',
      () => longSong,
      () => [],
    );

    expect(context).not.toContain('...[truncated]');
    expect(context).toContain(longSong);
  });

  it('truncates editor content in ask mode when over maxContextChars', () => {
    const longSong = 'x'.repeat(4000);
    const context = buildCopilotContext(
      { ...defaultSettings, maxContextChars: 100 },
      'ask',
      () => longSong,
      () => [],
    );

    expect(context).toContain('...[truncated]');
    expect(context).not.toContain(longSong);
  });

  it('ask mode tells the model to cite existing code inline, not dump fenced song copies', () => {
    const context = buildCopilotContext(
      defaultSettings,
      'ask',
      () => sampleSong,
      () => [],
    );

    expect(context).toContain('ASK mode');
    expect(context).toContain('[SONG STRUCTURE]');
    expect(context).toContain('Patterns (2): melody_pat, mystery');
    expect(context).toContain('Cite at most ONE short inline line');
    expect(context).toContain('Do NOT add sections titled "Example Code"');
    expect(context).not.toContain('Valid edit example');
    expect(context).not.toContain('melody_var_vib');
  });

  it('edit mode keeps the full syntax edit example', () => {
    const context = buildCopilotContext(
      defaultSettings,
      'edit',
      () => sampleSong,
      () => [],
    );

    expect(context).toContain('Valid edit example');
    expect(context).toContain('melody_var_vib');
    expect(context).not.toContain('[SONG STRUCTURE]');
  });

  it('buildSongStructureSummary lists patterns, sequences, and channels', () => {
    const summary = buildSongStructureSummary(sampleSong);
    expect(summary).toContain('Patterns (2): melody_pat, mystery');
    expect(summary).toContain('lead_seq → melody_pat');
    expect(summary).toContain('channel 1 → inst leadA seq lead_seq');
    expect(summary).toContain('Playback: play auto repeat');
  });

  it('includes formatted diagnostics', () => {
    const diagnostics: Diagnostic[] = [{
      severity: 'error',
      message: 'unexpected token',
      startLine: 3,
      startColumn: 5,
      endLine: 3,
      endColumn: 6,
    }];
    const context = buildCopilotContext(
      defaultSettings,
      'ask',
      () => sampleSong,
      () => diagnostics,
    );

    expect(context).toContain('error   line 3, col 5: unexpected token');
  });
});
