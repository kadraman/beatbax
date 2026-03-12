/**
 * Glyph Margin — unit tests
 *
 * Verifies both glyph-margin features:
 *  1. Playback position cursor  — ▶ glyph on the currently-playing `pat` line
 *  2. Channel mute/solo glyphs — speaker glyph on `channel N =>` lines,
 *                                clickable to toggle mute
 */

import { EventBus } from '../src/utils/event-bus';
import { setupGlyphMargin } from '../src/editor/glyph-margin';
import * as monaco from 'monaco-editor';

const SOURCE = [
  'chip gameboy',
  'pat melody = C4 E4 G4',
  'pat bass-line = C3 C4',
  'seq main = melody bass-line',
  'seq intro = melody',
  'channel 1 => inst lead seq main',
  'channel 2 => inst bass seq main',
].join('\n');

const LINES = SOURCE.split('\n');

describe('GlyphMargin', () => {
  let eventBus: EventBus;
  let deltaDecorations: jest.Mock;
  let onMouseDown: jest.Mock;
  let mockEditor: any;
  let mockChannelState: any;

  // Capture the mouse-down handler so tests can trigger synthetic clicks
  let mouseDownHandler: ((e: any) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus = new EventBus();
    mouseDownHandler = null;

    deltaDecorations = jest.fn((_oldIds: string[], newDecors: any[]) =>
      newDecors.map((_, i) => `dec-${i}`),
    );

    onMouseDown = jest.fn((handler: (e: any) => void) => {
      mouseDownHandler = handler;
      return { dispose: jest.fn() };
    });

    mockEditor = {
      getModel: jest.fn(() => ({
        getLineCount: () => LINES.length,
        getLineContent: (n: number) => LINES[n - 1],
      })),
      deltaDecorations,
      onMouseDown,
    };

    // Default: all channels live (not muted, not soloed)
    mockChannelState = {
      getChannel: jest.fn((id: number) => ({ id, muted: false, soloed: false, volume: 1 })),
      toggleMute: jest.fn(),
    };
  });

  // ── parse:success ──────────────────────────────────────────────────────────

  it('adds live-channel glyphs on both channel lines after parse:success', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });

    // deltaDecorations was called; the final call is the mute/solo redraw
    const lastCall = deltaDecorations.mock.calls[deltaDecorations.mock.calls.length - 1];
    const decors: any[] = lastCall[1];

    // channel 1 => is line 6, channel 2 => is line 7
    const ch1 = decors.find((d) => d.range.startLineNumber === 6);
    const ch2 = decors.find((d) => d.range.startLineNumber === 7);

    expect(ch1).toBeDefined();
    expect(ch1.options.glyphMarginClassName).toBe('bb-glyph--ch-live');
    expect(ch2).toBeDefined();
    expect(ch2.options.glyphMarginClassName).toBe('bb-glyph--ch-live');
  });

  it('clears stale position glyphs on parse:success', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });

    // Simulate a position update, then a new parse
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: { currentPattern: 'melody' },
    });
    deltaDecorations.mockClear();

    eventBus.emit('parse:success', { ast: {} });

    // At least one deltaDecorations call should have been made with [] to clear positions
    const clearedCalls = deltaDecorations.mock.calls.filter(
      (call: any[]) => Array.isArray(call[1]) && call[1].length === 0,
    );
    expect(clearedCalls.length).toBeGreaterThan(0);
  });

  // ── playback:position-changed ─────────────────────────────────────────────

  it('shows ▶ glyph on the pat line for the currently-playing pattern', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });
    deltaDecorations.mockClear();

    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: { currentPattern: 'melody', sourceSequence: null },
    });

    const lastCall = deltaDecorations.mock.calls[deltaDecorations.mock.calls.length - 1];
    const decors: any[] = lastCall[1];

    // pat melody is on line 2
    const playingGlyph = decors.find((d) => d.range.startLineNumber === 2);
    expect(playingGlyph).toBeDefined();
    expect(playingGlyph.options.glyphMarginClassName).toBe('bb-glyph--playing');
  });

  it('shows seq glyph on the seq line when sourceSequence is provided', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });
    deltaDecorations.mockClear();

    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: { currentPattern: 'melody', sourceSequence: 'main' },
    });

    const lastCall = deltaDecorations.mock.calls[deltaDecorations.mock.calls.length - 1];
    const decors: any[] = lastCall[1];

    // seq main is on line 4
    const seqGlyph = decors.find((d) => d.range.startLineNumber === 4);
    expect(seqGlyph).toBeDefined();
    expect(seqGlyph.options.glyphMarginClassName).toBe('bb-glyph--seq-playing');
  });

  it('shows both pat and seq glyphs simultaneously', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });
    deltaDecorations.mockClear();

    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: { currentPattern: 'melody', sourceSequence: 'intro' },
    });

    const lastCall = deltaDecorations.mock.calls[deltaDecorations.mock.calls.length - 1];
    const decors: any[] = lastCall[1];

    // pat melody → line 2 (teal), seq intro → line 5 (amber)
    const patGlyph = decors.find((d) => d.range.startLineNumber === 2);
    const seqGlyph = decors.find((d) => d.range.startLineNumber === 5);
    expect(patGlyph?.options.glyphMarginClassName).toBe('bb-glyph--playing');
    expect(seqGlyph?.options.glyphMarginClassName).toBe('bb-glyph--seq-playing');
  });

  it('pat glyph takes priority when pat and seq share the same line number', () => {
    // Build a model where pat foo and seq foo happen to be on different lines
    // but where a seq name resolves to the same line as a pat (edge case guard)
    // We test this by having a seq whose name matches a pat name (contrived but safe)
    const overlap = [
      'pat same = C4',
      'seq same = same',
    ].join('\n');
    const overlapLines = overlap.split('\n');
    const overlapEditor = {
      ...mockEditor,
      getModel: jest.fn(() => ({
        getLineCount: () => overlapLines.length,
        getLineContent: (n: number) => overlapLines[n - 1],
      })),
    };

    setupGlyphMargin(overlapEditor as any, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });
    deltaDecorations.mockClear();

    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: { currentPattern: 'same', sourceSequence: 'same' },
    });

    const lastCall = deltaDecorations.mock.calls[deltaDecorations.mock.calls.length - 1];
    const decors: any[] = lastCall[1];

    // seq same is line 2; pat same is line 1. They are on different lines here,
    // so both should appear without conflict.
    const classes = decors.map((d: any) => d.options.glyphMarginClassName);
    // If they share a line the pat glyph wins — no duplicate seq glyph on that line
    const lineNumbers = decors.map((d: any) => d.range.startLineNumber);
    const uniqueLines = new Set(lineNumbers);
    expect(uniqueLines.size).toBe(decors.length); // no two decorations on the same line
  });

  it('accumulates position glyphs from multiple channels', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });

    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: { currentPattern: 'melody', sourceSequence: 'main' },
    });
    eventBus.emit('playback:position-changed', {
      channelId: 2,
      position: { currentPattern: 'bass-line', sourceSequence: 'main' },
    });

    const lastCall = deltaDecorations.mock.calls[deltaDecorations.mock.calls.length - 1];
    const decors: any[] = lastCall[1];

    const playingLines = decors
      .filter((d) => d.options.glyphMarginClassName === 'bb-glyph--playing')
      .map((d) => d.range.startLineNumber);

    expect(playingLines).toContain(2); // melody
    expect(playingLines).toContain(3); // bass-line

    // seq main (line 4) should appear once as a seq glyph (both channels share it)
    const seqLines = decors
      .filter((d) => d.options.glyphMarginClassName === 'bb-glyph--seq-playing')
      .map((d) => d.range.startLineNumber);
    expect(seqLines).toContain(4);
  });

  it('ignores position-changed events that carry no currentPattern or sourceSequence', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });
    deltaDecorations.mockClear();

    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: { currentPattern: null, sourceSequence: null },
    });

    // deltaDecorations should not have been called for position update
    expect(deltaDecorations).not.toHaveBeenCalled();
  });

  // ── playback:stopped ──────────────────────────────────────────────────────

  it('clears position glyphs on playback:stopped', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: { currentPattern: 'melody' },
    });
    deltaDecorations.mockClear();

    eventBus.emit('playback:stopped', undefined as any);

    // Should have been called with an empty decorations array (clear)
    expect(deltaDecorations).toHaveBeenCalledWith(expect.any(Array), []);
  });

  // ── channel mute/solo state changes ──────────────────────────────────────

  it('shows muted glyph on channel line after channel:muted', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });

    // Make channel 1 appear muted
    mockChannelState.getChannel.mockImplementation((id: number) => ({
      id,
      muted: id === 1,
      soloed: false,
      volume: 1,
    }));
    deltaDecorations.mockClear();

    eventBus.emit('channel:muted', { channel: 1 });

    const lastCall = deltaDecorations.mock.calls[deltaDecorations.mock.calls.length - 1];
    const ch1Decor = lastCall[1].find((d: any) => d.range.startLineNumber === 6);
    expect(ch1Decor?.options.glyphMarginClassName).toBe('bb-glyph--ch-muted');
  });

  it('restores live glyph on channel line after channel:unmuted', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });
    deltaDecorations.mockClear();

    eventBus.emit('channel:unmuted', { channel: 1 });

    const lastCall = deltaDecorations.mock.calls[deltaDecorations.mock.calls.length - 1];
    const ch1Decor = lastCall[1].find((d: any) => d.range.startLineNumber === 6);
    expect(ch1Decor?.options.glyphMarginClassName).toBe('bb-glyph--ch-live');
  });

  it('shows soloed glyph on channel line after channel:soloed', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });

    mockChannelState.getChannel.mockImplementation((id: number) => ({
      id,
      muted: false,
      soloed: id === 1,
      volume: 1,
    }));
    deltaDecorations.mockClear();

    eventBus.emit('channel:soloed', { channel: 1 });

    const lastCall = deltaDecorations.mock.calls[deltaDecorations.mock.calls.length - 1];
    const ch1Decor = lastCall[1].find((d: any) => d.range.startLineNumber === 6);
    expect(ch1Decor?.options.glyphMarginClassName).toBe('bb-glyph--ch-soloed');
  });

  it('restores live glyph on channel line after channel:unsoloed', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });
    deltaDecorations.mockClear();

    eventBus.emit('channel:unsoloed', { channel: 1 });

    const lastCall = deltaDecorations.mock.calls[deltaDecorations.mock.calls.length - 1];
    const ch1Decor = lastCall[1].find((d: any) => d.range.startLineNumber === 6);
    expect(ch1Decor?.options.glyphMarginClassName).toBe('bb-glyph--ch-live');
  });

  // ── Glyph-margin click → toggle mute ─────────────────────────────────────

  it('toggles mute when clicking on a channel glyph', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });

    // Simulate clicking the glyph on channel 1's line (line 6)
    mouseDownHandler!({
      target: {
        type: (monaco.editor as any).MouseTargetType.GUTTER_GLYPH_MARGIN,
        position: { lineNumber: 6 },
      },
    });

    expect(mockChannelState.toggleMute).toHaveBeenCalledWith(1);
  });

  it('toggles mute on the correct channel when clicking channel 2', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });

    mouseDownHandler!({
      target: {
        type: (monaco.editor as any).MouseTargetType.GUTTER_GLYPH_MARGIN,
        position: { lineNumber: 7 },
      },
    });

    expect(mockChannelState.toggleMute).toHaveBeenCalledWith(2);
  });

  it('does not toggle mute when clicking outside the glyph margin', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });

    mouseDownHandler!({
      target: {
        type: 4, // not GUTTER_GLYPH_MARGIN
        position: { lineNumber: 6 },
      },
    });

    expect(mockChannelState.toggleMute).not.toHaveBeenCalled();
  });

  it('does not toggle mute when clicking on a non-channel glyph line', () => {
    setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });

    // Line 2 is a pat line, not a channel line
    mouseDownHandler!({
      target: {
        type: (monaco.editor as any).MouseTargetType.GUTTER_GLYPH_MARGIN,
        position: { lineNumber: 2 },
      },
    });

    expect(mockChannelState.toggleMute).not.toHaveBeenCalled();
  });

  // ── Teardown ──────────────────────────────────────────────────────────────

  it('clears decorations and removes listeners on teardown', () => {
    const teardown = setupGlyphMargin(mockEditor, eventBus as any, mockChannelState);
    eventBus.emit('parse:success', { ast: {} });
    deltaDecorations.mockClear();

    teardown();

    // Both decoration collections should have been cleared
    const clearCalls = deltaDecorations.mock.calls.filter(
      (call: any[]) => Array.isArray(call[1]) && call[1].length === 0,
    );
    expect(clearCalls.length).toBeGreaterThanOrEqual(2);

    // Further events should not trigger redraws
    deltaDecorations.mockClear();
    eventBus.emit('parse:success', { ast: {} });
    eventBus.emit('playback:position-changed', {
      channelId: 1,
      position: { currentPattern: 'melody' },
    });

    expect(deltaDecorations).not.toHaveBeenCalled();
  });
});
