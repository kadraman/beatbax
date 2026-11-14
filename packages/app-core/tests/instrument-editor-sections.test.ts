import type { ChipInstrumentEditor } from '@beatbax/engine/chips';
import { listInstrumentEditorSections } from '../src/editor/instrument-editor-schema';

function schema(partial: Partial<ChipInstrumentEditor> = {}): ChipInstrumentEditor {
  return {
    types: [{ id: 'pulse1', label: 'Pulse', previewChannel: 1 }],
    fields: [],
    macros: [],
    presets: [],
    ...partial,
  };
}

describe('listInstrumentEditorSections', () => {
  it('returns no pages when no instrument is selected', () => {
    expect(listInstrumentEditorSections({
      schema: schema({
        fields: [{ name: 'subpat', label: 'Subpattern', widget: 'text' }],
      }),
      type: 'pulse1',
      hasInstrument: false,
    })).toEqual([]);
  });

  it('lists built-in pages and omits empty ones', () => {
    const sections = listInstrumentEditorSections({
      schema: schema({
        fields: [
          { name: 'subpat', label: 'Subpattern', widget: 'text' },
          { name: 'env', label: 'Envelope', widget: 'envelope', max: 7 },
          { name: 'note', label: 'Note', widget: 'note' },
        ],
        macros: [{ name: 'vol_env', label: 'Volume', min: 0, max: 15, whenType: 'pulse1' }],
        waveform: { field: 'wave', length: 32, min: 0, max: 15, whenType: 'wave' },
      }),
      type: 'pulse1',
      hasInstrument: true,
    });

    expect(sections.map((section) => section.id)).toEqual([
      'properties',
      'hardware',
      'macros',
      'subpattern',
    ]);
  });

  it('adds optional nav pages after the built-in pages', () => {
    const sections = listInstrumentEditorSections({
      schema: schema({
        fields: [
          { name: 'custom', label: 'Custom', widget: 'int', nav: 'Extras' },
        ],
        macros: [
          { name: 'vol_env', label: 'Volume', min: 0, max: 15 },
          { name: 'arp_env', label: 'Arp', min: -12, max: 12, nav: 'Extras' },
          { name: 'pitch_env', label: 'Pitch', min: -12, max: 12, nav: 'More', whenType: 'noise' },
        ],
      }),
      type: 'pulse1',
      hasInstrument: true,
    });

    expect(sections.map((section) => section.label)).toEqual([
      'Macros',
      'Extras',
    ]);
    expect(sections.find((section) => section.id === 'More')).toBeUndefined();
  });
});
