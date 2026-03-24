/**
 * BeatBax Command Palette
 *
 * Registers all BeatBax-specific commands with the Monaco editor so they
 * appear in the Command Palette (F1 / Ctrl+Alt+P) and can be triggered via
 * keyboard shortcuts or programmatically.
 *
 * Commands are grouped into four categories:
 *   BeatBax: Export   — JSON, MIDI, UGE, WAV
 *   BeatBax: Edit     — generate starters, insert transform, format, play selection
 *   BeatBax: Validate — verify / validate song
 *   BeatBax: Channels — mute / solo toggles for channels 1–4
 *
 * @module editor/command-palette
 */

import * as monaco from 'monaco-editor';
import { KeyCode, KeyMod } from 'monaco-editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'json' | 'midi' | 'uge' | 'wav';

export interface CommandPaletteOptions {
  /** The Monaco editor instance. */
  editor: monaco.editor.IStandaloneCodeEditor;

  /** Current song source accessor (called fresh on every invocation). */
  getSource: () => string;

  /** Trigger an export by format. */
  onExport: (format: ExportFormat) => void;

  /** Re-run verify / validate. */
  onVerify: () => void;

  /** Toggle mute on a channel (1-based). */
  onToggleMute: (channelId: number) => void;

  /** Toggle solo on a channel (1-based). */
  onToggleSolo: (channelId: number) => void;

  /** Stop any active preview. */
  onStopPreview?: () => void;

  /**
   * Play a fully-formed BeatBax source string directly (used for raw-note
   * selections that can't be resolved against the editor's existing AST).
   *
   * When called with a `chunkInfo`, the map contains channelId → ordered
   * [{seqName, noteCount, patNames}] chunks for channels that hold merged seqs.
   * The glyph margin uses sourcePattern events (patNames lookup) with a
   * noteCount-boundary fallback to resolve which original seq is active.
   */
  onPlayRaw?: (
    source: string,
    chunkInfo?: Record<number, Array<{ seqName: string; noteCount: number; patNames: string[] }>>,
  ) => void;
}

// ---------------------------------------------------------------------------
// Starter-snippet constants
// ---------------------------------------------------------------------------

const SAMPLE_INST_SNIPPET = `inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst sn    type=noise  env=12,down
`;

const SAMPLE_PAT_SNIPPET = `pat melody = C4 E4 G4 C5
`;

const TRANSFORMS = [
  { label: 'oct(+1)  — octave up',        insert: 'oct(+1)' },
  { label: 'oct(-1)  — octave down',       insert: 'oct(-1)' },
  { label: 'rev      — reverse pattern',   insert: 'rev' },
  { label: 'slow     — halve speed',       insert: 'slow' },
  { label: 'fast     — double speed',      insert: 'fast' },
  { label: 'transpose(+1) — semitone up',  insert: 'transpose(+1)' },
  { label: 'transpose(-1) — semitone down',insert: 'transpose(-1)' },
  { label: 'arp(0,3,7) — major arp',       insert: 'arp(0,3,7)' },
  { label: 'arp(0,3,6) — minor arp',       insert: 'arp(0,3,6)' },
  { label: 'inst(name) — override inst',   insert: 'inst(name)' },
];

// ---------------------------------------------------------------------------
// Helper: DOM-based quick-pick (lightweight substitute for missing Monaco API)
// ---------------------------------------------------------------------------

/**
 * Opens a minimal floating list anchored to the editor's DOM node.
 * Resolves with the chosen value, or `null` if dismissed.
 */
