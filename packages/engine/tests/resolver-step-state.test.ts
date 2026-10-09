/**
 * Pattern-boundary seek/loop (spec 014) plays a slice of the resolved ISM.
 * That is only safe while every resolved note carries its own instrument state,
 * so directives before the slice start are not needed at playback time.
 */

import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';

describe('resolved note events carry instrument state per step', () => {
  const src = `chip gameboy
bpm 120
inst lead type=pulse1 duty=50 env=12,down
inst alt type=pulse1 duty=25 env=10,down
pat a = C4 E4 G4 C5
pat b = inst(alt) D4 . F4 A4
seq main = a b a
channel 1 => inst lead seq main
play`;

  it('stamps instrument name and properties on every note, including after inline inst', () => {
    const song: any = resolveSong(parse(src) as any);
    const events: any[] = song.channels[0].events;
    expect(events).toHaveLength(12);

    const notes = events.filter((ev) => ev.type === 'note');
    expect(notes).toHaveLength(11);
    for (const ev of notes) {
      expect(typeof ev.instrument).toBe('string');
      expect(ev.instProps).toBeTruthy();
    }

    expect(events[0]).toMatchObject({ instrument: 'lead', sourcePattern: 'a' });
    expect(events[4]).toMatchObject({ instrument: 'alt', sourcePattern: 'b' });
    expect(String(events[4].instProps.duty)).toBe('25');
    // inline `inst(alt)` persists into the following pattern
    expect(events[8]).toMatchObject({ instrument: 'alt', sourcePattern: 'a' });
  });
});
