jest.mock('@beatbax/engine', () => ({
  serializeInstrument: (name: string) => `inst ${name}`,
}));

jest.mock('../src/utils/local-storage', () => ({
  StorageKey: {
    FEATURE_INSTRUMENT_EDITOR: 'feature.instrumentEditor',
    PANEL_VIS_INSTRUMENT_EDITOR: 'panel.instrument-editor',
  },
  storage: {
    get: (key: string) => {
      const val = window.localStorage.getItem(`beatbax:${key}`);
      return val === null ? undefined : val;
    },
    set: (key: string, val: string) => {
      window.localStorage.setItem(`beatbax:${key}`, val);
    },
    remove: (key: string) => {
      window.localStorage.removeItem(`beatbax:${key}`);
    },
  },
}));

import { getCapabilities } from '../src/client-profile';
import { FeatureFlag, setFeatureEnabled } from '../src/utils/feature-flags';
import { isInstrumentEditorAllowed, shouldShowInstrumentEditor } from '../src/utils/instrument-editor-panel';
import {
  uniqueInstName,
  splitTrailingComment,
  collectLocalInstNames,
  findInstLineIndex,
  findSubpatLineIndex,
  insertInstLine,
  deleteInstLine,
  duplicateInstLine,
  renameInstrumentInSource,
  instIsReferenced,
  isValidInstName,
} from '../src/editor/instrument-editor-writeback';
import {
  fieldApplies,
  fallbackInstrumentEditor,
  listBundledSampleRefs,
  listBundledSampleNames,
  parseInstrumentSampleRef,
  formatInstrumentSampleRef,
  sampleRemainderForSchemeChange,
} from '../src/editor/instrument-editor-schema';

const desktop = getCapabilities('desktop-full');

beforeEach(() => {
  localStorage.clear();
});

describe('instrument editor panel flag', () => {
  it('is off by default', () => {
    expect(isInstrumentEditorAllowed(desktop)).toBe(false);
    expect(shouldShowInstrumentEditor(desktop)).toBe(false);
  });

  it('is allowed on desktop when the experimental flag is on', () => {
    setFeatureEnabled(FeatureFlag.INSTRUMENT_EDITOR, true);
    expect(isInstrumentEditorAllowed(desktop)).toBe(true);
    expect(shouldShowInstrumentEditor(desktop)).toBe(true);
  });
});

