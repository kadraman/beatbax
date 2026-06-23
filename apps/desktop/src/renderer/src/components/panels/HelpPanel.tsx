import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { chipRegistry } from '@beatbax/engine/chips';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { ShortcutDescriptor } from '../../desktop-web-ui/utils/keyboard-shortcuts';

export interface DesktopHelpPanelHandle {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  isVisible: () => boolean;
  showShortcuts: () => void;
  refresh: () => void;
  dispose: () => void;
}

export interface DesktopHelpPanelOptions {
  eventBus: EventBus;
  onInsertSnippet?: (snippet: string) => void;
  onReplaceEditor?: (text: string) => void;
  defaultVisible?: boolean;
  getShortcuts?: () => ReadonlyArray<ShortcutDescriptor>;
  embedded?: boolean;
  singleSection?: string;
  hideHeader?: boolean;
  twoColumns?: boolean;
}

interface DesktopHelpPanelProps extends DesktopHelpPanelOptions {
  panelRef: Ref<DesktopHelpPanelHandle>;
}

interface Section {
  id: string;
  title: string;
  content: SectionItem[];
}

type SectionItem =
  | { kind: 'text'; text: string }
  | { kind: 'shortcut'; keys: string[]; desc: string }
  | { kind: 'snippet'; label: string; code: string }
  | { kind: 'song'; label: string; code: string };

interface HelpContext {
  currentChip: string;
  currentSongChip: string;
  currentSongChipRegion?: string;
}

