/**
 * Glyph Margin — live editor decorations for BeatBax
 *
 * Two independent features share the glyph margin:
 *
 * 1. Playback position cursor
 *    A ▶ glyph (pulsing) tracks the `pat` line AND the `seq` line that is
 *    currently playing in real-time.  The `pat` glyph (teal) marks the
 *    individual pattern; the `seq` glyph (amber, phase-offset pulse) marks
 *    the enclosing sequence.  Both update on every
 *    `playback:position-changed` event and clear on `playback:stopped`.
 *
 * 2. Channel mute / solo indicator
 *    A ♩ (live), ⊘ (muted), or ★ (soloed) glyph on every `channel N =>`
 *    line reflects current mute/solo state.  Clicking the glyph toggles
 *    mute for that channel, providing a quick in-editor shortcut without
 *    needing to reach for the Channel Mixer.  Glyphs rebuild on
 *    `parse:success` and update on any channel state event.
 *
 * CSS is injected once into <head> so no bundler configuration is required.
 */

import * as monaco from 'monaco-editor';
import type { EventBus } from '../utils/event-bus';
import type { ChannelState } from '../playback/channel-state';

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

function injectGlyphStyles(): void {
  const existing = document.getElementById('bb-glyph-styles');
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = 'bb-glyph-styles';
  style.textContent = `
    /* Pulse animation for playback cursors */
    @keyframes bb-beat {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.25; }
    }

    /* Centre the ::before badge inside Monaco's glyph container */
    .bb-glyph--playing,
    .bb-glyph--seq-playing,
    .bb-glyph--ch-live,
    .bb-glyph--ch-muted,
    .bb-glyph--ch-soloed {
      display: flex !important;
      align-items: center;
      justify-content: center;
    }

    /* ── Shared badge base ─────────────────────────────────────── */
    .bb-glyph--playing::before,
    .bb-glyph--seq-playing::before,
    .bb-glyph--ch-live::before,
    .bb-glyph--ch-muted::before,
    .bb-glyph--ch-soloed::before {
      display: block;
      width: 16px;
      height: 15px;
      line-height: 15px;
      text-align: center;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 700;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-sizing: border-box;
      letter-spacing: 0;
    }

    /* ── Playback position cursor — active pat line (teal) ─────── */
    .bb-glyph--playing::before {
      content: '';
      background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNSI+PHBvbHlnb24gcG9pbnRzPSI2LDMgMTIsNy41IDYsMTIiIGZpbGw9IiM0ZWM5YjAiLz48L3N2Zz4=');
      background-repeat: no-repeat;
      background-position: center;
      border: 1px solid #3a9b8a;
      background-color: #1e3d38;
      border-radius: 3px;
      animation: bb-beat 0.9s ease-in-out infinite;
    }

    /* ── Playback position cursor — active seq line (amber) ────── */
    .bb-glyph--seq-playing::before {
      content: '';
      background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNSI+PHBvbHlnb24gcG9pbnRzPSI2LDMgMTIsNy41IDYsMTIiIGZpbGw9IiNjZTkxNzgiLz48L3N2Zz4=');
      background-repeat: no-repeat;
      background-position: center;
      border: 1px solid #9e6e4e;
      background-color: #3a2e20;
      border-radius: 3px;
      animation: bb-beat 0.9s ease-in-out infinite;
      animation-delay: 0.45s;
    }

    /* ── Channel live (normal) ─────────────────────────────────── */
    .bb-glyph--ch-live::before {
      content: '';
      background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTEwLjUgM0w1IDYuNXY1LjVDNSAxMy42IDQuNiAxNCAzLjUgMTRTMiAxMy42IDIgMTIuNXMxLS0xLjUgMi4xLTEuNWMuNyAwIDEuMy4yIDEuOC42VjcuMWw0LjUtMi45djVjMCAxIC0uOSA0LjUtMiA0LjVTMTAuNSAxMy42IDEwLjUgMTIuNXMxLS0xLjUgMi4xLS0xLjVjLjcgMCAxLjMuMiAxLjguNlYzWiIgZmlsbD0iIzRjYWY1MCIvPjwvc3ZnPg==');
      background-repeat: no-repeat;
      background-position: center;
      border: 1px solid #555;
      background-color: #3a3a3a;
      border-radius: 3px;
    }

    /* ── Channel muted ─────────────────────────────────────────── */
    .bb-glyph--ch-muted::before {
      content: '';
      background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTUgNCBMNyA4IEw1IDEyIEw3IDEzIEw5IDkuNSBMMTEgMTMgTDEzIDEyIEwxMSA4IEwxMyA0IEwxMSA0IEw5LjUgNiBMNyAzIFoiIGZpbGw9IiNmZmFhYWEiLz48L3N2Zz4=');
      background-repeat: no-repeat;
      background-position: center;
      border: 1px solid #c94e4e;
      background-color: #7a2f2f;
      border-radius: 3px;
    }

    /* ── Channel soloed ────────────────────────────────────────── */
    .bb-glyph--ch-soloed::before {
      content: '';
      background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTggMSBMMTAgNiBMMTUgNiBMMTEgOSBMMTIgMTQgTDggMTEgTDQgMTQgTDUgOSBMMSA2IEw2IDYgWiIgZmlsbD0iIzljZGNmZSIvPjwvc3ZnPg==');
      background-repeat: no-repeat;
      background-position: center;
      border: 1px solid #4a9eff;
      background-color: #2a4a7a;
      border-radius: 3px;
    }

    .bb-glyph--ch-live,
    .bb-glyph--ch-muted,
    .bb-glyph--ch-soloed {
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------------------

/**
 * Attach glyph-margin features to a Monaco editor instance.
 *
 * @returns A teardown function that removes all decorations and event listeners.
 */
export function setupGlyphMargin(
  monacoEditor: monaco.editor.IStandaloneCodeEditor,
  eventBus: EventBus,
  channelState: ChannelState,
): () => void {
  injectGlyphStyles();

  // Tighten the left margin: the line-decorations column (right of line
  // numbers, default 10 px in Monaco) adds unnecessary blank space.
  // This is the correct lever — Monaco's glyph-column width itself is
  // set entirely via its internal layout engine and cannot be overridden
  // with CSS.
  monacoEditor.updateOptions({ lineDecorationsWidth: 0 });

  // line-number look-ups (rebuilt on every parse:success)
  const patLineMap     = new Map<string, number>();     // patternName  → 1-based line
  const seqLineMap     = new Map<string, number>();     // sequenceName → 1-based line
  const channelLineMap = new Map<number, number>();     // channelId    → 1-based line

  // Which pattern/sequence is currently playing per channel
  const activePatterns  = new Map<number, string>(); // channelId → patternName
  const activeSequences = new Map<number, string>(); // channelId → sequenceName

  // Decoration-ID bookkeeping so Monaco can diff on the next update
  let positionIds: string[] = [];
  let muteSoloIds: string[] = [];

  // ── Line-map builder ──────────────────────────────────────────────────────

  function rebuildLineMaps(): void {
    patLineMap.clear();
    seqLineMap.clear();
    channelLineMap.clear();
    const model = monacoEditor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    for (let i = 1; i <= lineCount; i++) {
      const line = model.getLineContent(i);

      const patMatch = /^\s*pat\s+([A-Za-z0-9_-]+)\s*=/.exec(line);
      if (patMatch) { patLineMap.set(patMatch[1], i); continue; }

      const seqMatch = /^\s*seq\s+([A-Za-z0-9_-]+)\s*=/.exec(line);
      if (seqMatch) { seqLineMap.set(seqMatch[1], i); continue; }

      const chMatch = /^\s*channel\s+(\d+)\s*=>/.exec(line);
      if (chMatch) channelLineMap.set(parseInt(chMatch[1], 10), i);
    }
  }

  // ── Decoration renderers ──────────────────────────────────────────────────

  function redrawPositionGlyphs(): void {
    const decors: monaco.editor.IModelDeltaDecoration[] = [];

    // pat glyphs (teal ▶)
    const playingPatLines = new Set<number>();
    for (const patName of activePatterns.values()) {
      const ln = patLineMap.get(patName);
      if (ln !== undefined) playingPatLines.add(ln);
    }
    for (const ln of playingPatLines) {
      decors.push({
        range: new monaco.Range(ln, 1, ln, 1),
        options: {
          glyphMarginClassName: 'bb-glyph--playing',
          glyphMarginHoverMessage: { value: 'Currently playing (pattern)' },
        },
      });
    }

    // seq glyphs (amber ▶)
    const playingSeqLines = new Set<number>();
    for (const seqName of activeSequences.values()) {
      const ln = seqLineMap.get(seqName);
      if (ln !== undefined) playingSeqLines.add(ln);
    }
    for (const ln of playingSeqLines) {
      // Skip if a pat glyph is already on this line (pat takes priority)
      if (playingPatLines.has(ln)) continue;
      decors.push({
        range: new monaco.Range(ln, 1, ln, 1),
        options: {
          glyphMarginClassName: 'bb-glyph--seq-playing',
          glyphMarginHoverMessage: { value: 'Currently playing (sequence)' },
        },
      });
    }

    positionIds = monacoEditor.deltaDecorations(positionIds, decors);
  }

  function redrawMuteSoloGlyphs(): void {
    const decors: monaco.editor.IModelDeltaDecoration[] = [];

    for (const [chId, ln] of channelLineMap.entries()) {
      const info = channelState.getChannel(chId);
      if (!info) continue;

      let cls: string;
      let hint: string;
      if (info.soloed) {
        cls  = 'bb-glyph--ch-soloed';
        hint = `Channel ${chId} soloed — click to unsolo`;
      } else if (info.muted) {
        cls  = 'bb-glyph--ch-muted';
        hint = `Channel ${chId} muted — click to unmute`;
      } else {
        cls  = 'bb-glyph--ch-live';
        hint = `Channel ${chId} live — click to mute`;
      }

      decors.push({
        range: new monaco.Range(ln, 1, ln, 1),
        options: {
          glyphMarginClassName: cls,
          glyphMarginHoverMessage: { value: hint },
        },
      });
    }

    muteSoloIds = monacoEditor.deltaDecorations(muteSoloIds, decors);
  }

  // ── Event subscriptions ───────────────────────────────────────────────────

  const unsubParse = eventBus.on('parse:success', () => {
    rebuildLineMaps();
    // Clear stale position glyphs — names may have changed
    activePatterns.clear();
    activeSequences.clear();
    positionIds = monacoEditor.deltaDecorations(positionIds, []);
    redrawMuteSoloGlyphs();
  });

  const unsubPositionChanged = eventBus.on(
    'playback:position-changed',
    ({ channelId, position }: { channelId: number; position: any }) => {
      let changed = false;

      if (position && 'currentPattern' in position) {
        const next: string | null = position.currentPattern;
        if (next == null) {
          if (activePatterns.has(channelId)) {
            activePatterns.delete(channelId);
            changed = true;
          }
        } else if (activePatterns.get(channelId) !== next) {
          activePatterns.set(channelId, next);
          changed = true;
        }
      }

      if (position && 'sourceSequence' in position) {
        const next: string | null = position.sourceSequence;
        if (next == null) {
          if (activeSequences.has(channelId)) {
            activeSequences.delete(channelId);
            changed = true;
          }
        } else if (activeSequences.get(channelId) !== next) {
          activeSequences.set(channelId, next);
          changed = true;
        }
      }

      if (changed) redrawPositionGlyphs();
    },
  );

  const unsubStopped = eventBus.on('playback:stopped', () => {
    activePatterns.clear();
    activeSequences.clear();
    positionIds = monacoEditor.deltaDecorations(positionIds, []);
  });

  const unsubMuted    = eventBus.on('channel:muted',    () => redrawMuteSoloGlyphs());
  const unsubUnmuted  = eventBus.on('channel:unmuted',  () => redrawMuteSoloGlyphs());
  const unsubSoloed   = eventBus.on('channel:soloed',   () => redrawMuteSoloGlyphs());
  const unsubUnsoloed = eventBus.on('channel:unsoloed', () => redrawMuteSoloGlyphs());

  // ── Glyph-margin click → toggle mute or solo ─────────────────────────────
  // Clicking the S (soloed) badge un-solos the channel.
  // Clicking the M (muted) or ♪ (live) badge toggles mute.

  const mouseDisposable = monacoEditor.onMouseDown((e: any) => {
    if (e.target.type !== (monaco.editor as any).MouseTargetType.GUTTER_GLYPH_MARGIN) return;
    const lineNumber: number | undefined = e.target.position?.lineNumber;
    if (lineNumber === undefined) return;

    for (const [chId, ln] of channelLineMap.entries()) {
      if (ln === lineNumber) {
        const info = channelState.getChannel(chId);
        if (info?.soloed) {
          channelState.toggleSolo(chId);
        } else {
          channelState.toggleMute(chId);
        }
        return;
      }
    }
  });

  // ── Teardown ──────────────────────────────────────────────────────────────

  return () => {
    unsubParse();
    unsubPositionChanged();
    unsubStopped();
    unsubMuted();
    unsubUnmuted();
    unsubSoloed();
    unsubUnsoloed();
    mouseDisposable.dispose();
    monacoEditor.deltaDecorations(positionIds, []);
    monacoEditor.deltaDecorations(muteSoloIds, []);
    monacoEditor.updateOptions({ lineDecorationsWidth: 10 }); // restore default
  };
}