describe('writeback helpers', () => {
  it('preserves trailing comments when splitting', () => {
    expect(splitTrailingComment('inst lead type=pulse1  # hook')).toEqual({
      code: 'inst lead type=pulse1',
      comment: '# hook',
    });
  });

  it('collects local inst names and unique names', () => {
    const src = 'chip gameboy\ninst lead type=pulse1\ninst bass type=wave\n';
    const names = collectLocalInstNames(src);
    expect([...names]).toEqual(['lead', 'bass']);
    expect(uniqueInstName('lead', names)).toBe('lead2');
  });

  it('inserts and deletes inst lines', () => {
    const src = 'chip gameboy\ninst lead type=pulse1\npat a = C4\n';
    const inserted = insertInstLine(src, 'inst bass type=wave', 'lead');
    expect(inserted).toBe('chip gameboy\ninst lead type=pulse1\ninst bass type=wave\npat a = C4\n');
    expect(deleteInstLine(inserted, 'bass')).toBe('chip gameboy\ninst lead type=pulse1\npat a = C4\n');
  });

  it('inserts after the last inst when no anchor is given', () => {
    const src = 'chip gameboy\ninst lead type=pulse1\ninst bass type=wave\npat a = C4\n';
    const inserted = insertInstLine(src, 'inst hat type=noise');
    expect(inserted).toBe(
      'chip gameboy\ninst lead type=pulse1\ninst bass type=wave\ninst hat type=noise\npat a = C4\n',
    );
  });

  it('duplicates the persisted definition, not an alternate body', () => {
    const src = [
      'chip gameboy',
      'inst lead type=pulse1 duty=50 env=12,down  # keep',
      'pat a = C4',
      '',
    ].join('\n');
    const { next, newName, body, ok } = duplicateInstLine(src, 'lead');
    expect(ok).toBe(true);
    expect(newName).toBe('lead2');
    expect(body).toBe('type=pulse1 duty=50 env=12,down');
    expect(next).toBe([
      'chip gameboy',
      'inst lead type=pulse1 duty=50 env=12,down  # keep',
      'inst lead2 type=pulse1 duty=50 env=12,down',
      'pat a = C4',
      '',
    ].join('\n'));
  });

  it('handles identifiers that end with a hyphen', () => {
    const src = [
      'chip gameboy',
      'inst lead- type=pulse1 duty=50',
      'channel 1 => inst lead- seq main',
      'pat a = inst(lead-) C4 . lead-',
      '',
    ].join('\n');
    expect([...collectLocalInstNames(src)]).toEqual(['lead-']);
    expect(findInstLineIndex(src, 'lead-')).toBe(1);
    expect(findInstLineIndex(src, 'lead')).toBe(-1);
    expect(instIsReferenced(src, 'lead-')).toBe(true);
    // Each reference form must trip the delete warning (IdentChar lookarounds, not `\b`).
    expect(instIsReferenced([
      'chip gameboy',
      'inst lead- type=pulse1',
      'channel 1 => inst lead- seq main',
      '',
    ].join('\n'), 'lead-')).toBe(true);
    expect(instIsReferenced([
      'chip gameboy',
      'inst lead- type=pulse1',
      'pat a = inst(lead-) C4',
      '',
    ].join('\n'), 'lead-')).toBe(true);
    expect(instIsReferenced([
      'chip gameboy',
      'inst lead- type=pulse1',
      'pat a = C4 . lead- . C4',
      '',
    ].join('\n'), 'lead-')).toBe(true);
    expect(instIsReferenced([
      'chip gameboy',
      'inst lead- type=pulse1',
      'pat a = C4',
      '',
    ].join('\n'), 'lead-')).toBe(false);

    const dup = duplicateInstLine(src, 'lead-');
    expect(dup.ok).toBe(true);
    expect(dup.newName).toBe('lead-2');
    expect(dup.next).toContain('inst lead-2 type=pulse1 duty=50');

    const renamed = renameInstrumentInSource(src, 'lead-', 'pluck-', { updateReferences: true });
    expect(renamed.ok).toBe(true);
    expect(renamed.next).toBe([
      'chip gameboy',
      'inst pluck- type=pulse1 duty=50',
      'channel 1 => inst pluck- seq main',
      'pat a = inst(pluck-) C4 . pluck-',
      '',
    ].join('\n'));

    expect(deleteInstLine(src, 'lead-')).toBe([
      'chip gameboy',
      'channel 1 => inst lead- seq main',
      'pat a = inst(lead-) C4 . lead-',
      '',
    ].join('\n'));
  });

  it('accepts Peggy Identifier names and rejects digit / hyphen prefixes', () => {
    expect(isValidInstName('lead')).toBe(true);
    expect(isValidInstName('_kick')).toBe(true);
    expect(isValidInstName('lead2')).toBe(true);
    expect(isValidInstName('hi-hat')).toBe(true);
    expect(isValidInstName('0lead')).toBe(false);
    expect(isValidInstName('-lead')).toBe(false);
    expect(isValidInstName('')).toBe(false);

    const src = 'chip gameboy\ninst lead type=pulse1\n';
    expect(renameInstrumentInSource(src, 'lead', '0lead').ok).toBe(false);
    expect(renameInstrumentInSource(src, 'lead', '-lead').ok).toBe(false);
  });

  it('renames the definition and optional channel / inline references', () => {
    const src = [
      'chip gameboy',
      'inst lead type=pulse1',
      'inst bass type=wave',
      'channel 1 => inst lead seq main',
      'pat a = inst(lead) C4 . lead',
      '',
    ].join('\n');
    const defOnly = renameInstrumentInSource(src, 'lead', 'pluck', { updateReferences: false });
    expect(defOnly.ok).toBe(true);
    expect(defOnly.next).toContain('inst pluck type=pulse1');
    expect(defOnly.next).toContain('channel 1 => inst lead seq main');
    expect(defOnly.next).toContain('inst(lead)');

    const withRefs = renameInstrumentInSource(src, 'lead', 'pluck', { updateReferences: true });
    expect(withRefs.ok).toBe(true);
    expect(withRefs.next).toBe([
      'chip gameboy',
      'inst pluck type=pulse1',
      'inst bass type=wave',
      'channel 1 => inst pluck seq main',
      'pat a = inst(pluck) C4 . pluck',
      '',
    ].join('\n'));
  });

  it('does not rewrite instrument names inside comments when updating references', () => {
    const src = [
      'chip gameboy',
      'inst lead type=pulse1  # was lead',
      '# prefer lead for melody',
      'channel 1 => inst lead seq main  # lead solo',
      'pat a = inst(lead) C4',
      '',
    ].join('\n');
    const { next, ok } = renameInstrumentInSource(src, 'lead', 'pluck', { updateReferences: true });
    expect(ok).toBe(true);
    expect(next).toBe([
      'chip gameboy',
      'inst pluck type=pulse1 # was lead',
      '# prefer lead for melody',
      'channel 1 => inst pluck seq main # lead solo',
      'pat a = inst(pluck) C4',
      '',
    ].join('\n'));
  });

  it('detects channel, inline, and bare hit-token references', () => {
    const base = [
      'chip gameboy',
      'inst lead type=pulse1',
      'inst snare type=noise',
      '',
    ].join('\n');
    expect(instIsReferenced(base, 'lead')).toBe(false);
    expect(instIsReferenced(`${base}channel 1 => inst lead seq main\n`, 'lead')).toBe(true);
    expect(instIsReferenced(`${base}pat a = inst(lead) C4\n`, 'lead')).toBe(true);
    expect(instIsReferenced(`${base}pat drums = kick . snare . kick\n`, 'snare')).toBe(true);
    expect(instIsReferenced(`${base}# snare fills\npat a = C4\n`, 'snare')).toBe(false);
    expect(instIsReferenced(`${base}pat a = C4  # snare later\n`, 'snare')).toBe(false);
    expect(instIsReferenced(`${base}subpat lead = . halt\n`, 'lead')).toBe(false);
    expect(instIsReferenced(`${base}inst kit type=noise subpat=lead\n`, 'lead')).toBe(false);
    expect(instIsReferenced(`${base}seq lead = melody\n`, 'lead')).toBe(false);
  });

  it('does not rename subpat declarations or subpat= links when updating references', () => {
    const src = [
      'chip gameboy',
      'subpat lead = . -10 halt',
      'inst lead type=pulse1 duty=50 subpat=lead',
      'inst kit type=noise subpat=lead',
      'channel 1 => inst lead seq main',
      'pat a = inst(lead) C4 . lead',
      'seq main = verse:inst(lead)',
      '',
    ].join('\n');
    const { next, ok } = renameInstrumentInSource(src, 'lead', 'pluck', { updateReferences: true });
    expect(ok).toBe(true);
    expect(next).toBe([
      'chip gameboy',
      'subpat lead = . -10 halt',
      'inst pluck type=pulse1 duty=50 subpat=lead',
      'inst kit type=noise subpat=lead',
      'channel 1 => inst pluck seq main',
      'pat a = inst(pluck) C4 . pluck',
      'seq main = verse:inst(pluck)',
      '',
    ].join('\n'));
  });

  it('does not rewrite quoted values or pat/seq declaration names', () => {
    const src = [
      'chip nes',
      'inst lead type=dmc dmc_sample="local:lead/kick.dmc"',
      'pat lead = inst(lead) C4',
      'seq lead = lead',
      'song title "lead"',
      '',
    ].join('\n');
    const { next, ok } = renameInstrumentInSource(src, 'lead', 'pluck', { updateReferences: true });
    expect(ok).toBe(true);
    expect(next).toBe([
      'chip nes',
      'inst pluck type=dmc dmc_sample="local:lead/kick.dmc"',
      'pat lead = inst(pluck) C4',
      'seq lead = lead',
      'song title "lead"',
      '',
    ].join('\n'));
  });

  it('finds subpat definition lines by name', () => {
    const src = [
      'chip gameboy',
      'subpat kick_body = . -10 halt',
      'inst kick type=noise subpat=kick_body',
      'subpat kick = . halt',
      '',
    ].join('\n');
    expect(findSubpatLineIndex(src, 'kick_body')).toBe(1);
    expect(findSubpatLineIndex(src, 'kick')).toBe(3);
    expect(findSubpatLineIndex(src, 'missing')).toBe(-1);
    expect(findSubpatLineIndex(src, '')).toBe(-1);
    // Must not match a longer IdentChar prefix (kick vs kick_body).
    expect(findSubpatLineIndex('subpat kick_body = . halt\n', 'kick')).toBe(-1);
    // Same identifier on `subpat` and `inst` must resolve to different lines.
    const shared = [
      'subpat kick_huge = . halt',
      'inst kick_huge type=noise subpat=kick_huge',
      '',
    ].join('\n');
    expect(findSubpatLineIndex(shared, 'kick_huge')).toBe(0);
    expect(findInstLineIndex(shared, 'kick_huge')).toBe(1);
  });
});

