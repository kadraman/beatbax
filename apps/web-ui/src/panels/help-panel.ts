/**
 * HelpPanel - Embedded reference documentation with search and click-to-insert
 * Part of Phase 4: Advanced IDE features
 *
 * Features:
 * - Collapsible sections: Language Syntax, Instruments, Transforms, Keyboard Shortcuts, Examples
 * - Incremental search filters all content
 * - Click-to-insert snippets (fires onInsertSnippet callback)
 * - Listens to panel:toggled { panel: 'help' } to show/hide itself
 * - Keyboard: Escape closes; F1 / Alt+Shift+K opens shortcuts
 */

import type { EventBus } from '../utils/event-bus';
import type { ShortcutDescriptor } from '../utils/keyboard-shortcuts';

const STYLE_ID = 'bb-help-panel-styles';

export interface HelpPanelOptions {
  container: HTMLElement;
  eventBus: EventBus;
  /** Called with the snippet text when the user clicks "Insert" on an example */
  onInsertSnippet?: (snippet: string) => void;
  /** Whether the panel starts visible (default: false) */
  defaultVisible?: boolean;
  /**
   * When provided, the Keyboard Shortcuts section is populated dynamically
   * from the central KeyboardShortcuts registry instead of the hardcoded list.
   * Pass `() => ks.list()` from main to keep the panel in sync.
   */
  getShortcuts?: () => ReadonlyArray<ShortcutDescriptor>;
}

interface Section {
  id: string;
  title: string;
  content: SectionItem[];
}

type SectionItem =
  | { kind: 'text'; text: string }
  | { kind: 'shortcut'; keys: string[]; desc: string }
  | { kind: 'snippet'; label: string; code: string };

// ─── Reference content ────────────────────────────────────────────────────────

