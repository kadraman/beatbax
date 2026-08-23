import {
  buildUserMessageWithReferences,
  createCopilotEditorReference,
  formatCopilotReferenceLabel,
  resolveCopilotReferences,
} from '../src/renderer/src/lib/copilot-selection-prompt';

describe('createCopilotEditorReference', () => {
  it('builds a preview from the first non-empty referenced line', () => {
    const ref = createCopilotEditorReference({
      text: 'inst arp_gb type=wave wave=[8,9,10] gm=82',
      startLine: 143,
      endLine: 143,
    });

    expect(ref.startLine).toBe(143);
    expect(ref.endLine).toBe(143);
    expect(ref.preview).toContain('inst arp_gb');
    expect(formatCopilotReferenceLabel(ref)).toBe('Line 143');
  });
});

describe('resolveCopilotReferences', () => {
  it('reads the current editor source for the referenced line range', () => {
    const ref = createCopilotEditorReference({
      text: 'inst arp_gb type=wave volume=50',
      startLine: 2,
      endLine: 2,
    });
    const source = [
      'chip gameboy',
      'inst arp_gb type=wave volume=25 gm=82',
      'play',
    ].join('\n');

    expect(resolveCopilotReferences([ref], source)).toEqual([
      'inst arp_gb type=wave volume=25 gm=82',
    ]);
  });
});

describe('buildUserMessageWithReferences', () => {
  it('resolves references at send time and appends the user question after them', () => {
    const ref = createCopilotEditorReference({
      text: 'inst arp_gb type=wave volume=50',
      startLine: 1,
      endLine: 1,
    });
    const source = 'inst arp_gb type=wave volume=25 gm=82\nplay';

    expect(buildUserMessageWithReferences(
      'How do I make this quieter?',
      [ref],
      source,
    )).toBe([
      '[Referenced editor Line 1]',
      '```bax',
      'inst arp_gb type=wave volume=25 gm=82',
      '```',
      '',
      'How do I make this quieter?',
    ].join('\n'));
  });

  it('allows sending references without extra user text', () => {
    const ref = createCopilotEditorReference({
      text: 'inst lead type=pulse1',
      startLine: 10,
      endLine: 10,
    });

    expect(buildUserMessageWithReferences('', [ref], 'inst lead type=pulse1')).toContain('[Referenced editor Line 10]');
  });
});