const HELP_SECTIONS: Section[] = [
  {
    id: 'language',
    title: 'Language Syntax',
    content: [
      { kind: 'text', text: 'BeatBax is a live-coding language and toolchain for retro console chiptunes.' },
      { kind: 'snippet', label: 'Top-level directives', code: 'chip gameboy\nbpm 128\nstepsPerBar 4' },
      {
        kind: 'snippet',
        label: 'Define an instrument',
        code: '# Instrument syntax is chip-specific - see the Instruments section below.\n# Example (Game Boy): inst lead type=pulse1 duty=50 env=12,down\n# Example (NES/Famicom): inst lead type=pulse1 duty=50 env=15,flat',
      },
      {
        kind: 'snippet',
        label: 'Define a pattern',
        code: 'pat melody  = C5 E5 G5 C6\npat bassline = C3 . G2 .\npat perc     = C6 . . C6',
      },
      {
        kind: 'snippet',
        label: 'Define a sequence',
        code: 'seq main  = melody bassline melody perc\nseq intro = melody:inst(bass) bassline:oct(-1)\nseq canon = melody:rot(1):lag(1) # chained modifiers',
      },
      {
        kind: 'snippet',
        label: 'Assign channels and play',
        code: 'channel 1 => inst lead seq main\nchannel 2 => inst bass seq main:oct(-1)\n\nplay',
      },
    ],
  },
  {
    id: 'notes',
    title: 'Notes & Rests',
    content: [
      { kind: 'text', text: 'Notes use scientific pitch notation: C3 to B8. A dot (.) is a rest.' },
      { kind: 'text', text: 'Sharps use # (for example C#4, F#5). Flats are not supported; use the enharmonic sharp.' },
      {
        kind: 'snippet',
        label: 'Note examples',
        code: 'pat example = C4 D4 E4 F4 G4 A4 B4 C5\npat rests   = C5 . . E5 . . G5 .\npat sharps  = C#4 D#4 F#4 G#4 A#4',
      },
    ],
  },
  {
    id: 'instruments',
    title: 'Instruments',
    content: [
      { kind: 'text', text: 'Instrument definitions are chip-specific. Load a song or type `chip <name>` to see documentation for the active chip instrument types.' },
      {
        kind: 'snippet',
        label: 'Inline instrument switch in a pattern',
        code: 'pat groove = inst lead C5 E5 inst bass G3 .\n# Switches instrument for remaining notes in pattern',
      },
      {
        kind: 'snippet',
        label: 'Temporary instrument override (N steps)',
        code: 'pat fill = C6 C6 inst(hat,2) C6 C6 C6\n# inst(name,N) switches for N steps, then reverts',
      },
    ],
  },
  {
    id: 'effects',
    title: 'Effects',
    content: [
      { kind: 'text', text: 'Effects are applied inline on notes using angle-bracket syntax. Named presets can be declared and reused.' },
      {
        kind: 'snippet',
        label: 'Inline effect syntax',
        code: '# note<effect:params> or multiple effects: note<eff1:p><eff2:p>\npat ex = C4<vib:3,6> E4<pan:L> G4<cut:4> C5<arp:4,7>',
      },
      {
        kind: 'snippet',
        label: 'Note duration + effect',
        code: '# note<effect>:ticks - effect BEFORE duration (required order)\npat held = C4<vib:3,6>:8 E4<cut:4>:16 G4<port:8>:8',
      },
      {
        kind: 'snippet',
        label: 'Named effect presets',
        code: 'effect wobble = vib:8,4\neffect stab   = cut:2\neffect arpMaj = arp:4,7\n\npat melody = C4<wobble> E4<stab> G4<arpMaj>',
      },
      { kind: 'snippet', label: 'Pan - stereo position', code: '# pan:L pan:R pan:C or numeric -1.0..1.0\npat panned = C4<pan:L> E4<pan:R> G4<pan:C>' },
      { kind: 'snippet', label: 'Vib - vibrato pitch LFO', code: '# vib:<depth>,<rate>\npat vib = C4<vib:3,6> E4<vib:8,4>' },
      { kind: 'snippet', label: 'Arp - arpeggio', code: '# arp:<offset1>,<offset2> cycles root, +s1, +s2, root\npat chords = C4<arp:4,7> F4<arp:5,9> G4<arp:4,7>' },
      { kind: 'snippet', label: 'Port - portamento / glide', code: '# port:<speed> slides pitch from previous note\npat slide = C4:4 E4<port:8>:4 G4:4' },
      { kind: 'snippet', label: 'Cut - note gate', code: '# cut:<ticks> silences note after N ticks\npat staccato = C4<cut:2>:8 E4<cut:2>:8 G4<cut:2>:8' },
    ],
  },
  {
    id: 'modifiers',
    title: 'Modifiers',
    content: [
      { kind: 'text', text: 'Modifiers reshape pattern references in a seq definition. Chain them with colons after each pattern name.' },
      {
        kind: 'snippet',
        label: 'Chaining modifiers',
        code: 'seq main  = melody:oct(-1) chorus:rev\nseq bass  = bassline:inst(bass):oct(-1)\nseq canon = lead:rot(1):lag(1)',
      },
      {
        kind: 'snippet',
        label: 'Pitch & register',
        code: '# oct(+N/-N) shifts by whole octaves\n# transpose(+N) shifts by semitones\n# clamp(C3,C6) hard-limits notes into range\n# fold(C3,C6) octave-wraps notes into range\n\nseq low  = melody:oct(-1)\nseq up   = melody:transpose(+2)\nseq safe = out_of_range:clamp(C3,C6)',
      },
      {
        kind: 'snippet',
        label: 'Order, length & timing',
        code: '# rot(N) cyclically shifts tokens\n# rev reverses token order\n# slow(N) repeats tokens\n# fast(N) keeps every Nth token\n# off(N) prepends rests\n\nseq shifted = lead_core:rot(1)\nseq mirror  = lead_core:pal\nseq half    = melody:fast',
      },
      {
        kind: 'snippet',
        label: 'Instrument, pan & silence',
        code: '# inst(name) overrides instrument\n# pan(L|R|C) pans the slot\n# mute replaces notes with rests\n\nseq bass_line = melody:inst(bass):oct(-1)\nseq hard_l    = melody:pan(R)\nseq rhythm    = lead_core:mute',
      },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    content: [
      { kind: 'shortcut', keys: ['F5'], desc: 'Play / re-play (desktop)' },
      { kind: 'shortcut', keys: ['F8'], desc: 'Stop playback (desktop)' },
      { kind: 'shortcut', keys: ['Ctrl', 'Enter'], desc: 'Apply & re-play' },
      { kind: 'shortcut', keys: ['Ctrl', 'S'], desc: 'Save' },
      { kind: 'shortcut', keys: ['Ctrl', 'O'], desc: 'Open file...' },
      { kind: 'shortcut', keys: ['Alt', 'Shift', 'K'], desc: 'Show Keyboard Shortcuts' },
      { kind: 'shortcut', keys: ['Shift', 'F1'], desc: 'Show Help tab' },
    ],
  },
  {
    id: 'examples',
    title: 'Examples - Click to Insert',
    content: [
      { kind: 'text', text: 'Chip-specific song examples are provided by the active chip plugin. Load a song or type `chip <name>` to see clickable examples for that chip.' },
    ],
  },
];

function descriptorToKeys(descriptor: ShortcutDescriptor): string[] {
  const keys: string[] = [];
  if (descriptor.ctrlKey) keys.push('Ctrl');
  if (descriptor.altKey) keys.push('Alt');
  if (descriptor.shiftKey) keys.push('Shift');

  const raw = descriptor.key;
  const lower = raw.toLowerCase();
  const display = raw === ' '
    ? 'Space'
    : lower === 'escape'
      ? 'Esc'
      : lower === 'f1'
        ? 'F1'
        : lower === 'enter'
          ? 'Enter'
          : raw.length === 1
            ? raw.toUpperCase()
            : raw;
  keys.push(display);
  return keys;
}

function isSection(value: unknown): value is Section {
  if (!value || typeof value !== 'object') return false;
  const section = value as { id?: unknown; title?: unknown; content?: unknown };
  return typeof section.id === 'string'
    && typeof section.title === 'string'
    && Array.isArray(section.content);
}

function pluginHelpSections(context: HelpContext): Section[] {
  const plugin = chipRegistry.get(context.currentChip);
  const ui = plugin?.uiContributions as {
    buildHelpSections?: (ctx: { chip: string; chipRegion?: string }) => unknown[];
    helpSections?: unknown[];
  } | undefined;
  const sections = ui?.buildHelpSections
    ? ui.buildHelpSections({
      chip: context.currentSongChip,
      chipRegion: context.currentSongChipRegion,
    })
    : ui?.helpSections;

  return (sections ?? []).filter(isSection);
}

function buildSections(
  getShortcuts: (() => ReadonlyArray<ShortcutDescriptor>) | undefined,
  context: HelpContext,
): Section[] {
  let sections = HELP_SECTIONS.map((section) => (
    section.id === 'shortcuts' && getShortcuts
      ? {
          ...section,
          content: getShortcuts().map((descriptor) => ({
            kind: 'shortcut' as const,
            keys: descriptorToKeys(descriptor),
            desc: descriptor.description,
          })),
        }
      : section
  ));

  const pluginSections = pluginHelpSections(context);
  if (pluginSections.length > 0) {
    const replacementIds = new Set(pluginSections.map((section) => section.id));
    sections = sections.map((section) => replacementIds.has(section.id)
      ? pluginSections.find((pluginSection) => pluginSection.id === section.id) ?? section
      : section);

    const builtinIds = new Set(HELP_SECTIONS.map((section) => section.id));
    for (const pluginSection of pluginSections) {
      if (!builtinIds.has(pluginSection.id)) {
        sections = [...sections, pluginSection];
      }
    }
  }

  return sections;
}

function itemMatches(item: SectionItem, query: string): boolean {
  switch (item.kind) {
    case 'text':
      return item.text.toLowerCase().includes(query);
    case 'shortcut':
      return item.desc.toLowerCase().includes(query) || item.keys.join('+').toLowerCase().includes(query);
    case 'snippet':
    case 'song':
      return item.label.toLowerCase().includes(query) || item.code.toLowerCase().includes(query);
  }
}

function ShortcutItem({ item }: { item: Extract<SectionItem, { kind: 'shortcut' }> }): ReactNode {
  return (
    <div className="bb-help__shortcut">
      <span className="bb-help__keys">
        {item.keys.map((key, index) => (
          <span key={`${key}-${index}`}>
            {index > 0 ? <span className="bb-help__key-sep">+</span> : null}
            <kbd className="bb-help__kbd">{key}</kbd>
          </span>
        ))}
      </span>
      <span className="bb-help__shortcut-desc">{item.desc}</span>
    </div>
  );
}

function SnippetItem({
  item,
  onInsertSnippet,
  onReplaceEditor,
}: {
  item: Extract<SectionItem, { kind: 'snippet' | 'song' }>;
  onInsertSnippet?: (snippet: string) => void;
  onReplaceEditor?: (text: string) => void;
}): ReactNode {
  const [feedback, setFeedback] = useState(false);
  const isSong = item.kind === 'song';
  const label = isSong ? 'Replace' : 'Insert';
  const feedbackLabel = isSong ? 'Replaced' : 'Inserted';

  const onClick = () => {
    if (isSong) {
      if (window.confirm('Replace the current song? This cannot be undone.')) {
        onReplaceEditor?.(item.code);
        setFeedback(true);
      }
    } else {
      onInsertSnippet?.(item.code);
      setFeedback(true);
    }
    window.setTimeout(() => setFeedback(false), 1200);
  };

  return (
    <div className="bb-help__snippet">
      <div className="bb-help__snippet-header">
        <span className="bb-help__snippet-label">{item.label}</span>
        <button
          className="bb-help__insert-btn"
          disabled={feedback}
          onClick={onClick}
          title={isSong ? 'Replace entire editor with this song' : 'Insert snippet into editor'}
          type="button"
        >
          {feedback ? feedbackLabel : label}
        </button>
      </div>
      <pre className="bb-help__snippet-pre"><code>{item.code}</code></pre>
    </div>
  );
}

function HelpItem({
  item,
  onInsertSnippet,
  onReplaceEditor,
}: {
  item: SectionItem;
  onInsertSnippet?: (snippet: string) => void;
  onReplaceEditor?: (text: string) => void;
}): ReactNode {
  switch (item.kind) {
    case 'text':
      return <div className="bb-help__text">{item.text}</div>;
    case 'shortcut':
      return <ShortcutItem item={item} />;
    case 'snippet':
    case 'song':
      return (
        <SnippetItem
          item={item}
          onInsertSnippet={onInsertSnippet}
          onReplaceEditor={onReplaceEditor}
        />
      );
  }
}

function HelpSection({
  hideHeader,
  onInsertSnippet,
  onReplaceEditor,
  query,
  section,
  twoColumns,
}: {
  hideHeader: boolean;
  onInsertSnippet?: (snippet: string) => void;
  onReplaceEditor?: (text: string) => void;
  query: string;
  section: Section;
  twoColumns: boolean;
}): ReactNode {
  const [collapsed, setCollapsed] = useState(false);
  const visibleItems = query
    ? section.content.filter((item) => itemMatches(item, query))
    : section.content;

  if (query && visibleItems.length === 0) return null;

  return (
    <div className="bb-help__section" data-section-id={section.id}>
      {!hideHeader ? (
        <button
          aria-expanded={!collapsed}
          className="bb-help__section-header"
          onClick={() => setCollapsed((value) => !value)}
          type="button"
        >
          <span className="bb-help__section-arrow">{collapsed ? '>' : 'v'}</span> {section.title}
        </button>
      ) : null}
      <div
        className={`bb-help__section-body${twoColumns ? ' bb-help__section-body--two-col' : ''}`}
        style={!hideHeader && collapsed ? { display: 'none' } : undefined}
      >
        {visibleItems.map((item, index) => (
          <HelpItem
            key={`${section.id}-${item.kind}-${index}`}
            item={item}
            onInsertSnippet={onInsertSnippet}
            onReplaceEditor={onReplaceEditor}
          />
        ))}
      </div>
    </div>
  );
}

function DesktopHelpPanel({
  defaultVisible = false,
  embedded = false,
  eventBus,
  getShortcuts,
  hideHeader = false,
  onInsertSnippet,
  onReplaceEditor,
  panelRef,
  singleSection,
  twoColumns = false,
}: DesktopHelpPanelProps): ReactNode {
  const [visible, setVisible] = useState(defaultVisible);
  const [query, setQuery] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [helpContext, setHelpContext] = useState<HelpContext>({
    currentChip: 'gameboy',
    currentSongChip: 'gameboy',
  });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);
  const toggle = useCallback(() => setVisible((value) => !value), []);
  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);
  const showShortcuts = useCallback(() => {
    setQuery('');
    setVisible(true);
    window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>('[data-section-id="shortcuts"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  useImperativeHandle(panelRef, () => ({
    show,
    hide,
    toggle,
    isVisible: () => visibleRef.current,
    showShortcuts,
    refresh,
    dispose: () => undefined,
  }), [hide, refresh, show, showShortcuts, toggle]);

  useEffect(() => {
    return eventBus.on('parse:success', ({ ast }) => {
      const raw = String((ast as { chip?: string } | undefined)?.chip ?? 'gameboy').toLowerCase();
      const chip = chipRegistry.resolve(raw);
      const chipRegionRaw = (ast as { chipRegion?: unknown } | undefined)?.chipRegion;
      const chipRegion = chipRegionRaw != null && chipRegionRaw !== ''
        ? String(chipRegionRaw).toLowerCase()
        : undefined;

      setHelpContext((current) => {
        if (
          current.currentChip === chip
          && current.currentSongChip === raw
          && current.currentSongChipRegion === chipRegion
        ) {
          return current;
        }
        return {
          currentChip: chip,
          currentSongChip: raw,
          currentSongChipRegion: chipRegion,
        };
      });
    });
  }, [eventBus]);

  useEffect(() => {
    if (embedded) return undefined;

    const unsubPanel = eventBus.on('panel:toggled', ({ panel, visible: nextVisible }) => {
      if (panel !== 'help') return;
      setVisible(nextVisible);
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && visibleRef.current) {
        event.preventDefault();
        setVisible(false);
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      unsubPanel();
      document.removeEventListener('keydown', onKey);
    };
  }, [embedded, eventBus]);

  const sections = useMemo(() => {
    void refreshVersion;
    let next = buildSections(getShortcuts, helpContext);
    if (singleSection) {
      next = next.filter((section) => section.id === singleSection);
    }
    return next;
  }, [getShortcuts, helpContext, refreshVersion, singleSection]);

  const hasSearchResults = sections.some((section) => section.content.some((item) => itemMatches(item, query)));

  if (!embedded && !visible) {
    return null;
  }

  return (
    <div
      className="bb-help"
      ref={rootRef}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {!embedded ? (
        <div className="bb-help__header">
          <span className="bb-help__title">Help &amp; Reference</span>
          <button className="bb-help__close" onClick={hide} title="Close help (Esc)" type="button">x</button>
        </div>
      ) : null}
      {!singleSection ? (
        <div className="bb-help__search-bar">
          <input
            aria-label="Search documentation"
            className="bb-help__search"
            onChange={(event) => setQuery(event.currentTarget.value.toLowerCase())}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.stopPropagation();
                setQuery('');
              }
            }}
            placeholder="Search docs..."
            type="text"
            value={query}
          />
          <button
            className="bb-help__search-clear"
            onClick={() => setQuery('')}
            title="Clear search"
            type="button"
          >
            x
          </button>
        </div>
      ) : null}
      <div className="bb-help__body">
        {sections.map((section) => (
          <HelpSection
            key={section.id}
            hideHeader={hideHeader}
            onInsertSnippet={onInsertSnippet}
            onReplaceEditor={onReplaceEditor}
            query={query}
            section={section}
            twoColumns={twoColumns}
          />
        ))}
        {query && !hasSearchResults ? <div className="bb-help__empty">No results for "{query}"</div> : null}
      </div>
    </div>
  );
}

