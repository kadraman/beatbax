import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { Root } from 'react-dom/client';
import { chipRegistry } from '@beatbax/engine/chips';
import {
  formatInstrumentFieldValue,
  formatMacro,
  generateWaveformPreset,
  listInstrumentNoteOptions,
  listUgeNoteOptions,
  parseInstrumentBody,
  parseMacro,
  parseWaveTable,
  samplesToHex,
  serializeInstrument,
  type ChipInstrumentEditor,
  type ChipInstrumentMacroDef,
  type InstrumentNode,
  type ValidationError,
} from '@beatbax/engine';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import { fieldApplies, resolveInstrumentEditorSchema } from '@beatbax/app-core/editor/instrument-editor-schema';
import {
  collectLocalInstNames,
  deleteInstLine,
  insertInstLine,
  instIsReferenced,
  isValidInstName,
  renameInstrumentInSource,
  replaceInstLine,
  uniqueInstName,
} from '@beatbax/app-core/editor/instrument-editor-writeback';
import { icon } from '../../utils/icons';
import { mountReactRoot, unmountReactRoot } from '../../utils/react-root';
import { useStoreValue } from '../../hooks/useStoreValue';
import { NoteText, SectionHeading, ToggleRow } from '../settings/form';
import { MidiStepEntryService } from '@beatbax/app-core/input/midi-step-entry';
import {
  settingMidiInputDevice,
  settingMidiInputEnabled,
} from '@beatbax/app-core/stores/settings.store';

const BEATBAX_NOTE_OPTIONS = listInstrumentNoteOptions();
const UGE_NOTE_OPTIONS = listUgeNoteOptions();
const COMPACT_PROP_NAMES = new Set(['note', 'uge_note', 'gm']);

function isCompactPropField(field: { name: string; widget: string }): boolean {
  return COMPACT_PROP_NAMES.has(field.name)
    || field.widget === 'note'
    || field.widget === 'uge_note';
}

function CompactPropField({
  id,
  label,
  hint,
  disabled,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label
      className={`bb-inst-editor__compact-field${disabled ? ' is-disabled' : ''}`}
      htmlFor={id}
      title={hint}
    >
      <span className="bb-inst-editor__compact-label">{label}</span>
      {children}
    </label>
  );
}

/** Sensible default `inst` name from chip type (never the keyword `inst`). */
function defaultNewInstBaseName(type: string | undefined): string {
  switch ((type ?? '').toLowerCase()) {
    case 'wave':
      return 'wave';
    case 'triangle':
      return 'bass';
    case 'noise':
      return 'noise';
    case 'dmc':
      return 'sample';
    default:
      return 'lead';
  }
}

function macroIsDefined(draft: InstrumentNode, name: string): boolean {
  const parsed = parseMacro(draft[name]);
  return Boolean(parsed && parsed.values.length > 0);
}

/** Example sequence written when the user adds a supported macro. */
function defaultMacroExample(def: ChipInstrumentMacroDef): string {
  switch (def.name) {
    case 'arp_env':
      return '[0,4,7|0]';
    case 'pitch_env':
      return '[0,-1,-2,-4]';
    case 'duty_env':
      return '[2,2,1,1,0]';
    case 'noise_rate_env':
      return '[0,1,2,2]';
    case 'vol_env':
      if ((def.hint ?? '').toLowerCase().includes('attenuat')) return '[0,2,4,8,12,15]';
      return '[15,12,8,4,0]';
    default: {
      if (def.signed) return '[0,4,7|0]';
      const hi = def.max;
      const mid = Math.round((def.min + def.max) / 2);
      return `[${hi},${mid},${def.min}]`;
    }
  }
}

function macroToFieldText(values: number[], loopPoint: number): string | undefined {
  return formatMacro({ values, loopPoint }) ?? undefined;
}

export interface DesktopInstrumentEditorHandle {
  show: () => void;
  hide: () => void;
  selectInstrument: (name: string) => void;
  getSelectedName: () => string | null;
  setAst: (ast: any) => void;
  dispose: () => void;
}

export interface DesktopInstrumentEditorOptions {
  eventBus: EventBus;
  getSource: () => string;
  applySource: (next: string) => void;
  revealInst: (name: string | null, opts?: { focus?: boolean; reveal?: boolean }) => void;
  previewNote: (instName: string, note: string) => void;
  stopPreview: () => void;
  isMidiRecordArmed?: () => boolean;
}

const PIANO_SLOTS: Array<{
  white: { key: string; degree: string };
  black?: { key: string; degree: string };
}> = [
  { white: { key: 'a', degree: 'C' }, black: { key: 'w', degree: 'C#' } },
  { white: { key: 's', degree: 'D' }, black: { key: 'e', degree: 'D#' } },
  { white: { key: 'd', degree: 'E' } },
  { white: { key: 'f', degree: 'F' }, black: { key: 't', degree: 'F#' } },
  { white: { key: 'g', degree: 'G' }, black: { key: 'y', degree: 'G#' } },
  { white: { key: 'h', degree: 'A' }, black: { key: 'u', degree: 'A#' } },
  { white: { key: 'j', degree: 'B' } },
];

const PIANO_OCTAVE_MIN = 2;
const PIANO_OCTAVE_MAX = 7;

function pianoNote(degree: string, octave: number): string {
  return `${degree}${octave}`;
}