function showQuickPick(
  anchorElement: HTMLElement,
  items: Array<{ label: string; value: string }>,
  placeholder: string,
): Promise<string | null> {
  return new Promise(resolve => {
    // Overlay to capture outside clicks
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;';

    const list = document.createElement('div');
    list.role = 'listbox';
    list.style.cssText = `
      position: fixed;
      z-index: 9999;
      background: var(--editor-bg, #1e1e1e);
      border: 1px solid var(--border-color, #454545);
      border-radius: 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      min-width: 280px;
      max-width: 380px;
      max-height: 240px;
      overflow-y: auto;
      font-family: var(--editor-font, monospace);
      font-size: 13px;
      color: var(--text-color, #d4d4d4);
    `;

    // Position near the top-centre of the editor
    const rect = anchorElement.getBoundingClientRect();
    list.style.top = `${rect.top + 48}px`;
    list.style.left = `${rect.left + Math.floor(rect.width / 2) - 190}px`;

    const header = document.createElement('div');
    header.style.cssText = 'padding: 6px 10px; font-size: 11px; color: var(--text-muted, #888); border-bottom: 1px solid var(--border-color, #454545);';
    header.textContent = placeholder;
    list.appendChild(header);

    function dismiss(value: string | null) {
      overlay.remove();
      list.remove();
      resolve(value);
    }

    for (const item of items) {
      const row = document.createElement('div');
      row.role = 'option';
      row.style.cssText = 'padding: 6px 10px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
      row.textContent = item.label;
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--button-hover-bg, #2a2d2e)'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      row.addEventListener('click', (e) => { e.stopPropagation(); dismiss(item.value); });
      list.appendChild(row);
    }

    overlay.addEventListener('click', () => dismiss(null));
    document.body.appendChild(overlay);
    document.body.appendChild(list);

    // Dismiss on Escape
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); dismiss(null); }
    };
    document.addEventListener('keydown', onKey);
  });
}

// ---------------------------------------------------------------------------
// Helper: insert text at cursor in Monaco
// ---------------------------------------------------------------------------

function insertAtCursor(
  editor: monaco.editor.IStandaloneCodeEditor,
  text: string,
  source = 'command-palette',
): void {
  const sel = editor.getSelection();
  if (!sel) return;
  editor.executeEdits(source, [{
    range: sel,
    text,
    forceMoveMarkers: true,
  }]);
  editor.focus();
}

// ---------------------------------------------------------------------------
// Public registration function
// ---------------------------------------------------------------------------

/**
 * Register all BeatBax command palette commands on the given editor.
 * Returns a disposable that removes all registered actions.
 */
