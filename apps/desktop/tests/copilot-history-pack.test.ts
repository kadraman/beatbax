import type { ChatMessage } from '@beatbax/app-core/stores/chat.store';
import {
  earlierEditRequestsNote,
  packCopilotHistoryForModel,
  packHistoryExcludingCurrentUser,
  splitContextBudgetMessages,
  stubEditAssistantContent,
} from '../src/renderer/src/lib/copilot-history-pack';

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content'>): ChatMessage {
  return {
    timestamp: partial.timestamp ?? '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

const song = ['```bax', 'chip gameboy', 'bpm 120', 'pat drums = kick hat', 'play', '```'].join('\n');
const largeSong = `\`\`\`bax\n${'pat x = C4 '.repeat(80)}\nplay\n\`\`\``;

describe('packCopilotHistoryForModel', () => {
  it('stubs oversized prior Edit songs but keeps the UI content untouched', () => {
    const history = [
      msg({ role: 'user', content: 'add drums' }),
      msg({
        role: 'assistant',
        content: largeSong,
        replyMode: 'edit',
        applied: true,
        changeSummary: ['Added pattern `drums`'],
        applyExplanation: 'Added a kick-hat loop so the intro has a pulse.',
        changedLines: 4,
      }),
      msg({ role: 'user', content: 'now quieter' }),
    ];
    const packed = packCopilotHistoryForModel(history);
    expect(packed[1].content).toContain('[Previous Edit]');
    expect(packed[1].content).toContain('Added a kick-hat loop');
    expect(packed[1].content).toContain('Added pattern `drums`');
    expect(packed[1].content).not.toContain('```bax');
    expect(history[1].content).toContain('```bax');
  });

  it('omits prior Edit turns and their requests when omitEditTurns is set', () => {
    const packed = packCopilotHistoryForModel([
      msg({ role: 'user', content: 'what is bpm?' }),
      msg({ role: 'assistant', content: 'bpm sets tempo.', replyMode: 'ask' }),
      msg({ role: 'user', content: 'add drums' }),
      msg({ role: 'assistant', content: largeSong, replyMode: 'edit', applied: true }),
    ], undefined, { omitEditTurns: true });
    expect(packed.map((message) => message.content)).toEqual(['what is bpm?', 'bpm sets tempo.']);
  });

  it('lists the requests behind omitted Edit turns, excluding the in-flight prompt', () => {
    const note = earlierEditRequestsNote([
      msg({ role: 'user', content: 'what is bpm?' }),
      msg({ role: 'assistant', content: 'bpm sets tempo.', replyMode: 'ask' }),
      msg({ role: 'user', content: 'add vibrato to the lead' }),
      msg({ role: 'assistant', content: largeSong, replyMode: 'edit', applied: true }),
      msg({ role: 'user', content: 'now do the same for the bass' }),
    ], 'now do the same for the bass');
    expect(note).toContain('[Earlier Edit requests in this chat');
    expect(note).toContain('- add vibrato to the lead');
    expect(note).not.toContain('what is bpm?');
    expect(note).not.toContain('now do the same');
  });

  it('lists a repeated earlier request once', () => {
    const note = earlierEditRequestsNote([
      msg({ role: 'user', content: 'add a fill' }),
      msg({ role: 'assistant', content: largeSong, replyMode: 'edit', applied: true }),
      msg({ role: 'user', content: 'add a fill' }),
      msg({ role: 'assistant', content: largeSong, replyMode: 'edit', applied: true }),
    ], 'next');
    expect(note.match(/- add a fill/g)).toHaveLength(1);
  });

  it('returns no earlier-requests note without prior Edit turns', () => {
    expect(earlierEditRequestsNote([msg({ role: 'user', content: 'add drums' })], 'add drums')).toBe('');
  });

  it('does not stub short Ask replies', () => {
    const packed = packCopilotHistoryForModel([
      msg({ role: 'user', content: 'what is bpm?' }),
      msg({ role: 'assistant', content: 'bpm sets tempo.', replyMode: 'ask' }),
    ]);
    expect(packed[1].content).toBe('bpm sets tempo.');
  });

  it('drops oldest turns when packed history exceeds the token budget', () => {
    const bulky = 'n'.repeat(4000);
    const history = Array.from({ length: 8 }, (_, index) => msg({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: bulky,
      replyMode: 'ask',
    }));
    const packed = packCopilotHistoryForModel(history);
    expect(packed.length).toBe(2);
    expect(packed[0].content).toBe(bulky);
  });

  it('packs promptContent for machine-generated user turns', () => {
    const packed = packCopilotHistoryForModel([
      msg({
        role: 'user',
        content: '[validation] short transcript',
        promptContent: 'Please explain this error and suggest how to fix it:\n\n[validation] short transcript',
      }),
    ]);
    expect(packed[0].content).toContain('Please explain this error');
  });

  it('excludes the in-flight user turn when promptContent matches', () => {
    const packed = packHistoryExcludingCurrentUser([
      msg({
        role: 'user',
        content: '[validation] short transcript',
        promptContent: 'full model prompt',
      }),
    ], 'full model prompt');
    expect(packed).toEqual([]);
  });

  it('counts the sent prompt, not the short transcript, for context meter after auto-submit', () => {
    const split = splitContextBudgetMessages([
      msg({
        role: 'user',
        content: '[validation] short transcript',
        display: '[validation] short transcript',
        promptContent: 'Please explain this error and suggest how to fix it:\n\n[validation] short transcript',
      }),
      msg({ role: 'assistant', content: 'answer', replyMode: 'ask' }),
    ], '');
    expect(split.userText).toBe('Please explain this error and suggest how to fix it:\n\n[validation] short transcript');
  });

  it('attributes the last sent question to This message when the composer is empty', () => {
    const resolved = '[EDITOR REFERENCES]\nLines 1-4 of song.bax\n...\n\nand chip?';
    const split = splitContextBudgetMessages([
      msg({ role: 'user', content: 'what is bpm?' }),
      msg({ role: 'assistant', content: 'beats per minute', replyMode: 'ask' }),
      msg({ role: 'user', content: '[song.bax:1-4] and chip?', display: '[song.bax:1-4] and chip?', promptContent: resolved }),
      msg({ role: 'assistant', content: 'sound chip', replyMode: 'ask' }),
    ], '');
    expect(split.userText).toBe(resolved);
    expect(split.historyTexts).toEqual(['what is bpm?', 'beats per minute', 'sound chip']);
  });

  it('counts Edit-mode history as sent: earlier Edit turns become the requests note', () => {
    const split = splitContextBudgetMessages([
      msg({ role: 'user', content: 'add drums' }),
      msg({ role: 'assistant', content: largeSong, replyMode: 'edit', applied: true }),
    ], 'now quieter', undefined, { omitEditTurns: true });
    expect(split.historyTexts).toHaveLength(1);
    expect(split.historyTexts[0]).toContain('- add drums');
    expect(split.historyTexts[0]).not.toContain('[Previous Edit]');
  });

  it('uses the composer draft as This message and keeps prior turns in Chat', () => {
    const split = splitContextBudgetMessages([
      msg({ role: 'user', content: 'what is bpm?' }),
      msg({ role: 'assistant', content: 'beats per minute', replyMode: 'ask' }),
    ], 'now louder');
    expect(split.userText).toBe('now louder');
    expect(split.historyTexts).toEqual(['what is bpm?', 'beats per minute']);
  });

  it('excludes the in-flight user turn when it is already in history', () => {
    const packed = packHistoryExcludingCurrentUser([
      msg({ role: 'user', content: 'older' }),
      msg({ role: 'assistant', content: 'ok', replyMode: 'ask' }),
      msg({ role: 'user', content: 'current' }),
    ], 'current');
    expect(packed.map((message) => message.content)).toEqual(['older', 'ok']);
  });

  it('builds a stub from change summary and line counts', () => {
    const stub = stubEditAssistantContent(msg({
      role: 'assistant',
      content: song,
      changeSummary: ['Updated `drums`'],
      linesAdded: 2,
      linesRemoved: 1,
    }));
    expect(stub).toContain('Updated `drums`');
    expect(stub).toContain('+2');
  });
});
