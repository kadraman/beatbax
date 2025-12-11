import * as midi from '../src/export/midiExport';

describe('MIDI export (smoke)', () => {
  test('exportMIDI exists', () => {
    expect(typeof midi.exportMIDI === 'function').toBeTruthy();
  });
});