export function setupCommandPalette(opts: CommandPaletteOptions): monaco.IDisposable {
  const { editor, getSource, onExport, onVerify, onToggleMute, onToggleSolo, onPlayRaw } = opts;

  const disposables: monaco.IDisposable[] = [];

  // ── Helpers ──────────────────────────────────────────────────────────────

  function reg(descriptor: monaco.editor.IActionDescriptor): void {
    disposables.push(editor.addAction(descriptor));
  }

  const editorDom = editor.getDomNode();

  // ── BeatBax: Export ───────────────────────────────────────────────────────

  reg({
    id: 'beatbax.exportJson',
    label: 'BeatBax: Export → JSON',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyJ],
    run: () => onExport('json'),
  });

  reg({
    id: 'beatbax.exportMidi',
    label: 'BeatBax: Export → MIDI',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM],
    run: () => onExport('midi'),
  });

  reg({
    id: 'beatbax.exportUge',
    label: 'BeatBax: Export → UGE (hUGETracker)',
    keybindings: [],
    run: () => onExport('uge'),
  });

  reg({
    id: 'beatbax.exportWav',
    label: 'BeatBax: Export → WAV',
    keybindings: [],
    run: () => onExport('wav'),
  });

  // ── BeatBax: Validate ─────────────────────────────────────────────────────

  reg({
    id: 'beatbax.verifySong',
    label: 'BeatBax: Verify / Validate Song',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV],
    // Keep in context menu: one slim validate entry is genuinely useful on right-click
    contextMenuGroupId: '9_beatbax',
    contextMenuOrder: 2,
    run: () => onVerify(),
  });

  // ── BeatBax: Edit — generate starters ────────────────────────────────────

  reg({
    id: 'beatbax.generateSampleInst',
    label: 'BeatBax: Generate Sample Instruments',
    keybindings: [],
    run: () => insertAtCursor(editor, SAMPLE_INST_SNIPPET, 'beatbax.generateSampleInst'),
  });

  reg({
    id: 'beatbax.generateSamplePat',
    label: 'BeatBax: Generate Sample Pattern',
    keybindings: [],
    run: () => insertAtCursor(editor, SAMPLE_PAT_SNIPPET, 'beatbax.generateSamplePat'),
  });

  // ── BeatBax: Edit — insert transform ─────────────────────────────────────

  reg({
    id: 'beatbax.insertTransform',
    label: 'BeatBax: Insert Transform…',
    keybindings: [],
    run: async () => {
      const anchor = editorDom ?? document.body;
      const chosen = await showQuickPick(
        anchor,
        TRANSFORMS.map(t => ({ label: t.label, value: t.insert })),
        'Pick a transform to insert',
      );
      if (chosen) insertAtCursor(editor, chosen, 'beatbax.insertTransform');
    },
  });

  // ── BeatBax: Edit — play selection ────────────────────────────────────────

  reg({
    id: 'beatbax.playSelection',
    label: 'BeatBax: Play Selected Sequence / Pattern',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space],
    // One context-menu entry for quick play-selection
    contextMenuGroupId: '9_beatbax',
    contextMenuOrder: 1,
    run: () => {
      const selection = editor.getSelection();
      if (!selection) return;
      const selectedText = editor.getModel()?.getValueInRange(selection)?.trim();
      if (!selectedText) return;

      // Collect every pat/seq definition line in the selection (handles multi-line).
      const selLines = selectedText.split('\n').map(l => l.trim()).filter(Boolean);
      const found: Array<{ name: string; kind: 'pat' | 'seq' }> = [];
      for (const line of selLines) {
        const pm = line.match(/^pat\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (pm) { found.push({ name: pm[1], kind: 'pat' }); continue; }
        const sm = line.match(/^seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (sm) { found.push({ name: sm[1], kind: 'seq' }); }
      }

      // Multiple definitions → build a multi-channel synthetic source and play.
      if (found.length > 1) {
        const { source: multiSrc, chunkInfo } = buildMultiPlaySource(found, getSource());
        onPlayRaw?.(multiSrc, Object.keys(chunkInfo).length > 0 ? chunkInfo : undefined);
        return;
      }

      // Single definition line (pat or seq).
      if (found.length === 1) {
        const { name, kind } = found[0];
        editor.trigger('', kind === 'seq' ? 'beatbax.previewSeq' : 'beatbax.previewPattern', name);
        return;
      }

      // Single bare identifier → look up in source to decide seq vs pat.
      const isIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/.test(selectedText);
      if (isIdentifier) {
        const source = getSource();
        const isSeq = new RegExp(`^\\s*seq\\s+${selectedText}\\s*=`, 'm').test(source);
        editor.trigger('', isSeq ? 'beatbax.previewSeq' : 'beatbax.previewPattern', selectedText);
        return;
      }

      // Raw note tokens: synthesise a minimal one-channel song.
      const syntheticSource = [
        'chip gameboy',
        'bpm 120',
        'time 4',
        'inst _tmp type=pulse1 duty=50 env=12,down',
        `pat __sel__ = ${selectedText}`,
        'channel 1 => inst _tmp seq __sel__',
        'play',
      ].join('\n');
      onPlayRaw?.(syntheticSource);
    },
  });

  // ── BeatBax: Edit — format document ──────────────────────────────────────

  reg({
    id: 'beatbax.formatDocument',
    label: 'BeatBax: Format BeatBax Document',
    keybindings: [],
    run: () => {
      const model = editor.getModel();
      if (!model) return;
      const source = model.getValue();
      const formatted = formatBeatBaxSource(source);
      if (formatted === source) return; // nothing changed
      const fullRange = model.getFullModelRange();
      editor.executeEdits('beatbax.formatDocument', [{
        range: fullRange,
        text: formatted,
        forceMoveMarkers: false,
      }]);
      editor.focus();
    },
  });

  // ── BeatBax: Channels — mute / solo ──────────────────────────────────────

  for (let ch = 1; ch <= 4; ch++) {
    const channelId = ch;
    reg({
      id: `beatbax.toggleMuteChannel${channelId}`,
      label: `BeatBax: Toggle Mute Channel ${channelId}`,
      keybindings: [],
      run: () => onToggleMute(channelId),
    });

    reg({
      id: `beatbax.soloChannel${channelId}`,
      label: `BeatBax: Solo Channel ${channelId}`,
      keybindings: [],
      run: () => onToggleSolo(channelId),
    });
  }

  // ── BeatBax: Channels — quick-pick mute / solo ────────────────────────────

  reg({
    id: 'beatbax.toggleMuteChannel',
    label: 'BeatBax: Toggle Mute Channel…',
    keybindings: [],
    run: async () => {
      const anchor = editorDom ?? document.body;
      const chosen = await showQuickPick(
        anchor,
        [1, 2, 3, 4].map(n => ({ label: `Channel ${n}`, value: String(n) })),
        'Select channel to toggle mute',
      );
      if (chosen) onToggleMute(Number(chosen));
    },
  });

  reg({
    id: 'beatbax.soloChannel',
    label: 'BeatBax: Solo Channel…',
    keybindings: [],
    run: async () => {
      const anchor = editorDom ?? document.body;
      const chosen = await showQuickPick(
        anchor,
        [1, 2, 3, 4].map(n => ({ label: `Channel ${n}`, value: String(n) })),
        'Select channel to solo',
      );
      if (chosen) onToggleSolo(Number(chosen));
    },
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  return {
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Multi-item play helper
// ---------------------------------------------------------------------------

/**
 * Build a complete BeatBax source that plays multiple selected pat/seq items.
 *
 * Strategy:
 *  - Preserve all `inst`, `effect`, `pat`, `seq`, `bpm`, `time`, `chip`,
 *    `ticksPerStep`, and `stepsPerBar` lines from the full editor source so
 *    referenced patterns and instruments are available.
 *  - Strip existing `channel` and `play` directives.
 *  - For each selected seq: assign it to a channel, reusing the instrument
 *    that the seq was originally assigned to in the source (channel N => inst X
 *    seq NAME); fall back to the first declared instrument.
 *  - For selected pats: chain them into a synthetic sequence on one channel.
 *  - Emit a fresh `play`.
 */
/** One entry per original seq in a merged channel slot. */
interface SeqChunk { seqName: string; noteCount: number; patNames: string[]; }

/**
 * Known channel limits per chip backend. Extend as new chips are added.
 * Used to decide how many simultaneous channels are available when merging
 * an over-sized selection without hardcoding the Game Boy’s limit.
 */
const CHIP_MAX_CHANNELS: Record<string, number> = {
  gameboy: 4, 'game-boy': 4, gb: 4,
  nes: 5,
  c64: 3, sid: 3,
  genesis: 9, 'sega-genesis': 9, megadrive: 9,
};

function detectMaxChannels(source: string): number {
  const m = source.match(/^\s*chip\s+([A-Za-z0-9_-]+)/im);
  return m ? (CHIP_MAX_CHANNELS[m[1].toLowerCase()] ?? 4) : 4;
}

/** Regex matching a note token (C4, C#4, Cb4, G#5, Bb3 …). */
const NOTE_TOKEN_RE = /\b[A-Ga-g][#b]?\d\b/g;

/** Count playable note tokens in a raw pattern body string (excludes rests). */
function countNotesInBody(body: string): number {
  return (body.match(NOTE_TOKEN_RE) ?? []).length;
}

function buildMultiPlaySource(
  items: Array<{ name: string; kind: 'pat' | 'seq' }>,
  fullSource: string,
): { source: string; chunkInfo: Record<number, SeqChunk[]> } {
  const maxChannels = detectMaxChannels(fullSource);
  const fullLines = fullSource.split('\n');

  // Lines to preserve verbatim (everything except channel/play directives).
  const KEEP_RE = /^\s*(inst|effect|pat|seq|bpm|time|chip|ticksPerStep|stepsPerBar|volume|#|\/\/|$)\b/;
  const baseLines = fullLines.filter(l => KEEP_RE.test(l));

  // Build a map: seq-name → inst-name from the original channel assignments.
  const seqInstMap = new Map<string, string>();
  for (const l of fullLines) {
    const m = l.match(/^\s*channel\s+\d+\s*=>\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)\s+seq\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) seqInstMap.set(m[2], m[1]); // seq-name → inst-name
  }

  // Build a map: seq-name → raw pattern-list string (for chaining overflow).
  const seqBodyMap = new Map<string, string>();
  for (const l of fullLines) {
    const m = l.match(/^\s*seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)/);
    if (m) seqBodyMap.set(m[1], m[2].trim());
  }

  // Build a map: pat-name → raw body string (for note counting).
  const patBodyMap = new Map<string, string>();
  for (const l of fullLines) {
    const m = l.match(/^\s*pat\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)/);
    if (m) patBodyMap.set(m[1], m[2].trim());
  }

  // First declared instrument as fallback.
  const fallbackInst = (() => {
    for (const l of fullLines) {
      const m = l.match(/^\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) return m[1];
    }
    return null;
  })();

  /**
   * Count note-events a seq will produce from its pattern list.
   * Each pattern reference contributes the note tokens in its body.
   * Result is in the same unit as the scheduler's `eventIndex` counter,
   * so cumulative bounds are directly comparable without a ratio.
   */
  const countSeqNotes = (seqName: string): number => {
    const body = seqBodyMap.get(seqName) ?? '';
    const patRefs = body.split(/\s+/).filter(Boolean).map(t => t.split(':')[0]);
    return patRefs.reduce((sum, ref) => sum + countNotesInBody(patBodyMap.get(ref) ?? ''), 0);
  };

  /**
   * Unique pattern names referenced by a seq (in body order, deduped).
   * Used by glyph-margin to resolve the active chunk via sourcePattern events
   * rather than relying solely on note-count arithmetic.
   */
  const getSeqPatNames = (seqName: string): string[] => {
    const body = seqBodyMap.get(seqName) ?? '';
    const seen = new Set<string>();
    const result: string[] = [];
    for (const token of body.split(/\s+/).filter(Boolean)) {
      const base = token.split(':')[0];
      if (base && !seen.has(base)) { seen.add(base); result.push(base); }
    }
    return result;
  };

  // chunkInfo: channelId → [{seqName, noteCount}] for channels with merged seqs.
  // noteCount is the number of note-events the seq generates so the glyph margin
  // can find the active chunk by comparing eventIndex against cumulative sums
  // — no ratio needed, immune to shared pattern names.
  const chunkInfo: Record<number, SeqChunk[]> = {};

  const newLines = [...baseLines];
  const seqItems = items.filter(i => i.kind === 'seq');
  const patItems = items.filter(i => i.kind === 'pat');
  let ch = 1;

  if (seqItems.length === 0) {
    // nothing
  } else if (seqItems.length <= maxChannels) {
    // One channel per seq — all play simultaneously.
    for (const { name } of seqItems) {
      const inst = seqInstMap.get(name) ?? fallbackInst;
      if (inst) newLines.push(`channel ${ch++} => inst ${inst} seq ${name}`);
    }
  } else {
    // More seqs than channels: distribute round-robin across maxChannels,
    // then merge each channel's seqs into a single chained seq by
    // concatenating their pattern lists.
    const slots: Array<{ names: string[]; inst: string | null }> = Array.from(
      { length: maxChannels },
      () => ({ names: [], inst: null }),
    );
    seqItems.forEach(({ name }, idx) => {
      const slot = slots[idx % maxChannels];
      slot.names.push(name);
      if (!slot.inst) slot.inst = seqInstMap.get(name) ?? fallbackInst;
    });

    // Collect every seq name that will be replaced by a merged definition.
    // We'll strip these from newLines so the editor source doesn't emit a
    // duplicate definition (which would shadow the merged one or cause a
    // parse error).
    const replacedSeqs = new Set<string>();
    for (const { names } of slots) {
      if (names.length > 1) {
        for (const n of names) replacedSeqs.add(n);
      }
    }

    // Remove the to-be-replaced seq definitions from the base lines.
    const filteredBase = newLines.filter(l => {
      const m = l.match(/^\s*seq\s+([A-Za-z0-9_-]+)\s*=/);
      return !m || !replacedSeqs.has(m[1]);
    });
    newLines.length = 0;
    newLines.push(...filteredBase);

    for (let c = 0; c < maxChannels; c++) {
      const { names, inst } = slots[c];
      if (names.length === 0 || !inst) continue;
      if (names.length === 1) {
        // No merging needed — original seq name is used, glyph fires naturally.
        newLines.push(`channel ${ch++} => inst ${inst} seq ${names[0]}`);
      } else {
        // Merge under the FIRST seq’s name so the glyph margin’s seqLineMap
        // (built from the editor model) can find the line for the primary seq.
        const merged = names.map(n => seqBodyMap.get(n) ?? n).join(' ');
        const repName = names[0];
        newLines.push(`seq ${repName} = ${merged}`);
        const channelForSlot = ch;
        newLines.push(`channel ${ch++} => inst ${inst} seq ${repName}`);

        // Record the ordered chunks so the glyph margin can resolve which
        // original seq is active by comparing eventIndex against cumulative
        // note counts (same unit as the scheduler’s per-channel event counter).
        chunkInfo[channelForSlot] = names.map(n => ({
          seqName: n,
          noteCount: countSeqNotes(n),
          patNames: getSeqPatNames(n),
        }));
      }
    }
  }

  // Chain all selected pats into a synthetic sequence on one remaining channel.
  if (patItems.length > 0 && ch <= maxChannels) {
    const chain = patItems.map(p => p.name).join(' ');
    newLines.push(`seq __multi__ = ${chain}`);
    if (fallbackInst) newLines.push(`channel ${ch++} => inst ${fallbackInst} seq __multi__`);
  }

  newLines.push('play');
  return { source: newLines.join('\n'), chunkInfo };
}

// ---------------------------------------------------------------------------
// Minimal formatter
// ---------------------------------------------------------------------------

/**
 * Lightweight formatter: normalises blank lines and aligns `=` signs within
 * consecutive `pat`/`seq`/`inst` blocks. No semantic changes — safe to apply
 * at any time.
 */
function formatBeatBaxSource(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    // Collect a run of lines that start with the same directive keyword
    const match = lines[i].match(/^(\s*)(pat|seq|inst)\s+(\S+)\s*=/);
    if (match) {
      const keyword = match[2];
      const runStart = i;
      const run: string[] = [];
      while (
        i < lines.length &&
        lines[i].match(new RegExp(`^\\s*${keyword}\\s+`))
      ) {
        run.push(lines[i]);
        i++;
      }
      if (run.length > 1) {
        // Align the `=` signs: find the longest `keyword name` prefix
        const maxPrefix = Math.max(...run.map(l => {
          const m = l.match(/^(\s*(?:pat|seq|inst)\s+\S+)\s*=/);
          return m ? m[1].length : 0;
        }));
        out.push(...run.map(l => {
          const m = l.match(/^(\s*(?:pat|seq|inst)\s+\S+)(\s*=\s*)(.*)/);
          if (!m) return l;
          const pre = m[1].padEnd(maxPrefix);
          const rest = m[3];
          return `${pre} = ${rest.trimStart()}`;
        }));
      } else {
        out.push(...run);
      }
      // Insert a blank line between keyword blocks (skip if next line is already blank)
      if (i < lines.length && lines[i].trim() !== '') {
        const nextKw = lines[i].match(/^(\s*)(pat|seq|inst)\s+/);
        if (!nextKw || nextKw[2] !== keyword) out.push('');
      }
    } else {
      // Collapse 3+ consecutive blank lines into max 2
      if (
        lines[i].trim() === '' &&
        out.length >= 2 &&
        out[out.length - 1].trim() === '' &&
        out[out.length - 2].trim() === ''
      ) {
        i++;
        continue;
      }
      out.push(lines[i]);
      i++;
    }
  }
  // Remove trailing blank lines beyond one
  while (out.length > 1 && out[out.length - 1].trim() === '' && out[out.length - 2].trim() === '') {
    out.pop();
  }
  return out.join('\n');
}
