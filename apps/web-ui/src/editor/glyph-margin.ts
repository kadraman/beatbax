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
  if (document.getElementById('bb-glyph-styles')) return;
  const style = document.createElement('style');
  style.id = 'bb-glyph-styles';
  style.textContent = `
    /* Pulse animation for playback cursors */
    @keyframes bb-beat {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.25; }
    }

    /* Playback position cursor — active pat line (teal) */
    .bb-glyph--playing::before {
      content: '';
      width: 16px;
      height: 16px;
      display: block;
      margin: 2px auto;
      background-repeat: no-repeat;
      background-position: center;
      background-size: 16px 16px;
      background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzRlYzliMCIgZD0iTTggNXYxNGwxMS03eiIvPjwvc3ZnPg==");
      animation: bb-beat 0.9s ease-in-out infinite;
    }

    /* Playback position cursor — active seq line (amber) */
    .bb-glyph--seq-playing::before {
      content: '';
      width: 16px;
      height: 16px;
      display: block;
      margin: 2px auto;
      background-repeat: no-repeat;
      background-position: center;
      background-size: 16px 16px;
      background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2NlOTE3OCIgZD0iTTggNXYxNGwxMS03eiIvPjwvc3ZnPg==");
      animation: bb-beat 0.9s ease-in-out infinite;
      animation-delay: 0.45s;
    }

    /* Channel live (normal) — inline SVG (green speaker) */
    .bb-glyph--ch-live::before {
      content: '';
      width: 16px;
      height: 16px;
      display: block;
      margin: 2px auto;
      background-repeat: no-repeat;
      background-position: center;
      background-size: 18px 18px;
      background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzRjYWY1MCIgZD0iTTMgMTB2NGg0bDUgNVY1TDcgMTBIM3oiLz48L3N2Zz4=");
      cursor: pointer;
    }

    /* Channel muted — inline SVG (speaker with slash) */
    .bb-glyph--ch-muted::before {
      content: '';
      width: 16px;
      height: 16px;
      display: block;
      margin: 2px auto;
      background-repeat: no-repeat;
      background-position: center;
      background-size: 16px 16px;
      background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzU1NSIgZD0iTTUgOXY2aDRsNSA1VjRMOSA5SDV6Ii8+PGxpbmUgeDE9IjMiIHkxPSIyMSIgeDI9IjIxIiB5Mj0iMyIgc3Ryb2tlPSIjNTU1IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg==");
      cursor: pointer;
    }

    /* Channel soloed — inline SVG (star) */
    .bb-glyph--ch-soloed::before {
      content: '';
      width: 14px;
      height: 14px;
      display: block;
      margin: 2px auto;
      background-repeat: no-repeat;
      background-position: center;
      background-size: 14px 14px;
      background-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZDcwMCIgZD0iTTEyIDE3LjI3TDE4LjE4IDIxbC0xLjY0LTcuMDNMMjIgOS4yNGwtNy4xOS0uNjFMMTIgMiA5LjE5IDguNjMgMiA5LjI0bDUuNDYgNC43M0w1LjgyIDIxeiIvPjwvc3ZnPg==");
      cursor: pointer;
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
        hint = `Channel ${chId} soloed — click to mute`;
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
      if (position?.currentPattern) {
        activePatterns.set(channelId, position.currentPattern);
        changed = true;
      }
      if (position?.sourceSequence) {
        activeSequences.set(channelId, position.sourceSequence);
        changed = true;
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

  // ── Glyph-margin click → toggle mute ─────────────────────────────────────

  const mouseDisposable = monacoEditor.onMouseDown((e: any) => {
    if (e.target.type !== (monaco.editor as any).MouseTargetType.GUTTER_GLYPH_MARGIN) return;
    const lineNumber: number | undefined = e.target.position?.lineNumber;
    if (lineNumber === undefined) return;

    for (const [chId, ln] of channelLineMap.entries()) {
      if (ln === lineNumber) {
        channelState.toggleMute(chId);
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
  };
}