describe('schema fallback', () => {
  it('hides fields that do not match whenType', () => {
    expect(fieldApplies('wave', 'wave')).toBe(true);
    expect(fieldApplies(['pulse1', 'pulse2'], 'noise')).toBe(false);
  });

  it('derives types from CHIP_INSTRUMENT_META', () => {
    const schema = fallbackInstrumentEditor('gameboy');
    expect(schema.types.map((t) => t.id)).toEqual(['pulse1', 'pulse2', 'wave', 'noise']);
    expect(schema.macros.some((m) => m.name === 'vol_env')).toBe(true);
  });

  it('lists NES bundled sample refs as @nes/<name>', () => {
    const refs = listBundledSampleRefs('nes');
    expect(refs).toEqual(['@nes/bass_c2', '@nes/kick', '@nes/snare']);
    expect(listBundledSampleNames('nes')).toEqual(['bass_c2', 'kick', 'snare']);
    expect(listBundledSampleRefs('gameboy')).toEqual([]);
  });
});

describe('instrument sample ref scheme/value', () => {
  it('splits scheme prefixes from the stored remainder', () => {
    expect(parseInstrumentSampleRef('@nes/kick', 'nes')).toEqual({ scheme: 'bundled', remainder: 'kick' });
    expect(parseInstrumentSampleRef('local:samples/kick.dmc', 'nes')).toEqual({
      scheme: 'local',
      remainder: 'samples/kick.dmc',
    });
    expect(parseInstrumentSampleRef('local:My%20Samples/kick.dmc', 'nes')).toEqual({
      scheme: 'local',
      remainder: 'My Samples/kick.dmc',
    });
    expect(parseInstrumentSampleRef('https://example.com/kick.dmc', 'nes')).toEqual({
      scheme: 'https',
      remainder: 'example.com/kick.dmc',
    });
    expect(parseInstrumentSampleRef('github:user/repo/kick.dmc', 'nes')).toEqual({
      scheme: 'github',
      remainder: 'user/repo/kick.dmc',
    });
    expect(parseInstrumentSampleRef('', 'nes')).toEqual({ scheme: 'bundled', remainder: '' });
  });

  it('composes scheme + remainder without duplicating prefixes', () => {
    expect(formatInstrumentSampleRef('bundled', 'kick', 'nes')).toBe('@nes/kick');
    expect(formatInstrumentSampleRef('local', 'samples/kick.dmc', 'nes')).toBe('local:samples/kick.dmc');
    expect(formatInstrumentSampleRef('local', 'My Samples/kick.dmc', 'nes')).toBe(
      'local:My%20Samples/kick.dmc',
    );
    expect(parseInstrumentSampleRef('local:My%20Samples/kick.dmc', 'nes').remainder).toBe(
      'My Samples/kick.dmc',
    );
    expect(formatInstrumentSampleRef('https', 'https://example.com/kick.dmc', 'nes')).toBe(
      'https://example.com/kick.dmc',
    );
    expect(formatInstrumentSampleRef('github', 'github:user/repo/kick.dmc', 'nes')).toBe(
      'github:user/repo/kick.dmc',
    );
    expect(formatInstrumentSampleRef('local', '', 'nes')).toBe('');
  });

  it('clears bundled names when switching to a path/URL scheme', () => {
    expect(sampleRemainderForSchemeChange('bundled', 'local', 'kick', 'nes')).toBe('');
    expect(sampleRemainderForSchemeChange('local', 'https', 'samples/kick.dmc', 'nes')).toBe(
      'samples/kick.dmc',
    );
    expect(sampleRemainderForSchemeChange('local', 'bundled', 'kick', 'nes')).toBe('kick');
    expect(sampleRemainderForSchemeChange('local', 'bundled', 'samples/kick.dmc', 'nes')).toBe('');
  });
});
