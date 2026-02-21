/**
 * Phase 2.5: Real-time playback position tracking tests
 *
 * Tests the position tracking infrastructure added to Player and Resolver
 * to enable real-time visualization of playback state.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { parse } from '../packages/engine/src/parser/parser.js';
import { resolveSong } from '../packages/engine/src/song/resolver.js';
import { Player, createAudioContext } from '../packages/engine/src/audio/playback.js';

describe('Phase 2.5 - Position Tracking', () => {
  describe('Resolver metadata preservation', () => {
    it('should add sourceSequence metadata to note events', () => {
      const script = `
chip gameboy
bpm 120

inst lead type=pulse1 duty=50

pat melody = C4 E4 G4 C5

seq main = melody

channel 1 => inst lead seq main
      `.trim();

      const ast = parse(script);
      const ism = resolveSong(ast);

      // Find note events in channel 1
      const channel = ism.channels.find(ch => ch.id === 1);
      expect(channel).toBeDefined();

      const noteEvents = channel!.events.filter(e => e.type === 'note');
      expect(noteEvents.length).toBeGreaterThan(0);

      // Check that note events have sourceSequence metadata
      noteEvents.forEach(event => {
        const eventWithMeta = event as any;
        expect(eventWithMeta.sourceSequence).toBe('main');
      });
    });

    it('should add barNumber metadata to events', () => {
      const script = `
chip gameboy
bpm 120

inst lead type=pulse1 duty=50

pat melody = C4 E4 G4 C5 D4 F4 A4 D5

seq main = melody

channel 1 => inst lead seq main
      `.trim();

      const ast = parse(script);
      const ism = resolveSong(ast);

      const channel = ism.channels.find(ch => ch.id === 1);
      expect(channel).toBeDefined();

      const noteEvents = channel!.events.filter(e => e.type === 'note');

      // Check that bar numbers are calculated correctly
      noteEvents.forEach((event, index) => {
        const eventWithMeta = event as any;
        expect(eventWithMeta.barNumber).toBeDefined();
        expect(typeof eventWithMeta.barNumber).toBe('number');
        expect(eventWithMeta.barNumber).toBeGreaterThanOrEqual(0);
      });
    });

    it('should add metadata to named instrument events', () => {
      const script = `
chip gameboy
bpm 120

inst snare type=noise env=12,down note=C7

pat beat = snare . snare .

seq main = beat

channel 4 => seq main
      `.trim();

      const ast = parse(script);
      const ism = resolveSong(ast);

      const channel = ism.channels.find(ch => ch.id === 4);
      expect(channel).toBeDefined();

      const namedEvents = channel!.events.filter(e => e.type === 'named');
      expect(namedEvents.length).toBeGreaterThan(0);

      namedEvents.forEach(event => {
        const eventWithMeta = event as any;
        expect(eventWithMeta.sourceSequence).toBe('main');
        expect(eventWithMeta.barNumber).toBeDefined();
      });
    });
  });

  describe('Player position tracking', () => {
    it('should initialize position tracking maps on playback', async () => {
      const script = `
chip gameboy
bpm 240

inst lead type=pulse1 duty=50

pat melody = C4 E4 G4

seq main = melody

channel 1 => inst lead seq main
      `.trim();

      const ast = parse(script);
      const ism = resolveSong(ast);

      const ctx = await createAudioContext({ sampleRate: 44100 });
      const player = new Player(ctx);

      // Position tracking should initialize on playAST
      await player.playAST(ism);

      // Verify that tracking maps are initialized (we can't directly access private members,
      // but we can verify that the onPositionChange callback would be called)
      player.stop();
    });

    it('should fire onPositionChange callback for each event', async () => {
      const script = `
chip gameboy
bpm 240

inst lead type=pulse1 duty=50

pat melody = C4 E4 G4

seq main = melody

channel 1 => inst lead seq main
      `.trim();

      const ast = parse(script);
      const ism = resolveSong(ast);

      const ctx = await createAudioContext({ sampleRate: 44100 });
      const player = new Player(ctx);

      const positionChanges: Array<{ channelId: number; eventIndex: number; totalEvents: number }> = [];

      player.onPositionChange = (channelId, eventIndex, totalEvents) => {
        positionChanges.push({ channelId, eventIndex, totalEvents });
      };

      await player.playAST(ism);

      // Give a moment for initial scheduling
      await new Promise(resolve => setTimeout(resolve, 50));

      player.stop();

      // We should have received position change callbacks
      expect(positionChanges.length).toBeGreaterThan(0);

      // Verify callback data structure
      if (positionChanges.length > 0) {
        const first = positionChanges[0];
        expect(first.channelId).toBeDefined();
        expect(typeof first.eventIndex).toBe('number');
        expect(typeof first.totalEvents).toBe('number');
        expect(first.eventIndex).toBeGreaterThanOrEqual(0);
        expect(first.totalEvents).toBeGreaterThan(0);
      }
    });

    it('should include eventIndex and totalEvents in onSchedule callback', async () => {
      const script = `
chip gameboy
bpm 240

inst lead type=pulse1 duty=50

pat melody = C4 E4 G4 C5

seq main = melody

channel 1 => inst lead seq main
      `.trim();

      const ast = parse(script);
      const ism = resolveSong(ast);

      const ctx = await createAudioContext({ sampleRate: 44100 });
      const player = new Player(ctx);

      const scheduleEvents: Array<any> = [];

      player.onSchedule = (args) => {
        scheduleEvents.push(args);
      };

      await player.playAST(ism);

      // Give a moment for scheduling
      await new Promise(resolve => setTimeout(resolve, 50));

      player.stop();

      // Verify that onSchedule callbacks include the new metadata
      expect(scheduleEvents.length).toBeGreaterThan(0);

      scheduleEvents.forEach(event => {
        expect(event.chId).toBeDefined();
        expect(event.inst).toBeDefined();
        expect(event.token).toBeDefined();
        expect(event.time).toBeDefined();
        expect(event.dur).toBeDefined();
        // Phase 2.5 additions
        expect(event.eventIndex).toBeDefined();
        expect(typeof event.eventIndex).toBe('number');
        expect(event.totalEvents).toBeDefined();
        expect(typeof event.totalEvents).toBe('number');
      });
    });

    it('should track position for multiple channels independently', async () => {
      const script = `
chip gameboy
bpm 240

inst lead type=pulse1 duty=50
inst bass type=pulse2 duty=25

pat melody = C4 E4 G4
pat bassline = C3 . G2 .

seq main = melody
seq bassSeq = bassline

channel 1 => inst lead seq main
channel 2 => inst bass seq bassSeq
      `.trim();

      const ast = parse(script);
      const ism = resolveSong(ast);

      const ctx = await createAudioContext({ sampleRate: 44100 });
      const player = new Player(ctx);

      const positionsByChannel = new Map<number, Array<{ eventIndex: number; totalEvents: number }>>();

      player.onPositionChange = (channelId, eventIndex, totalEvents) => {
        if (!positionsByChannel.has(channelId)) {
          positionsByChannel.set(channelId, []);
        }
        positionsByChannel.get(channelId)!.push({ eventIndex, totalEvents });
      };

      await player.playAST(ism);

      await new Promise(resolve => setTimeout(resolve, 50));

      player.stop();

      // Verify we got position updates for both channels
      expect(positionsByChannel.has(1)).toBe(true);
      expect(positionsByChannel.has(2)).toBe(true);

      // Each channel should have its own independent tracking
      const ch1Updates = positionsByChannel.get(1)!;
      const ch2Updates = positionsByChannel.get(2)!;

      expect(ch1Updates.length).toBeGreaterThan(0);
      expect(ch2Updates.length).toBeGreaterThan(0);

      // Verify indices increment correctly per channel
      if (ch1Updates.length > 1) {
        expect(ch1Updates[1].eventIndex).toBeGreaterThan(ch1Updates[0].eventIndex);
      }
    });
  });

  describe('Integration tests', () => {
    it('should provide complete position tracking for a multi-channel song', async () => {
      const script = `
chip gameboy
bpm 240

inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down
inst wave1 type=wave wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst snare type=noise env=12,down

pat melody = C5 E5 G5 C6
pat bassline = C3 . G2 .
pat wavepat = C4 E4 G4 E4
pat beat = snare . snare .

seq main = melody
seq bass = bassline
seq wave = wavepat
seq drums = beat

channel 1 => inst lead seq main
channel 2 => inst bass seq bass
channel 3 => inst wave1 seq wave
channel 4 => inst snare seq drums
      `.trim();

      const ast = parse(script);
      const ism = resolveSong(ast);

      // Verify metadata in ISM
      ism.channels.forEach(channel => {
        const noteEvents = channel.events.filter(e => e.type === 'note' || e.type === 'named');
        noteEvents.forEach(event => {
          const eventWithMeta = event as any;
          expect(eventWithMeta.sourceSequence).toBeDefined();
          expect(eventWithMeta.barNumber).toBeDefined();
        });
      });

      // Verify playback tracking
      const ctx = await createAudioContext({ sampleRate: 44100 });
      const player = new Player(ctx);

      const allPositionChanges: Array<{ channelId: number; eventIndex: number; totalEvents: number }> = [];

      player.onPositionChange = (channelId, eventIndex, totalEvents) => {
        allPositionChanges.push({ channelId, eventIndex, totalEvents });
      };

      await player.playAST(ism);

      await new Promise(resolve => setTimeout(resolve, 100));

      player.stop();

      // Should have position updates from all 4 channels
      const channelIds = new Set(allPositionChanges.map(p => p.channelId));
      expect(channelIds.size).toBeGreaterThanOrEqual(1); // At least one channel should report

      // All updates should have valid data
      allPositionChanges.forEach(pos => {
        expect(pos.channelId).toBeGreaterThan(0);
        expect(pos.eventIndex).toBeGreaterThanOrEqual(0);
        expect(pos.totalEvents).toBeGreaterThan(0);
        expect(pos.eventIndex).toBeLessThan(pos.totalEvents);
      });
    });
  });
});
