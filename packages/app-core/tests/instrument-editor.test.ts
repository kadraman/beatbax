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
import { uniqueInstName, splitTrailingComment, collectLocalInstNames, insertInstLine, deleteInstLine, renameInstrumentInSource, instIsReferenced } from '../src/editor/instrument-editor-writeback';
import { fieldApplies, fallbackInstrumentEditor } from '../src/editor/instrument-editor-schema';

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
});