export function createDesktopHelpPanel(
  container: HTMLElement,
  options: DesktopHelpPanelOptions,
): DesktopHelpPanelHandle {
  const handleRef = { current: null as DesktopHelpPanelHandle | null };
  let root: Root | null = createRoot(container);

  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.height = '100%';
  container.style.overflow = 'hidden';

  flushSync(() => {
    root?.render(
      <DesktopHelpPanel
        {...options}
        panelRef={(handle) => {
          handleRef.current = handle;
        }}
      />,
    );
  });

  const callWhenReady = (call: (handle: DesktopHelpPanelHandle) => void) => {
    if (handleRef.current) {
      call(handleRef.current);
      return;
    }
    window.queueMicrotask(() => {
      if (handleRef.current) call(handleRef.current);
    });
  };

  return {
    show: () => callWhenReady((handle) => handle.show()),
    hide: () => callWhenReady((handle) => handle.hide()),
    toggle: () => callWhenReady((handle) => handle.toggle()),
    isVisible: () => handleRef.current?.isVisible() ?? false,
    showShortcuts: () => callWhenReady((handle) => handle.showShortcuts()),
    refresh: () => callWhenReady((handle) => handle.refresh()),
    dispose: () => {
      handleRef.current?.dispose();
      if (root) {
        root.unmount();
        root = null;
      }
    },
  };
}
