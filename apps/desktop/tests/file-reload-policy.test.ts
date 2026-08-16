import {
  decideFileReload,
  editorTextEqualsDisk,
  normalizeFileReloadPolicy,
} from '../src/shared/file-reload-policy';

describe('decideFileReload', () => {
  it('ignores when policy is off', () => {
    expect(decideFileReload('off', false)).toBe('ignore');
    expect(decideFileReload('off', true)).toBe('ignore');
  });

  it('always applies when policy is alwaysReload', () => {
    expect(decideFileReload('alwaysReload', false)).toBe('apply');
    expect(decideFileReload('alwaysReload', true)).toBe('apply');
  });

  it('always prompts when policy is alwaysAsk', () => {
    expect(decideFileReload('alwaysAsk', false)).toBe('prompt');
    expect(decideFileReload('alwaysAsk', true)).toBe('prompt');
  });

  it('applies when unmodified and prompts when dirty for the default policy', () => {
    expect(decideFileReload('reloadIfUnmodified', false)).toBe('apply');
    expect(decideFileReload('reloadIfUnmodified', true)).toBe('prompt');
  });

  it('falls back to reloadIfUnmodified for unknown values', () => {
    expect(normalizeFileReloadPolicy('nope')).toBe('reloadIfUnmodified');
    expect(decideFileReload('nope', false)).toBe('apply');
    expect(decideFileReload('nope', true)).toBe('prompt');
  });
});

describe('editorTextEqualsDisk', () => {
  it('treats CRLF and LF as the same song text', () => {
    expect(editorTextEqualsDisk('chip gameboy\r\nplay', 'chip gameboy\nplay')).toBe(true);
    expect(editorTextEqualsDisk('chip gameboy\nplay', 'chip gameboy\nplay\n// extra')).toBe(false);
  });
});
