import * as midi from '../src/export/midiExport';

describe('MIDI program change (smoke)', () => {
  test('midi export module exposes exportMIDI', () => {
    expect(typeof midi.exportMIDI === 'function').toBeTruthy();
  });
});