function octaveFromNoteName(note: string): number | null {
  const m = /^[A-Ga-g][#b]?(-?\d+)$/.exec(note.trim());
  if (!m) return null;
  const oct = Number(m[1]);
  return Number.isFinite(oct) ? oct : null;
}

function pianoBindings(octave: number): Array<{ key: string; note: string }> {
  const out: Array<{ key: string; note: string }> = [];
  for (const slot of PIANO_SLOTS) {
    out.push({ key: slot.white.key, note: pianoNote(slot.white.degree, octave) });
    if (slot.black) out.push({ key: slot.black.key, note: pianoNote(slot.black.degree, octave) });
  }
  return out;
}

function cloneInst(node: InstrumentNode | undefined): InstrumentNode {
  return node ? JSON.parse(JSON.stringify(node)) : {};
}

function validateDraft(chip: string, draft: InstrumentNode): ValidationError[] {
  const plugin = chipRegistry.get(chipRegistry.resolve(chip));
  return plugin?.validateInstrument(draft) ?? [];
}

interface Props extends DesktopInstrumentEditorOptions {
  panelRef: Ref<DesktopInstrumentEditorHandle>;
}

function DesktopInstrumentEditor({
  panelRef,
  eventBus,
  getSource,
  applySource,
  revealInst,
  previewNote,
  stopPreview,
}: Props): React.JSX.Element {
  const [ast, setAst] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<InstrumentNode>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [playWhileDrawing, setPlayWhileDrawing] = useState(true);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [pianoOctave, setPianoOctave] = useState(4);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameUpdateRefs, setRenameUpdateRefs] = useState(true);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBounds, setRenameBounds] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const lastPreviewNote = useRef('C4');
  const selectedRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  selectedRef.current = selected;

  const chip = String(ast?.chip ?? 'gameboy').toLowerCase();
  const schema: ChipInstrumentEditor = useMemo(() => resolveInstrumentEditorSchema(chip), [chip]);
  // Read live source each render so New/Delete update locality before parse:success.
  const localNames = collectLocalInstNames(getSource());
  const instNames = Object.keys(ast?.insts ?? {});
  // Keep a just-created name visible before parse:success updates the AST.
  const pickerNames = selected && !instNames.includes(selected)
    ? [...instNames, selected]
    : instNames;
  const selectedLocal = selected ? localNames.has(selected) : false;
  const fieldOrder = schema.fields.map((f) => f.name);

  const loadInst = useCallback((name: string, nextAst = ast, opts?: { focus?: boolean }) => {
    setSelected(name);
    setDraft(cloneInst(nextAst?.insts?.[name]));
    setErrors([]);
    revealInst(name, { focus: opts?.focus !== false, reveal: true });
  }, [ast, revealInst]);

  useImperativeHandle(panelRef, () => ({
    show: () => {},
    hide: () => {},
    selectInstrument: (name) => loadInst(name, ast, { focus: false }),
    getSelectedName: () => selectedRef.current,
    setAst: (next) => {
      setAst(next);
      setSelected((cur) => {
        const names = Object.keys(next?.insts ?? {});
        if (cur && names.includes(cur)) {
          setDraft(cloneInst(next.insts[cur]));
          revealInst(cur, { focus: false, reveal: false });
          return cur;
        }
        const first = names[0] ?? null;
        if (first) {
          setDraft(cloneInst(next.insts[first]));
          revealInst(first, { focus: false, reveal: false });
        } else {
          setDraft({});
          revealInst(null);
        }
        return first;
      });
    },
    dispose: () => {
      revealInst(null);
    },
  }), [ast, loadInst, revealInst]);

  useEffect(() => {
    return eventBus.on('parse:success', ({ ast: next, ephemeral }) => {
      if (ephemeral) return;
      setAst(next);
      setSelected((cur) => {
        const names = Object.keys(next?.insts ?? {});
        if (cur && names.includes(cur)) {
          setDraft(cloneInst(next.insts[cur]));
          revealInst(cur, { focus: false, reveal: false });
          return cur;
        }
        const first = names[0] ?? null;
        if (first) {
          setDraft(cloneInst(next.insts[first]));
          revealInst(first, { focus: false, reveal: false });
        } else {
          setDraft({});
          revealInst(null);
        }
        return first;
      });
    });
  }, [eventBus, revealInst]);

  useEffect(() => {
    return eventBus.on('instrument-editor:open', ({ name }) => {
      loadInst(name, ast, { focus: true });
    });
  }, [ast, eventBus, loadInst]);

  useEffect(() => {
    return eventBus.on('instrument-editor:audition', ({ note }) => {
      if (!note) {
        setActiveNote(null);
        return;
      }
      const oct = octaveFromNoteName(note);
      if (oct != null && oct >= PIANO_OCTAVE_MIN && oct <= PIANO_OCTAVE_MAX) {
        setPianoOctave(oct);
      }
      setActiveNote(note);
      lastPreviewNote.current = note;
    });
  }, [eventBus]);

  const writeDraft = useCallback((next: InstrumentNode) => {
    setDraft(next);
    if (!selected || !selectedLocal) return;
    const issues = validateDraft(chip, next);
    setErrors(issues);
    if (issues.length) return;
    const { next: source, ok } = replaceInstLine(getSource(), selected, next, fieldOrder);
    if (ok) {
      applySource(source);
      // setValue clears decorations — refresh highlight without stealing panel focus.
      revealInst(selected, { focus: false, reveal: false });
    }
  }, [applySource, chip, fieldOrder, getSource, revealInst, selected, selectedLocal]);

  const patch = (partial: Partial<InstrumentNode>) => {
    writeDraft({ ...draft, ...partial });
  };

  const instType = String(draft.type ?? schema.types[0]?.id ?? '');

  const onNew = () => {
    const preset = schema.presets[0];
    const body = preset?.content ?? `type=${schema.types[0]?.id ?? 'pulse1'}`;
    const type = preset?.type ?? schema.types[0]?.id;
    const name = uniqueInstName(defaultNewInstBaseName(type), localNames);
    const serialized = `inst ${name} ${body.replace(/^inst\s+\S+\s+/i, '')}`;
    const afterName = selectedLocal && selected ? selected : undefined;
    applySource(insertInstLine(getSource(), serialized, afterName));
    setSelected(name);
    setDraft(parseInstrumentBody(body));
    setErrors([]);
    revealInst(name, { focus: true, reveal: true });
  };

  const onDuplicate = () => {
    if (!selected) return;
    const name = uniqueInstName(selected, localNames);
    const { next } = replaceInstLine(
      insertInstLine(getSource(), serializeInstrument(name, { ...draft }), selected),
      name,
      { ...draft, __loc: undefined },
      fieldOrder,
    );
    applySource(next);
    setSelected(name);
    revealInst(name, { focus: true, reveal: true });
  };

  const onDelete = () => {
    if (!selected || !selectedLocal) return;
    if (instIsReferenced(getSource(), selected)
      && !window.confirm(`Instrument '${selected}' is still referenced. Delete anyway?`)) {
      return;
    }
    applySource(deleteInstLine(getSource(), selected));
    setSelected(null);
    setDraft({});
    setErrors([]);
    revealInst(null);
  };

  const onRename = () => {
    if (!selected || !selectedLocal) return;
    setRenameValue(selected);
    setRenameUpdateRefs(true);
    setRenameError(null);
    setRenameOpen(true);
  };

  const closeRename = () => {
    setRenameOpen(false);
    setRenameError(null);
  };

  const commitRename = () => {
    if (!selected || !selectedLocal) return;
    const nextName = renameValue.trim();
    if (!nextName || nextName === selected) {
      closeRename();
      return;
    }
    if (!isValidInstName(nextName)) {
      setRenameError('Use letters, digits, underscore, or hyphen only.');
      return;
    }
    if (localNames.has(nextName)) {
      setRenameError(`Name '${nextName}' is already used.`);
      return;
    }
    const synced = replaceInstLine(getSource(), selected, draft, fieldOrder);
    if (!synced.ok) return;
    const { next, ok } = renameInstrumentInSource(synced.next, selected, nextName, {
      updateReferences: renameUpdateRefs,
    });
    if (!ok) return;
    applySource(next);
    setSelected(nextName);
    closeRename();
    revealInst(nextName, { focus: true, reveal: true });
  };

  useEffect(() => {
    if (!renameOpen) return;
    const id = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRename();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [renameOpen]);

  useLayoutEffect(() => {
    if (!renameOpen) {
      setRenameBounds(null);
      return;
    }
    const syncBounds = () => {
      const el = bodyRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRenameBounds({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    syncBounds();
    window.addEventListener('resize', syncBounds);
    // Right-pane drag-resize does not always fire window resize.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncBounds) : null;
    if (bodyRef.current) ro?.observe(bodyRef.current);
    return () => {
      window.removeEventListener('resize', syncBounds);
      ro?.disconnect();
    };
  }, [renameOpen]);

  const applyPreset = (content: string) => {
    const parsed = parseInstrumentBody(content);
    // Presets are full instrument snippets — replace the body so type-specific
    // leftovers (e.g. wave= after switching to pulse) do not remain.
    writeDraft({ ...parsed, __loc: draft.__loc });
  };

  const copyFrom = (name: string) => {
    const src = ast?.insts?.[name];
    if (!src) return;
    const { note: _n, gm: _g, __loc, subpatRows, ...rest } = cloneInst(src);
    writeDraft({
      ...rest,
      __loc: draft.__loc,
      ...(draft.note !== undefined ? { note: draft.note } : {}),
      ...(draft.gm !== undefined ? { gm: draft.gm } : {}),
    });
  };

  const copyImported = () => {
    if (!selected) return;
    const name = uniqueInstName(selected, localNames);
    const { next } = replaceInstLine(
      insertInstLine(getSource(), `inst ${name} type=${instType}`),
      name,
      { ...draft, __loc: undefined },
      fieldOrder,
    );
    applySource(next);
    setSelected(name);
    revealInst(name, { focus: true, reveal: true });
  };

  const playNote = (note: string) => {
    if (!selected) return;
    lastPreviewNote.current = note;
    setActiveNote(note);
    previewNote(selected, note);
  };

  const releaseNote = () => {
    setActiveNote(null);
    stopPreview();
  };

  const shiftPianoOctave = useCallback((delta: number) => {
    setPianoOctave((o) => Math.max(PIANO_OCTAVE_MIN, Math.min(PIANO_OCTAVE_MAX, o + delta)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (!bodyRef.current?.closest('.bb-right-tab-content--active')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'x') {
        if (e.type === 'keydown' && !e.repeat) {
          e.preventDefault();
          shiftPianoOctave(key === 'z' ? -1 : 1);
        }
        return;
      }
      const found = pianoBindings(pianoOctave).find((k) => k.key === key);
      if (!found) return;
      e.preventDefault();
      if (e.type === 'keydown' && !e.repeat) playNote(found.note);
      if (e.type === 'keyup') releaseNote();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  });

  const waveDef = schema.waveform && fieldApplies(schema.waveform.whenType, instType)
    ? schema.waveform
    : undefined;
  const waveSamples = waveDef
    ? parseWaveTable(draft[waveDef.field] ?? new Array(waveDef.length).fill(0))
    : [];
  const subpatSet = typeof draft.subpat === 'string' && draft.subpat.trim().length > 0;
  const quietWave = waveDef && waveSamples.length && Math.max(...waveSamples) < waveDef.max;
  const visibleFields = schema.fields.filter((f) => fieldApplies(f.whenType, instType));

  const clearOrSetField = (name: string, next: string) => {
    if (!next) {
      const cleared = { ...draft };
      delete cleared[name];
      writeDraft(cleared);
      return;
    }
    patch({ [name]: next });
  };

  const renderCompactField = (field: (typeof visibleFields)[number]) => {
    const value = formatInstrumentFieldValue(field.name, draft[field.name]);
    const fieldId = `bb-inst-field-${field.name}`;
    if (field.widget === 'note' || field.widget === 'uge_note') {
      const options = field.widget === 'uge_note' ? UGE_NOTE_OPTIONS : BEATBAX_NOTE_OPTIONS;
      const opts = value && !options.includes(value) ? [value, ...options] : options;
      return (
        <CompactPropField
          key={field.name}
          id={fieldId}
          label={field.label}
          hint={field.hint}
          disabled={!selectedLocal}
        >
          <select
            id={fieldId}
            className="bb-settings-select bb-inst-editor__compact-control"
            disabled={!selectedLocal}
            value={value}
            onChange={(e) => clearOrSetField(field.name, e.target.value)}
          >
            <option value="">—</option>
            {opts.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </CompactPropField>
      );
    }
    return (
      <CompactPropField
        key={field.name}
        id={fieldId}
        label={field.label}
        hint={field.hint}
        disabled={!selectedLocal}
      >
        <input
          id={fieldId}
          className="bb-settings-number bb-inst-editor__compact-control"
          disabled={!selectedLocal}
          type="number"
          min={field.min ?? 0}
          max={field.max ?? 127}
          value={value}
          onChange={(e) => clearOrSetField(field.name, e.target.value)}
        />
      </CompactPropField>
    );
  };

  const renderMainField = (field: (typeof visibleFields)[number]) => {
    const raw = draft[field.name];
    const value = formatInstrumentFieldValue(field.name, raw);
    const fieldId = `bb-inst-field-${field.name}`;
    if (field.widget === 'bool') {
      return (
        <ToggleRow
          key={field.name}
          checked={value === 'true' || value === '1'}
          disabled={!selectedLocal}
          label={field.label}
          title={field.hint}
          onChange={(checked) => patch({ [field.name]: checked ? 'true' : 'false' })}
        />
      );
    }
    return (
      <div className="bb-settings-row" key={field.name} title={field.hint}>
        <label className="bb-settings-label" htmlFor={fieldId}>{field.label}</label>
        {field.widget === 'enum' && field.values ? (
          <select
            id={fieldId}
            className="bb-settings-select bb-inst-editor__grow"
            disabled={!selectedLocal}
            value={value}
            onChange={(e) => patch({ [field.name]: e.target.value })}
          >
            <option value="">—</option>
            {field.values.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ) : (
          <input
            id={fieldId}
            className={field.widget === 'int' ? 'bb-settings-number' : 'bb-settings-text bb-inst-editor__grow'}
            disabled={!selectedLocal || field.name === 'subpat'}
            type={field.widget === 'int' ? 'number' : 'text'}
            min={field.min}
            max={field.max}
            value={value}
            onChange={(e) => patch({ [field.name]: e.target.value })}
          />
        )}
      </div>
    );
  };

  /** Preserve schema field order; emit note/gm/uge_note as one compact row where they appear. */
  const propertyFieldNodes: React.ReactNode[] = [];
  for (let i = 0; i < visibleFields.length; ) {
    const field = visibleFields[i]!;
    if (isCompactPropField(field)) {
      const group: typeof visibleFields = [];
      while (i < visibleFields.length && isCompactPropField(visibleFields[i]!)) {
        group.push(visibleFields[i]!);
        i += 1;
      }
      propertyFieldNodes.push(
        <div
          key={`compact-${group.map((f) => f.name).join('-')}`}
          className="bb-inst-editor__compact-row"
          role="group"
          aria-label="Note and program"
        >
          {group.map(renderCompactField)}
        </div>,
      );
      continue;
    }
    propertyFieldNodes.push(renderMainField(field));
    i += 1;
  }

  return (
    <div className={`bb-inst-editor${renameOpen ? ' is-dialog-open' : ''}`} ref={bodyRef}>
      <div className="bb-inst-editor__toolbar" role="toolbar" aria-label="Instrument actions">
        <button
          type="button"
          className="bb-inst-editor__toolbar-btn"
          aria-label="New instrument"
          title="New instrument"
          onClick={onNew}
          dangerouslySetInnerHTML={{ __html: icon('plus', 'w-3.5 h-3.5') }}
        />
        <button
          type="button"
          className="bb-inst-editor__toolbar-btn"
          aria-label="Duplicate instrument"
          title="Duplicate instrument"
          aria-disabled={!selectedLocal ? 'true' : undefined}
          disabled={!selectedLocal}
          onClick={onDuplicate}
          dangerouslySetInnerHTML={{ __html: icon('document-duplicate', 'w-3.5 h-3.5') }}
        />
        <button
          type="button"
          className="bb-inst-editor__toolbar-btn"
          aria-label="Rename instrument"
          title="Rename instrument"
          aria-disabled={!selectedLocal ? 'true' : undefined}
          disabled={!selectedLocal}
          onClick={onRename}
          dangerouslySetInnerHTML={{ __html: icon('pencil', 'w-3.5 h-3.5') }}
        />
        <button
          type="button"
          className="bb-inst-editor__toolbar-btn"
          aria-label="Delete instrument"
          title="Delete instrument"
          aria-disabled={!selectedLocal ? 'true' : undefined}
          disabled={!selectedLocal}
          onClick={onDelete}
          dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }}
        />
      </div>
      {renameOpen && selected && renameBounds
        ? createPortal(
          <div
            className="bb-inst-editor__dialog-backdrop"
            role="presentation"
            style={{
              position: 'fixed',
              top: renameBounds.top,
              left: renameBounds.left,
              width: renameBounds.width,
              height: renameBounds.height,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeRename();
            }}
          >
            <form
              className="bb-inst-editor__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bb-inst-rename-title"
              onSubmit={(e) => {
                e.preventDefault();
                commitRename();
              }}
            >
              <div className="bb-inst-editor__dialog-header">
                <span id="bb-inst-rename-title" className="bb-inst-editor__dialog-title">
                  Rename instrument
                </span>
                <button
                  type="button"
                  className="bb-inst-editor__dialog-close"
                  aria-label="Close"
                  onClick={closeRename}
                >
                  ✕
                </button>
              </div>
              <div className="bb-inst-editor__dialog-body">
                <label className="bb-inst-editor__dialog-label" htmlFor="bb-inst-rename-input">
                  New name
                </label>
                <input
                  ref={renameInputRef}
                  id="bb-inst-rename-input"
                  className="bb-settings-text bb-inst-editor__dialog-input"
                  value={renameValue}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => {
                    setRenameValue(e.target.value);
                    setRenameError(null);
                  }}
                />
                <label className="bb-inst-editor__dialog-check">
                  <input
                    type="checkbox"
                    checked={renameUpdateRefs}
                    onChange={(e) => setRenameUpdateRefs(e.target.checked)}
                  />
                  <span>Rename all instances in editor</span>
                </label>
                {renameError ? (
                  <p className="bb-inst-editor__dialog-error" role="alert">{renameError}</p>
                ) : null}
              </div>
              <div className="bb-inst-editor__dialog-footer">
                <button type="button" className="bb-settings-btn-secondary" onClick={closeRename}>
                  Cancel
                </button>
                <button type="submit" className="bb-settings-btn-primary">
                  Rename
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )
        : null}
      <div className="bb-inst-editor__body">
        <div className="bb-inst-editor__picker bb-settings-row">
          <label className="bb-settings-label" htmlFor="bb-inst-picker">Instrument</label>
          <select
            id="bb-inst-picker"
            className="bb-settings-select bb-inst-editor__grow"
            aria-label="Select instrument"
            disabled={!pickerNames.length}
            value={selected ?? ''}
            onChange={(e) => {
              const name = e.target.value;
              if (!name) return;
              loadInst(name, ast, { focus: true });
            }}
          >
            {!pickerNames.length ? <option value="">No instruments</option> : null}
            {pickerNames.map((name) => {
              const type = String(ast?.insts?.[name]?.type ?? (name === selected ? draft.type : '') ?? '');
              const imported = !localNames.has(name);
              const suffix = [type, imported ? 'imported' : ''].filter(Boolean).join(' · ');
              return (
                <option key={name} value={name}>
                  {suffix ? `${name} (${suffix})` : name}
                </option>
              );
            })}
          </select>
        </div>

        {selected && !selectedLocal ? (
          <div className="bb-inst-editor__banner bb-settings-warning">
            <span>Imported instruments are read-only.</span>
            <button type="button" className="bb-settings-btn-secondary" onClick={copyImported}>
              Copy into song
            </button>
          </div>
        ) : null}

        {selected ? (
          <div className="bb-settings-section">
            <SectionHeading>Templates</SectionHeading>
            <div className="bb-settings-row">
              <label className="bb-settings-label" htmlFor="bb-inst-template">Template</label>
              <select
                id="bb-inst-template"
                className="bb-settings-select bb-inst-editor__grow"
                defaultValue=""
                disabled={!selectedLocal}
                onChange={(e) => { if (e.target.value) applyPreset(e.target.value); e.target.value = ''; }}
              >
                <option value="">Plugin presets…</option>
                {schema.presets.map((p) => (
                  <option key={p.id} value={p.content}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="bb-settings-row">
              <label className="bb-settings-label" htmlFor="bb-inst-copy-from">Copy from</label>
              <select
                id="bb-inst-copy-from"
                className="bb-settings-select bb-inst-editor__grow"
                defaultValue=""
                disabled={!selectedLocal}
                onChange={(e) => { if (e.target.value) copyFrom(e.target.value); e.target.value = ''; }}
              >
                <option value="">Song instruments…</option>
                {instNames.filter((n) => n !== selected).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <SectionHeading>Properties</SectionHeading>
            <div className="bb-settings-row">
              <span className="bb-settings-label">Name</span>
              <input className="bb-settings-text bb-inst-editor__grow" value={selected} disabled readOnly />
            </div>
            <div className="bb-settings-row">
              <label className="bb-settings-label" htmlFor="bb-inst-type">Type</label>
              <select
                id="bb-inst-type"
                className="bb-settings-select bb-inst-editor__grow"
                disabled={!selectedLocal}
                value={instType}
                onChange={(e) => patch({ type: e.target.value })}
              >
                {schema.types.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            {propertyFieldNodes}

            {schema.constraints?.filter((c) => {
              if (!c.when) return true;
              const m = c.when.match(/type=([A-Za-z0-9_|-]+)/);
              if (!m) return true;
              return m[1].split('|').some((t) => t.toLowerCase() === instType.toLowerCase());
            }).map((c) => (
              <NoteText key={c.id}>{c.message}</NoteText>
            ))}

            {waveDef ? (
              <WaveformCanvas
                samples={waveSamples}
                def={waveDef}
                disabled={!selectedLocal}
                hex={samplesToHex(waveSamples.slice(0, waveDef.length))}
                quiet={Boolean(quietWave)}
                onChange={(samples) => {
                  patch({ [waveDef.field]: samples });
                  if (playWhileDrawing) playNote(lastPreviewNote.current);
                }}
                playWhileDrawing={playWhileDrawing}
                onTogglePlay={setPlayWhileDrawing}
              />
            ) : null}

            <MacroSection
              draft={draft}
              disabled={!selectedLocal || subpatSet}
              lockReason={
                !selectedLocal
                  ? 'Imported instruments are read-only. Copy into the song to edit macros.'
                  : subpatSet
                    ? `Software macros are supported, but editing is locked while native subpattern “${String(draft.subpat)}” is set.`
                    : null
              }
              macros={schema.macros.filter((m) => fieldApplies(m.whenType, instType))}
              onChange={(name, text) => {
                if (text === undefined) {
                  const next = { ...draft };
                  delete next[name];
                  writeDraft(next);
                  return;
                }
                patch({ [name]: text });
              }}
            />

            {errors.length ? (
              <ul className="bb-inst-editor__errors">
                {errors.map((err, i) => <li key={i}>{err.field}: {err.message}</li>)}
              </ul>
            ) : null}

            <SectionHeading>Preview</SectionHeading>
            <MidiPreviewStrip />
            <MiniKeyboard
              activeNote={activeNote}
              octave={pianoOctave}
              onOctaveChange={setPianoOctave}
              onDown={playNote}
              onUp={releaseNote}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WaveformCanvas({
  samples,
  def,
  disabled,
  hex,
  quiet,
  onChange,
  playWhileDrawing,
  onTogglePlay,
}: {
  samples: number[];
  def: NonNullable<ChipInstrumentEditor['waveform']>;
  disabled: boolean;
  hex: string;
  quiet: boolean;
  onChange: (samples: number[]) => void;
  playWhileDrawing: boolean;
  onTogglePlay: (v: boolean) => void;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const lastIdx = useRef(-1);

  const paintAt = (ev: ReactPointerEvent<HTMLCanvasElement>, shift: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const idx = Math.max(0, Math.min(def.length - 1, Math.floor((x / rect.width) * def.length)));
    const value = Math.round(def.max - (y / rect.height) * (def.max - def.min));
    const clamped = Math.max(def.min, Math.min(def.max, value));
    const next = samples.slice(0, def.length);
    while (next.length < def.length) next.push(0);
    if (shift && lastIdx.current >= 0) {
      const from = lastIdx.current;
      const a = Math.min(from, idx);
      const b = Math.max(from, idx);
      const fromVal = next[from];
      for (let i = a; i <= b; i++) {
        const t = b === a ? 1 : (i - from) / (idx - from || 1);
        next[i] = Math.round(fromVal + (clamped - fromVal) * Math.abs(t));
      }
    } else {
      next[idx] = clamped;
    }
    lastIdx.current = idx;
    onChange(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--bb-inst-wave-bg') || '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    const colW = w / def.length;
    const range = def.max - def.min || 1;
    ctx.fillStyle = '#6ee7b7';
    for (let i = 0; i < def.length; i++) {
      const v = samples[i] ?? def.min;
      const nh = ((v - def.min) / range) * h;
      ctx.fillRect(i * colW + 1, h - nh, Math.max(1, colW - 2), nh);
    }
  }, [samples, def]);

  return (
    <div className="bb-inst-editor__wave">
      <SectionHeading>Waveform</SectionHeading>
      <ToggleRow
        checked={playWhileDrawing}
        disabled={disabled}
        label="Play while drawing"
        onChange={onTogglePlay}
      />
      <canvas
        ref={canvasRef}
        width={320}
        height={96}
        className="bb-inst-editor__wave-canvas"
        onPointerDown={(e) => { painting.current = true; (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); paintAt(e, e.shiftKey); }}
        onPointerMove={(e) => { if (painting.current) paintAt(e, e.shiftKey); }}
        onPointerUp={() => { painting.current = false; }}
      />
      <div className="bb-inst-editor__wave-meta">
        <code className="bb-inst-editor__hex">{hex}</code>
        {quiet ? <NoteText>Peak is below max — wavetable may sound quiet.</NoteText> : null}
      </div>
      <div className="bb-inst-editor__wave-presets">
        {(def.presets ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            className="bb-settings-btn-secondary"
            disabled={disabled}
            onClick={() => {
              const samples = typeof p.samples === 'string'
                ? generateWaveformPreset(p.samples, def.length, def.min, def.max)
                : p.samples.slice(0, def.length);
              onChange(samples);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="bb-settings-row">
        <label className="bb-settings-label" htmlFor="bb-inst-wave-hex">Hex</label>
        <input
          id="bb-inst-wave-hex"
          className="bb-settings-text bb-inst-editor__grow"
          disabled={disabled || !def.hexImport}
          defaultValue={hex}
          key={hex}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (/^[0-9A-Fa-f]{32}$/.test(v)) onChange(parseWaveTable(v));
          }}
        />
      </div>
    </div>
  );
}

function MacroSection({
  macros,
  draft,
  disabled,
  lockReason,
  onChange,
}: {
  macros: ChipInstrumentMacroDef[];
  draft: InstrumentNode;
  disabled: boolean;
  /** When set, macros are supported but temporarily non-editable. */
  lockReason?: string | null;
  onChange: (name: string, text: string | undefined) => void;
}): React.JSX.Element | null {
  const defined = useMemo(
    () => macros.filter((m) => macroIsDefined(draft, m.name)),
    [macros, draft],
  );
  const available = useMemo(
    () => macros.filter((m) => !macroIsDefined(draft, m.name)),
    [macros, draft],
  );
  const definedKey = defined.map((m) => m.name).join(',');
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!defined.length) {
      setActive(null);
      return;
    }
    setActive((cur) => (cur && defined.some((m) => m.name === cur) ? cur : defined[0].name));
  }, [defined, definedKey]);

  if (!macros.length) return null;

  const activeDef = defined.find((m) => m.name === active) ?? null;
  const parsed = activeDef ? parseMacro(draft[activeDef.name]) : null;
  const supportedLabels = macros.map((m) => m.label).join(', ');

  return (
    <div className="bb-inst-editor__macros">
      <div className="bb-inst-editor__macros-header">
        <SectionHeading>Macros</SectionHeading>
        {available.length ? (
          <div className="bb-inst-editor__macro-add" role="group" aria-label="Add macro">
            {available.map((macro) => (
              <button
                key={macro.name}
                type="button"
                className="bb-inst-editor__macro-add-btn"
                title={
                  disabled
                    ? (lockReason ?? `Add ${macro.label} macro`)
                    : `Add ${macro.label} macro`
                }
                aria-label={`Add ${macro.label} macro`}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onChange(macro.name, defaultMacroExample(macro));
                  setActive(macro.name);
                }}
              >
                <span dangerouslySetInnerHTML={{ __html: icon('plus', 'w-3 h-3') }} />
                <span>{macro.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {lockReason ? <NoteText>{lockReason}</NoteText> : null}

      {defined.length ? (
        <div className="bb-inst-editor__macro-tabs" role="tablist" aria-label="Instrument macros">
          {defined.map((macro) => (
            <button
              key={macro.name}
              type="button"
              role="tab"
              aria-selected={macro.name === active}
              className={`bb-inst-editor__macro-tab${macro.name === active ? ' is-active' : ''}`}
              onClick={() => setActive(macro.name)}
            >
              {macro.label}{macro.kind === 'hardware' ? ' · hw' : ''}
            </button>
          ))}
        </div>
      ) : !lockReason ? (
        <NoteText>
          {available.length
            ? `No macros defined yet. Supported on this type: ${supportedLabels}.`
            : 'No macros defined.'}
        </NoteText>
      ) : null}

      {activeDef && parsed ? (
        <MacroRow
          def={activeDef}
          values={parsed.values}
          loopPoint={parsed.loopPoint}
          disabled={disabled}
          onChange={(values, loopPoint) => {
            if (!values.length) {
              onChange(activeDef.name, undefined);
              return;
            }
            onChange(activeDef.name, macroToFieldText(values, loopPoint));
          }}
          onRemove={disabled ? undefined : () => onChange(activeDef.name, undefined)}
        />
      ) : null}
    </div>
  );
}

function MacroRow({
  def,
  values,
  loopPoint,
  disabled,
  onChange,
  onRemove,
}: {
  def: ChipInstrumentMacroDef;
  values: number[];
  loopPoint: number;
  disabled: boolean;
  onChange: (values: number[], loopPoint: number) => void;
  onRemove?: () => void;
}): React.JSX.Element {
  const length = Math.max(1, values.length || 8);
  const display = values.length ? values : new Array(length).fill(def.signed ? 0 : def.min);
  return (
    <div className="bb-inst-editor__macro" title={def.hint}>
      <div className="bb-inst-editor__macro-head">
        <div className="bb-settings-row bb-inst-editor__macro-controls">
          <label className="bb-settings-label" htmlFor={`bb-macro-len-${def.name}`}>Len</label>
          <input
            id={`bb-macro-len-${def.name}`}
            className="bb-settings-number"
            type="number"
            min={1}
            max={64}
            disabled={disabled}
            value={values.length}
            onChange={(e) => {
              const n = Math.max(0, Number(e.target.value) || 0);
              if (n === 0) { onChange([], -1); return; }
              const next = display.slice(0, n);
              while (next.length < n) next.push(def.signed ? 0 : def.min);
              onChange(next, loopPoint >= n ? n - 1 : loopPoint);
            }}
          />
          {def.loop ? (
            <>
              <label className="bb-settings-label" htmlFor={`bb-macro-loop-${def.name}`}>Loop</label>
              <input
                id={`bb-macro-loop-${def.name}`}
                className="bb-settings-number"
                type="number"
                min={-1}
                max={Math.max(0, display.length - 1)}
                disabled={disabled || !values.length}
                value={loopPoint}
                onChange={(e) => onChange(values, Number(e.target.value))}
              />
            </>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              className="bb-settings-btn-secondary bb-inst-editor__macro-remove"
              title={`Remove ${def.label} macro`}
              aria-label={`Remove ${def.label} macro`}
              onClick={onRemove}
            >
              <span dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }} />
              Remove
            </button>
          ) : null}
        </div>
        {def.hint ? <NoteText>{def.hint}</NoteText> : null}
      </div>
      <div className="bb-inst-editor__macro-bars">
        {display.map((v, i) => {
          const pct = ((v - def.min) / (def.max - def.min || 1)) * 100;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              className={i === loopPoint ? 'is-loop' : ''}
              style={{ height: `${Math.max(8, pct)}%` }}
              onClick={(e) => {
                const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const nextVal = Math.round(def.max - (y / rect.height) * (def.max - def.min));
                const next = display.slice();
                next[i] = Math.max(def.min, Math.min(def.max, nextVal));
                onChange(next, loopPoint);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function midiController(): {
  listDevices?: () => Array<{ id: string; name: string }>;
  requestMidiAccess?: (force?: boolean) => Promise<string | null | void>;
  setEnabled?: (enabled: boolean) => Promise<void>;
  setDeviceById?: (deviceId: string) => void;
} | null {
  return (window as any).__beatbax_midiStepEntry ?? null;
}

function sameMidiDevices(
  a: Array<{ id: string; name: string }>,
  b: Array<{ id: string; name: string }>,
): boolean {
  return a.length === b.length && a.every((d, i) => d.id === b[i]?.id && d.name === b[i]?.name);
}

function MidiPreviewStrip(): React.JSX.Element {
  const midiEnabled = useStoreValue(settingMidiInputEnabled);
  const midiDevice = useStoreValue(settingMidiInputDevice);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const supported = MidiStepEntryService.isSupported();

  const refreshDevices = useCallback(async (force = false) => {
    if (!supported) {
      setDevices([]);
      return;
    }
    setRefreshing(true);
    try {
      const controller = midiController();
      await controller?.requestMidiAccess?.(force);
      const next = controller?.listDevices?.() ?? [];
      const selectedId = settingMidiInputDevice.get();
      if (
        selectedId
        && next.length > 0
        && !next.some((d) => d.id === selectedId)
      ) {
        if (controller?.setDeviceById) controller.setDeviceById('');
        else settingMidiInputDevice.set('');
      }
      setDevices((cur) => (sameMidiDevices(cur, next) ? cur : next));
    } finally {
      setRefreshing(false);
    }
  }, [supported]);

  useEffect(() => {
    if (midiEnabled) void refreshDevices();
    else setDevices([]);
  }, [midiEnabled, refreshDevices]);

  const selectedName = devices.find((d) => d.id === midiDevice)?.name;
  let status = 'Unsupported';
  if (supported) {
    if (!midiEnabled) status = 'MIDI off';
    else if (!midiDevice || !selectedName) status = devices.length ? 'No device' : 'No devices found';
    else status = `Ready · ${selectedName}`;
  }

  return (
    <div className="bb-inst-editor__midi-bar" role="group" aria-label="MIDI input">
      <label className="bb-inst-editor__midi-enable">
        <input
          type="checkbox"
          checked={midiEnabled && supported}
          disabled={!supported || refreshing}
          onChange={(e) => {
            const next = e.target.checked;
            const controller = midiController();
            if (controller?.setEnabled) {
              void controller.setEnabled(next).then(() => {
                if (next) void refreshDevices();
                else setDevices([]);
              });
              return;
            }
            settingMidiInputEnabled.set(next);
            if (next) void refreshDevices();
            else setDevices([]);
          }}
        />
        <span>MIDI</span>
      </label>
      <select
        className="bb-settings-select bb-inst-editor__midi-device"
        aria-label="MIDI input device"
        disabled={!supported || !midiEnabled || refreshing}
        value={midiDevice}
        onFocus={() => { if (midiEnabled) void refreshDevices(); }}
        onChange={(e) => {
          const id = e.target.value;
          settingMidiInputDevice.set(id);
          midiController()?.setDeviceById?.(id);
        }}
      >
        <option value="">
          {devices.length > 0 ? 'Select device…' : '(No MIDI devices)'}
        </option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <button
        type="button"
        className="bb-settings-btn-secondary bb-inst-editor__midi-refresh"
        title="Re-scan for MIDI devices"
        disabled={!supported || !midiEnabled || refreshing}
        onClick={() => { void refreshDevices(true); }}
      >
        {refreshing ? '…' : 'Refresh'}
      </button>
      <span className="bb-inst-editor__midi-status" aria-live="polite">{status}</span>
    </div>
  );
}

function MiniKeyboard({
  activeNote,
  octave,
  onOctaveChange,
  onDown,
  onUp,
}: {
  activeNote: string | null;
  octave: number;
  onOctaveChange: (next: number) => void;
  onDown: (note: string) => void;
  onUp: () => void;
}): React.JSX.Element {
  const clampOctave = (next: number) =>
    Math.max(PIANO_OCTAVE_MIN, Math.min(PIANO_OCTAVE_MAX, next));

  return (
    <div className="bb-inst-editor__keys">
      <div className="bb-inst-editor__keys-bar">
        <div className="bb-settings-note bb-inst-editor__keys-label">A–J · Z/X octave · MIDI</div>
        <div className="bb-inst-editor__octave" role="group" aria-label="Octave">
          <button
            type="button"
            className="bb-inst-editor__octave-btn"
            aria-label="Octave down"
            title="Octave down (Z)"
            disabled={octave <= PIANO_OCTAVE_MIN}
            onClick={() => onOctaveChange(clampOctave(octave - 1))}
          >
            −
          </button>
          <span className="bb-inst-editor__octave-value" title="Computer keys Z / X">
            Oct {octave}
          </span>
          <button
            type="button"
            className="bb-inst-editor__octave-btn"
            aria-label="Octave up"
            title="Octave up (X)"
            disabled={octave >= PIANO_OCTAVE_MAX}
            onClick={() => onOctaveChange(clampOctave(octave + 1))}
          >
            +
          </button>
        </div>
      </div>
      <div className="bb-inst-editor__piano" aria-label={`Octave ${octave} keyboard`}>
        {PIANO_SLOTS.map((slot) => {
          const whiteNote = pianoNote(slot.white.degree, octave);
          const blackNote = slot.black ? pianoNote(slot.black.degree, octave) : null;
          return (
            <div key={slot.white.degree} className="bb-inst-editor__key-slot">
              <button
                type="button"
                className={`bb-inst-editor__white${activeNote === whiteNote ? ' is-active' : ''}`}
                title={`${whiteNote} (${slot.white.key.toUpperCase()})`}
                onPointerDown={() => onDown(whiteNote)}
                onPointerUp={onUp}
                onPointerLeave={onUp}
              >
                {slot.white.key.toUpperCase()}
              </button>
              {slot.black && blackNote ? (
                <button
                  type="button"
                  className={`bb-inst-editor__black${activeNote === blackNote ? ' is-active' : ''}`}
                  title={`${blackNote} (${slot.black.key.toUpperCase()})`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onDown(blackNote);
                  }}
                  onPointerUp={onUp}
                  onPointerLeave={onUp}
                >
                  {slot.black.key.toUpperCase()}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function createDesktopInstrumentEditor(
  container: HTMLElement,
  options: DesktopInstrumentEditorOptions,
): DesktopInstrumentEditorHandle {
  const handleRef = { current: null as DesktopInstrumentEditorHandle | null };
  let root: Root | null = mountReactRoot(container);
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.height = '100%';
  container.style.width = '100%';
  container.style.minWidth = '0';
  container.style.overflow = 'hidden';

  flushSync(() => {
    root?.render(
      <DesktopInstrumentEditor
        {...options}
        panelRef={(handle) => { handleRef.current = handle; }}
      />,
    );
  });

  const call = (fn: (h: DesktopInstrumentEditorHandle) => void) => {
    if (handleRef.current) fn(handleRef.current);
    else queueMicrotask(() => { if (handleRef.current) fn(handleRef.current); });
  };

  return {
    show: () => call((h) => h.show()),
    hide: () => call((h) => h.hide()),
    selectInstrument: (name) => call((h) => h.selectInstrument(name)),
    getSelectedName: () => handleRef.current?.getSelectedName() ?? null,
    setAst: (ast) => call((h) => h.setAst(ast)),
    dispose: () => {
      handleRef.current?.dispose();
      unmountReactRoot(container, root);
      root = null;
    },
  };
}