const HELP_SECTIONS: Section[] = [
  {
    id: 'language',
    title: 'Language Syntax',
    content: [
      { kind: 'text', text: 'BeatBax is a concise live-coding language for Game Boy chiptunes.' },
      { kind: 'snippet', label: 'Top-level directives', code:
`chip gameboy
bpm 128
time 4
ticksPerStep 16` },
      { kind: 'snippet', label: 'Define an instrument', code:
`inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst kick  type=noise  env=12,down` },
      { kind: 'snippet', label: 'Define a pattern', code:
`pat melody  = C5 E5 G5 C6
pat bassline = C3 . G2 .
pat perc     = C6 . . C6` },
      { kind: 'snippet', label: 'Define a sequence', code:
`seq main  = melody bassline melody perc
seq intro = melody:inst(bass) bassline` },
      { kind: 'snippet', label: 'Assign channels and play', code:
`channel 1 => inst lead  seq main
channel 2 => inst bass  seq main:oct(-1)
channel 3 => inst wave1 seq intro
channel 4 => inst kick  seq main

play` },
    ],
  },
  {
    id: 'notes',
    title: 'Notes & Rests',
    content: [
      { kind: 'text', text: 'Notes use scientific pitch notation: C3 to B8. A dot (.) is a rest.' },
      { kind: 'text', text: 'Sharps use # (e.g. C#4, F#5). Flats are not supported — use the enharmonic sharp.' },
      { kind: 'snippet', label: 'Note examples', code:
`pat example = C4 D4 E4 F4 G4 A4 B4 C5
pat rests   = C5 . . E5 . . G5 .
pat sharps  = C#4 D#4 F#4 G#4 A#4` },
    ],
  },
  {
    id: 'instruments',
    title: 'Instruments',
    content: [
      { kind: 'text', text: 'All four Game Boy channels have their own instrument type.' },
      { kind: 'snippet', label: 'Pulse channel (type=pulse1 or pulse2)', code:
`inst lead type=pulse1 duty=50 env=12,down
# duty: 12 | 25 | 50 | 75
# env: <volume>,<direction>  direction = up | down | flat` },
      { kind: 'snippet', label: 'Wave channel (type=wave)', code:
`inst wv type=wave wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
# wave: 16 nibble values (0-15) defining the 4-bit wavetable` },
      { kind: 'snippet', label: 'Noise channel (type=noise)', code:
`inst sn type=noise env=12,down
# LFSR noise with envelope` },
      { kind: 'snippet', label: 'Inline instrument switch in a pattern', code:
`pat groove = inst lead C5 E5 inst bass G3 .
# Switches instrument for remaining notes in pattern` },
      { kind: 'snippet', label: 'Temporary instrument override (N steps)', code:
`pat fill = C6 C6 inst(hat,2) C6 C6 C6
# inst(name,N) switches for N steps, then reverts` },
    ],
  },
  {
    id: 'transforms',
    title: 'Transforms',
    content: [
      { kind: 'text', text: 'Transforms are applied at compile-time during sequence expansion.' },
      { kind: 'snippet', label: 'Octave shift', code:
`seq low = melody:oct(-2)
seq high = melody:oct(+1)` },
      { kind: 'snippet', label: 'Assign instrument to a pattern in a sequence', code:
`seq intro = melody:inst(bass)` },
      { kind: 'snippet', label: 'Reverse a pattern', code:
`seq backward = melody:rev` },
      { kind: 'snippet', label: 'Speed changes', code:
`seq fast = melody:fast
seq slow = melody:slow` },
      { kind: 'snippet', label: 'Combine transforms', code:
`seq double = melody:oct(-1):fast` },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    // Populated statically; overridden at render time when getShortcuts is provided.
    content: [
      { kind: 'shortcut', keys: ['F5'],                 desc: 'Play / re-play' },
      { kind: 'shortcut', keys: ['Space'],              desc: 'Play / Pause (when editor not focused)' },
      { kind: 'shortcut', keys: ['F8'],                 desc: 'Stop playback' },
      { kind: 'shortcut', keys: ['Esc'],                desc: 'Stop playback (when editor not focused)' },
      { kind: 'shortcut', keys: ['Ctrl', 'Enter'],      desc: 'Apply & re-play' },
      { kind: 'shortcut', keys: ['Ctrl', 'S'],          desc: 'Save (download .bax)' },
      { kind: 'shortcut', keys: ['Ctrl', 'Shift', 'S'], desc: 'Save As…' },
      { kind: 'shortcut', keys: ['Ctrl', 'O'],          desc: 'Open file…' },
      { kind: 'shortcut', keys: ['Ctrl', 'Z'],          desc: 'Undo' },
      { kind: 'shortcut', keys: ['Ctrl', 'Y'],          desc: 'Redo' },
      { kind: 'shortcut', keys: ['Shift', 'F1'],        desc: 'Toggle Help Panel (all sections)' },
      { kind: 'shortcut', keys: ['Alt', 'Shift', 'K'],  desc: 'Jump to Keyboard Shortcuts in Help Panel' },
      { kind: 'shortcut', keys: ['Ctrl', 'Shift', 'L'], desc: 'Toggle theme (Dark / Light)' },
      { kind: 'shortcut', keys: ['Ctrl', 'Shift', 'Y'], desc: 'Toggle Channel Monitor' },
      { kind: 'shortcut', keys: ['Ctrl', '`'],          desc: 'Toggle Output panel' },
      { kind: 'shortcut', keys: ['F1'],                 desc: 'Monaco Command Palette (when editor focused)' },
      { kind: 'shortcut', keys: ['Ctrl', 'Alt', 'P'],   desc: 'Monaco Command Palette — browser-safe alternative to Ctrl+Shift+P' },
    ],
  },
  {
    id: 'examples',
    title: 'Examples — Click to Insert',
    content: [
      { kind: 'snippet', label: 'Minimal song', code:
`chip gameboy
bpm 120
time 4

inst lead type=pulse1 duty=50 env=12,down

pat a = C5 E5 G5 C6

seq main = a a a a

channel 1 => inst lead seq main

play` },
      { kind: 'snippet', label: '4-channel chiptune', code:
`chip gameboy
bpm 140
time 4

inst lead  type=pulse1 duty=50  env=12,down
inst bass  type=pulse2 duty=25  env=10,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst kick  type=noise  env=12,down

pat melody  = C5 E5 G5 C6
pat bassline = C3 . G2 .
pat beat    = C6 . . C6 . C6 C6 .

seq main   = melody melody melody melody
seq groove = bassline bassline
seq perc   = beat beat beat beat

channel 1 => inst lead  seq main
channel 2 => inst bass  seq groove:oct(-1)
channel 3 => inst wave1 seq main:oct(-1)
channel 4 => inst kick  seq perc

play` },
      { kind: 'snippet', label: 'Arpeggio pattern', code:
`chip gameboy
bpm 160

inst arp type=pulse1 duty=50 env=15,flat

pat upArp = C5 E5 G5 B5 C6 B5 G5 E5

seq run = upArp upArp upArp upArp

channel 1 => inst arp seq run

play` },
      { kind: 'snippet', label: 'Wave + noise percussion', code:
`chip gameboy
bpm 120

inst wv   type=wave  wave=[15,15,14,12,10,8,6,4,3,2,1,0,0,0,0,0]
inst kick type=noise env=15,down

pat wave_mel = C4 E4 G4 C5
pat kick_pat = C6 . C6 .

seq wseq = wave_mel wave_mel
seq kseq = kick_pat kick_pat kick_pat kick_pat

channel 3 => inst wv   seq wseq
channel 4 => inst kick seq kseq

play` },
    ],
  },
];

// ─── HelpPanel class ──────────────────────────────────────────────────────────

export class HelpPanel {
  private container: HTMLElement;
  private eventBus: EventBus;
  private onInsertSnippet?: (snippet: string) => void;
  private getShortcuts?: () => ReadonlyArray<ShortcutDescriptor>;
  private visible: boolean;
  private unsubscribers: Array<() => void> = [];
  private searchQuery = '';
  private collapsedSections = new Set<string>();
  private abortCtrl = new AbortController();

  constructor(options: HelpPanelOptions) {
    this.container = options.container;
    this.eventBus = options.eventBus;
    this.onInsertSnippet = options.onInsertSnippet;
    this.getShortcuts = options.getShortcuts;
    this.visible = options.defaultVisible ?? false;

    this.injectStyles();
    this.render();
    this.subscribe();
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  show(): void {
    this.visible = true;
    this.render();
  }

  hide(): void {
    this.visible = false;
    this.render();
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Open the panel and scroll directly to the Keyboard Shortcuts section,
   * clearing any active search and expanding the section if collapsed.
   */
  showShortcuts(): void {
    this.searchQuery = '';
    this.collapsedSections.delete('shortcuts');
    this.show(); // renders the panel
    requestAnimationFrame(() => {
      const sec = this.container.querySelector<HTMLElement>('[data-section-id="shortcuts"]');
      sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  dispose(): void {
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];
    this.abortCtrl.abort();
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  private render(): void {
    this.container.innerHTML = '';

    if (!this.visible) {
      this.container.style.display = 'none';
      return;
    }
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';

    const root = document.createElement('div');
    root.className = 'bb-help';

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'bb-help__header';

    const title = document.createElement('span');
    title.className = 'bb-help__title';
    title.textContent = '❔ Help & Reference';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'bb-help__close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close help (Esc)';
    closeBtn.addEventListener('click', () => this.hide());

    header.append(title, closeBtn);
    root.appendChild(header);

    // ── Search bar ───────────────────────────────────────────────────────────
    const searchBar = document.createElement('div');
    searchBar.className = 'bb-help__search-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'bb-help__search';
    searchInput.placeholder = 'Search docs…';
    searchInput.value = this.searchQuery;
    searchInput.setAttribute('aria-label', 'Search documentation');

    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.toLowerCase();
      this.renderBody(body);
    });
    // Prevent Escape from also closing the whole panel when search has text
    searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.searchQuery) {
          e.stopPropagation();
          this.searchQuery = '';
          searchInput.value = '';
          this.renderBody(body);
        }
        // If empty, let the event propagate to close the panel
      }
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'bb-help__search-clear';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Clear search';
    clearBtn.addEventListener('click', () => {
      this.searchQuery = '';
      searchInput.value = '';
      this.renderBody(body);
      searchInput.focus();
    });

    searchBar.append(searchInput, clearBtn);
    root.appendChild(searchBar);

    // ── Scrollable body ──────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'bb-help__body';
    this.renderBody(body);
    root.appendChild(body);

    this.container.appendChild(root);

    // Auto-focus search
    requestAnimationFrame(() => searchInput.focus());
  }

  private buildShortcutSections(): Section[] {
    // If a live registry is available, replace the static shortcuts section content
    if (!this.getShortcuts) return HELP_SECTIONS;
    const live = this.getShortcuts();
    return HELP_SECTIONS.map(s => {
      if (s.id !== 'shortcuts') return s;
      return {
        ...s,
        content: live.map(d => ({
          kind: 'shortcut' as const,
          keys: this.descriptorToKeys(d),
          desc: d.description,
        })),
      };
    });
  }

  /** Convert a ShortcutDescriptor to a human-readable key array like ['Ctrl', 'S'] */
  private descriptorToKeys(d: ShortcutDescriptor): string[] {
    const keys: string[] = [];
    if (d.ctrlKey) keys.push('Ctrl');
    if (d.altKey) keys.push('Alt');
    if (d.shiftKey) keys.push('Shift');
    // Capitalise single-letter keys; handle 'space' → 'Space', 'escape' → 'Esc', etc.
    const raw = d.key;
    const display = raw === ' ' ? 'Space'
      : raw.toLowerCase() === 'escape' ? 'Esc'
      : raw.toLowerCase() === 'f1' ? 'F1'
      : raw.toLowerCase() === 'enter' ? 'Enter'
      : raw.length === 1 ? raw.toUpperCase()
      : raw;
    keys.push(display);
    return keys;
  }

  private renderBody(body: HTMLElement): void {
    body.innerHTML = '';
    const q = this.searchQuery;
    const sections = this.buildShortcutSections();

    for (const section of sections) {
      const visibleItems = q ? this.filterItems(section.content, q) : section.content;

      // If searching and this section has no matches, skip entirely
      if (q && visibleItems.length === 0) continue;

      const sectionEl = this.buildSection(section, visibleItems, q);
      body.appendChild(sectionEl);
    }

    if (q && body.childElementCount === 0) {  // keep the same structure
      const empty = document.createElement('div');
      empty.className = 'bb-help__empty';
      empty.textContent = `No results for "${q}"`;
      body.appendChild(empty);
    }
  }

  private filterItems(items: SectionItem[], q: string): SectionItem[] {
    return items.filter(item => {
      switch (item.kind) {
        case 'text':     return item.text.toLowerCase().includes(q);
        case 'shortcut': return item.desc.toLowerCase().includes(q) || item.keys.join('+').toLowerCase().includes(q);
        case 'snippet':  return item.label.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
        default:         return false;
      }
    });
  }

  private buildSection(section: Section, items: SectionItem[], q: string): HTMLElement {
    const isCollapsed = !q && this.collapsedSections.has(section.id);

    const el = document.createElement('div');
    el.className = 'bb-help__section';
    el.dataset.sectionId = section.id;

    // Section header / toggle
    const sectionHeader = document.createElement('button');
    sectionHeader.className = 'bb-help__section-header';
    sectionHeader.setAttribute('aria-expanded', String(!isCollapsed));
    sectionHeader.innerHTML = `<span class="bb-help__section-arrow">${isCollapsed ? '▶' : '▼'}</span> ${section.title}`;
    sectionHeader.addEventListener('click', () => {
      if (this.collapsedSections.has(section.id)) {
        this.collapsedSections.delete(section.id);
      } else {
        this.collapsedSections.add(section.id);
      }
      const body = el.querySelector('.bb-help__section-body') as HTMLElement;
      const arrow = sectionHeader.querySelector('.bb-help__section-arrow') as HTMLElement;
      const nowCollapsed = this.collapsedSections.has(section.id);
      body.style.display = nowCollapsed ? 'none' : 'block';
      arrow.textContent = nowCollapsed ? '▶' : '▼';
      sectionHeader.setAttribute('aria-expanded', String(!nowCollapsed));
    });

    el.appendChild(sectionHeader);

    // Section body
    const sectionBody = document.createElement('div');
    sectionBody.className = 'bb-help__section-body';
    sectionBody.style.display = isCollapsed ? 'none' : 'block';

    for (const item of items) {
      sectionBody.appendChild(this.buildItem(item, q));
    }

    el.appendChild(sectionBody);
    return el;
  }

  private buildItem(item: SectionItem, q: string): HTMLElement {
    const el = document.createElement('div');

    switch (item.kind) {
      case 'text': {
        el.className = 'bb-help__text';
        el.textContent = item.text;
        break;
      }

      case 'shortcut': {
        el.className = 'bb-help__shortcut';
        const keysEl = document.createElement('span');
        keysEl.className = 'bb-help__keys';
        item.keys.forEach((k, i) => {
          if (i > 0) {
            const plus = document.createElement('span');
            plus.className = 'bb-help__key-sep';
            plus.textContent = '+';
            keysEl.appendChild(plus);
          }
          const kbd = document.createElement('kbd');
          kbd.className = 'bb-help__kbd';
          kbd.textContent = k;
          keysEl.appendChild(kbd);
        });
        const desc = document.createElement('span');
        desc.className = 'bb-help__shortcut-desc';
        desc.textContent = q ? this.highlight(item.desc, q) : item.desc;
        el.append(keysEl, desc);
        break;
      }

      case 'snippet': {
        el.className = 'bb-help__snippet';

        const snippetHeader = document.createElement('div');
        snippetHeader.className = 'bb-help__snippet-header';

        const labelEl = document.createElement('span');
        labelEl.className = 'bb-help__snippet-label';
        labelEl.textContent = item.label;

        const insertBtn = document.createElement('button');
        insertBtn.className = 'bb-help__insert-btn';
        insertBtn.textContent = 'Insert';
        insertBtn.title = 'Insert snippet into editor';
        insertBtn.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          this.onInsertSnippet?.(item.code);
          // Brief visual feedback
          insertBtn.textContent = '✓ Inserted';
          insertBtn.disabled = true;
          setTimeout(() => {
            insertBtn.textContent = 'Insert';
            insertBtn.disabled = false;
          }, 1200);
        });

        snippetHeader.append(labelEl, insertBtn);

        const pre = document.createElement('pre');
        pre.className = 'bb-help__snippet-pre';
        const code = document.createElement('code');
        code.textContent = item.code;
        pre.appendChild(code);

        el.append(snippetHeader, pre);
        break;
      }
    }

    return el;
  }

  /** Simple character-level highlight (returns plain text; use textContent for safety) */
  private highlight(text: string, q: string): string {
    // Returns plain text for now to avoid XSS — callers use textContent
    return text;
  }

  // ─── Event subscriptions ─────────────────────────────────────────────────

  private subscribe(): void {
    // Listen for panel:toggled event targeting 'help'
    this.unsubscribers.push(
      this.eventBus.on('panel:toggled', ({ panel, visible }) => {
        if (panel !== 'help') return;
        visible ? this.show() : this.hide();
      }),
    );
    // Note: F1 / Escape shortcuts are registered in the central KeyboardShortcuts
    // registry (main-phase4.ts) when getShortcuts is provided. When the panel is
    // used standalone (phases 1-3) it falls back to its own inline handler below.
    if (!this.getShortcuts) {
      const onKey = (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'F1' && !ke.ctrlKey && !ke.metaKey && !ke.altKey) {
          ke.preventDefault();
          this.show();
        } else if (ke.key === 'Escape' && this.visible) {
          ke.preventDefault();
          this.hide();
        }
      };
      document.addEventListener('keydown', onKey, { signal: this.abortCtrl.signal });
    }
  }

  // ─── CSS injection ────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = /* css */ `
      .bb-help {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #252526;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #d4d4d4;
        overflow: hidden;
      }

      .bb-help__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: #1e1e1e;
        border-bottom: 1px solid #3c3c3c;
        flex-shrink: 0;
      }

      .bb-help__title {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #888;
      }

      .bb-help__close {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 3px;
      }

      .bb-help__close:hover {
        background: #3a3a3a;
        color: #d4d4d4;
      }

      .bb-help__search-bar {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        border-bottom: 1px solid #2d2d2d;
        flex-shrink: 0;
      }

      .bb-help__search {
        flex: 1;
        background: #3c3c3c;
        border: 1px solid #555;
        border-radius: 4px;
        color: #d4d4d4;
        font-size: 12px;
        padding: 4px 8px;
        outline: none;
      }

      .bb-help__search:focus {
        border-color: #569cd6;
        box-shadow: 0 0 0 1px rgba(86,156,214,0.3);
      }

      .bb-help__search-clear {
        background: none;
        border: none;
        color: #777;
        cursor: pointer;
        font-size: 12px;
        padding: 2px 4px;
        border-radius: 3px;
      }

      .bb-help__search-clear:hover {
        color: #d4d4d4;
        background: #3a3a3a;
      }

      .bb-help__body {
        flex: 1;
        overflow-y: auto;
        padding: 4px 0;
      }

      .bb-help__body::-webkit-scrollbar { width: 6px; }
      .bb-help__body::-webkit-scrollbar-track { background: #1e1e1e; }
      .bb-help__body::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }

      .bb-help__empty {
        padding: 20px;
        text-align: center;
        color: #666;
        font-style: italic;
      }

      .bb-help__section {
        border-bottom: 1px solid #2d2d2d;
      }

      .bb-help__section-header {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 6px;
        background: #2a2a2a;
        border: none;
        color: #c8c8c8;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 600;
        text-align: left;
        cursor: pointer;
        letter-spacing: 0.04em;
        transition: background 0.15s;
      }

      .bb-help__section-header:hover {
        background: #333;
      }

      .bb-help__section-arrow {
        font-size: 9px;
        color: #666;
        flex-shrink: 0;
      }

      .bb-help__section-body {
        padding: 6px 12px 10px;
      }

      .bb-help__text {
        font-size: 12px;
        color: #aaa;
        line-height: 1.5;
        margin-bottom: 6px;
      }

      /* Keyboard shortcuts */
      .bb-help__shortcut {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 0;
      }

      .bb-help__keys {
        display: flex;
        align-items: center;
        gap: 2px;
        min-width: 130px;
        flex-shrink: 0;
      }

      .bb-help__kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 20px;
        padding: 0 5px;
        background: #3a3a3a;
        border: 1px solid #666;
        border-bottom-width: 2px;
        border-radius: 4px;
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        color: #d4d4d4;
        white-space: nowrap;
      }

      .bb-help__key-sep {
        color: #666;
        font-size: 10px;
        margin: 0 1px;
      }

      .bb-help__shortcut-desc {
        font-size: 12px;
        color: #c8c8c8;
      }

      /* Snippets */
      .bb-help__snippet {
        margin-bottom: 10px;
        border: 1px solid #3c3c3c;
        border-radius: 5px;
        overflow: hidden;
      }

      .bb-help__snippet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 8px;
        background: #2d2d2d;
        border-bottom: 1px solid #3c3c3c;
      }

      .bb-help__snippet-label {
        font-size: 11px;
        font-weight: 600;
        color: #9cdcfe;
      }

      .bb-help__insert-btn {
        padding: 2px 8px;
        font-size: 11px;
        font-weight: 600;
        background: #0e639c;
        border: 1px solid #1177bb;
        border-radius: 3px;
        color: #fff;
        cursor: pointer;
        transition: background 0.15s;
      }

      .bb-help__insert-btn:hover:not(:disabled) {
        background: #1177bb;
      }

      .bb-help__insert-btn:disabled {
        background: #2a6a2a;
        border-color: #3a8c3a;
        cursor: default;
      }

      .bb-help__snippet-pre {
        margin: 0;
        padding: 6px 10px;
        background: #1e1e1e;
        overflow-x: auto;
        font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
        font-size: 11px;
        line-height: 1.5;
        color: #ce9178;
        white-space: pre;
        tab-size: 2;
      }

      .bb-help__snippet-pre::-webkit-scrollbar { height: 4px; }
      .bb-help__snippet-pre::-webkit-scrollbar-track { background: #1e1e1e; }
      .bb-help__snippet-pre::-webkit-scrollbar-thumb { background: #555; border-radius: 2px; }

      /* Light theme */
      [data-theme="light"] .bb-help {
        background: #f3f3f3;
        color: #333;
      }

      [data-theme="light"] .bb-help__header {
        background: #e8e8e8;
        border-color: #ddd;
      }

      [data-theme="light"] .bb-help__section-header {
        background: #eaeaea;
        color: #333;
      }

      [data-theme="light"] .bb-help__section-header:hover {
        background: #e0e0e0;
      }

      [data-theme="light"] .bb-help__section-body {
        background: #f3f3f3;
      }

      [data-theme="light"] .bb-help__search {
        background: #fff;
        border-color: #ccc;
        color: #333;
      }

      [data-theme="light"] .bb-help__kbd {
        background: #eaeaea;
        border-color: #aaa;
        color: #333;
      }

      [data-theme="light"] .bb-help__snippet-pre {
        background: #f8f8f8;
        color: #a31515;
      }

      [data-theme="light"] .bb-help__snippet-header {
        background: #ebebeb;
        border-color: #ddd;
      }
    `;
    document.head.appendChild(style);
  }
}
