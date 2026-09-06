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
  parseWaveHexInput,
  parseWaveTable,
  samplesToHex,
  serializeInstrument,
  type ChipInstrumentEditor,
  type ChipInstrumentFieldDef,
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
import {
  formatHardwareEnvelope,
  formatHardwareSweep,
  parseHardwareEnvelope,
  parseHardwareSweep,
  simulateGBEnvelope,
  simulateHardwareSweep,
  type EnvelopeDirection,
  type SweepDirection,
} from '@beatbax/app-core/editor/envelope-preview';
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
const DEFAULT_PROP_NAMES = new Set(['note', 'uge_note', 'gm']);

function isDefaultPropField(field: { name: string; widget: string }): boolean {
  return DEFAULT_PROP_NAMES.has(field.name)
    || field.widget === 'note'
    || field.widget === 'uge_note';
}

function isHardwarePropField(field: { name: string; widget: string }): boolean {
  return field.widget === 'envelope' || field.widget === 'sweep' || field.name === 'env_period';
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
      className={`bb-inst-editor__ctrl-pair${disabled ? ' is-disabled' : ''}`}
      htmlFor={id}
      title={hint}
    >
      <span className="bb-inst-editor__ctrl-pair-label">{label}</span>
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

  const loadInst = useCallback((name: string, nextAst = ast, opts?: { focus?: boolean; reveal?: boolean }) => {
    setSelected(name);
    setDraft(cloneInst(nextAst?.insts?.[name]));
    setErrors([]);
    const focus = opts?.focus === true;
    // Only scroll/focus when explicitly requested (dropdown, Locate, New, CodeLens).
    // Never jump the editor on passive selection sync.
    const reveal = opts?.reveal === true || focus;
    revealInst(name, { focus, reveal });
  }, [ast, revealInst]);

  useImperativeHandle(panelRef, () => ({
    show: () => {},
    hide: () => {},
    selectInstrument: (name) => loadInst(name, ast, { reveal: false, focus: false }),
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

  const renderDefaultField = (field: ChipInstrumentFieldDef) => {
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
            className="bb-settings-select bb-inst-editor__hw-dir"
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
          className="bb-settings-number"
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

  const renderVoiceField = (field: ChipInstrumentFieldDef) => {
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

  const envelopeField = visibleFields.find((f) => f.widget === 'envelope');
  const sweepField = visibleFields.find((f) => f.widget === 'sweep');
  const voiceFields = visibleFields.filter((f) => !isHardwarePropField(f) && !isDefaultPropField(f));
  const defaultFields = visibleFields.filter(isDefaultPropField);
  const siblingPeriod = Number(formatInstrumentFieldValue('env_period', draft.env_period));

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
          aria-label="Show in editor"
          title="Show this instrument in the editor"
          aria-disabled={!selected ? 'true' : undefined}
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            revealInst(selected, { focus: true, reveal: true });
          }}
          dangerouslySetInnerHTML={{ __html: icon('arrows-pointing-in', 'w-3.5 h-3.5') }}
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
            <PropertiesFieldsTabs
              voiceFields={voiceFields}
              defaultFields={defaultFields}
              renderVoiceField={renderVoiceField}
              renderDefaultField={renderDefaultField}
            />

            {schema.constraints?.filter((c) => {
              if (!c.when) return true;
              const m = c.when.match(/type=([A-Za-z0-9_|-]+)/);
              if (!m) return true;
              return m[1].split('|').some((t) => t.toLowerCase() === instType.toLowerCase());
            }).map((c) => (
              <NoteText key={c.id}>{c.message}</NoteText>
            ))}

            <HardwareEnvSweepSection
              envelope={envelopeField}
              sweep={sweepField}
              envelopeValue={envelopeField ? draft[envelopeField.name] : undefined}
              sweepValue={sweepField ? draft[sweepField.name] : undefined}
              periodSibling={Boolean(envelopeField && visibleFields.some((f) => f.name === 'env_period'))}
              siblingPeriod={Number.isFinite(siblingPeriod) ? siblingPeriod : 0}
              disabled={!selectedLocal}
              onEnvelopeChange={(next) => {
                if (!envelopeField) return;
                if (next == null) patch({ [envelopeField.name]: undefined });
                else patch({ [envelopeField.name]: next });
              }}
              onSweepChange={(next) => {
                if (!sweepField) return;
                if (next == null) patch({ [sweepField.name]: undefined });
                else patch({ [sweepField.name]: next });
              }}
              onSiblingPeriodChange={
                envelopeField && visibleFields.some((f) => f.name === 'env_period')
                  ? (p) => patch({ env_period: String(p) })
                  : undefined
              }
            />

            {waveDef ? (
              <WaveformCanvas
                samples={waveSamples}
                def={waveDef}
                disabled={!selectedLocal}
                hex={samplesToHex(waveSamples.slice(0, waveDef.length))}
                quiet={Boolean(quietWave)}
                onChange={(samples) => {
                  patch({ [waveDef.field]: samples });
                }}
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

function ShapePreviewCanvas({
  levels,
  maxLevel,
  className,
}: {
  levels: number[];
  maxLevel: number;
  className?: string;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const bg = getComputedStyle(canvas).getPropertyValue('--bb-inst-wave-bg').trim() || '#1a1a1a';
    const stroke = getComputedStyle(canvas).getPropertyValue('--bb-inst-env-stroke').trim() || '#6ee7b7';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (!levels.length) return;
    const range = maxLevel || 1;
    const n = levels.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / Math.max(1, n - 1)) * (w - 2) + 1;
      const y = h - 2 - ((Math.max(0, levels[i]!) / range) * (h - 4));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = stroke;
    for (let i = 0; i < n; i++) {
      const x = (i / Math.max(1, n - 1)) * (w - 2) + 1;
      const y = h - 2 - ((Math.max(0, levels[i]!) / range) * (h - 4));
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [levels, maxLevel]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={56}
      className={className ?? 'bb-inst-editor__shape-canvas'}
      aria-hidden
    />
  );
}

function CtrlPair({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="bb-inst-editor__ctrl-pair" htmlFor={id}>
      <span className="bb-inst-editor__ctrl-pair-label">{label}</span>
      {children}
    </label>
  );
}

function PropertiesFieldsTabs({
  voiceFields,
  defaultFields,
  renderVoiceField,
  renderDefaultField,
}: {
  voiceFields: ChipInstrumentFieldDef[];
  defaultFields: ChipInstrumentFieldDef[];
  renderVoiceField: (field: ChipInstrumentFieldDef) => React.ReactNode;
  renderDefaultField: (field: ChipInstrumentFieldDef) => React.ReactNode;
}): React.JSX.Element | null {
  type PropTab = 'voice' | 'defaults';
  const tabs = useMemo(() => {
    const next: Array<{ id: PropTab; label: string }> = [];
    if (voiceFields.length) next.push({ id: 'voice', label: 'Voice' });
    if (defaultFields.length) next.push({ id: 'defaults', label: 'Defaults' });
    return next;
  }, [voiceFields.length, defaultFields.length]);

  const [activeId, setActiveId] = useState<PropTab | null>(null);
  useEffect(() => {
    if (!tabs.length) {
      setActiveId(null);
      return;
    }
    setActiveId((cur) => (
      cur && tabs.some((t) => t.id === cur) ? cur : tabs[0]!.id
    ));
  }, [tabs]);

  if (!tabs.length || !activeId) return null;

  return (
    <div className="bb-inst-editor__props-panel">
      {tabs.length > 1 ? (
        <div className="bb-inst-editor__macro-tabs" role="tablist" aria-label="Instrument properties">
          {tabs.map((tab) => {
            const selected = tab.id === activeId;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`bb-inst-editor__macro-tab${selected ? ' is-active' : ''}`}
                onClick={() => setActiveId(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        className="bb-inst-editor__macro"
        role="tabpanel"
        aria-label={activeId === 'voice' ? 'Voice properties' : 'Default note and program'}
      >
        {activeId === 'voice' ? (
          <div className="bb-inst-editor__props-voice">
            {voiceFields.map(renderVoiceField)}
          </div>
        ) : (
          <div
            className="bb-inst-editor__macro-controls"
            role="group"
            aria-label="Default note and program"
          >
            {defaultFields.map(renderDefaultField)}
          </div>
        )}
      </div>
    </div>
  );
}

function hwFieldDefined(value: unknown): boolean {
  if (value == null || value === '') return false;
  return true;
}

function HardwareEnvSweepSection({
  envelope,
  sweep,
  envelopeValue,
  sweepValue,
  periodSibling,
  siblingPeriod,
  disabled,
  onEnvelopeChange,
  onSweepChange,
  onSiblingPeriodChange,
}: {
  envelope?: ChipInstrumentFieldDef;
  sweep?: ChipInstrumentFieldDef;
  envelopeValue: unknown;
  sweepValue: unknown;
  periodSibling: boolean;
  siblingPeriod: number;
  disabled: boolean;
  onEnvelopeChange: (csv: string | undefined) => void;
  onSweepChange: (csv: string | undefined) => void;
  onSiblingPeriodChange?: (period: number) => void;
}): React.JSX.Element | null {
  type HwTab = 'envelope' | 'sweep';
  const items = useMemo(() => {
    const next: Array<{ id: HwTab; label: string; hint?: string }> = [];
    if (envelope) next.push({ id: 'envelope', label: envelope.label, hint: envelope.hint });
    if (sweep) next.push({ id: 'sweep', label: sweep.label, hint: sweep.hint });
    return next;
  }, [envelope, sweep]);

  const defined = useMemo(
    () => items.filter((item) => (
      item.id === 'envelope' ? hwFieldDefined(envelopeValue) : hwFieldDefined(sweepValue)
    )),
    [items, envelopeValue, sweepValue],
  );
  const available = useMemo(
    () => items.filter((item) => (
      item.id === 'envelope' ? !hwFieldDefined(envelopeValue) : !hwFieldDefined(sweepValue)
    )),
    [items, envelopeValue, sweepValue],
  );

  const [activeId, setActiveId] = useState<HwTab | null>(null);
  useEffect(() => {
    if (!defined.length) {
      setActiveId(null);
      return;
    }
    setActiveId((cur) => (
      cur && defined.some((d) => d.id === cur) ? cur : defined[0]!.id
    ));
  }, [defined]);

  if (!items.length) return null;

  const active = defined.find((d) => d.id === activeId) ?? defined[0] ?? null;

  const addEnvelope = () => {
    onEnvelopeChange(formatHardwareEnvelope({ level: 12, direction: 'down', period: 1 }));
    setActiveId('envelope');
  };
  const addSweep = () => {
    onSweepChange(formatHardwareSweep({ time: 7, direction: 'down', shift: 3 }));
    setActiveId('sweep');
  };

  return (
    <div className="bb-inst-editor__hw-section">
      <div className="bb-inst-editor__macros-header">
        <SectionHeading>Hardware</SectionHeading>
        {available.length ? (
          <div className="bb-inst-editor__macro-add" role="group" aria-label="Add hardware envelope or sweep">
            {available.map((item) => (
              <button
                key={item.id}
                type="button"
                className="bb-inst-editor__macro-add-btn"
                disabled={disabled}
                title={disabled ? undefined : `Add ${item.label}`}
                aria-label={`Add ${item.label}`}
                onClick={() => {
                  if (disabled) return;
                  if (item.id === 'envelope') addEnvelope();
                  else addSweep();
                }}
              >
                <span dangerouslySetInnerHTML={{ __html: icon('plus', 'w-3 h-3') }} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {defined.length && active ? (
        <div className="bb-inst-editor__macro-panel">
          <div className="bb-inst-editor__macro-tabs" role="tablist" aria-label="Hardware envelope and sweep">
            {defined.map((item) => {
              const selected = item.id === active.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`bb-inst-editor__macro-tab${selected ? ' is-active' : ''}`}
                  onClick={() => setActiveId(item.id)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {active.id === 'envelope' && envelope ? (
            <EnvelopeEditor
              hint={envelope.hint}
              disabled={disabled}
              value={envelopeValue}
              periodMax={envelope.max ?? 7}
              periodSibling={periodSibling}
              siblingPeriod={siblingPeriod}
              onChange={onEnvelopeChange}
              onSiblingPeriodChange={onSiblingPeriodChange}
              onRemove={disabled ? undefined : () => {
                onEnvelopeChange(undefined);
                onSiblingPeriodChange?.(0);
              }}
            />
          ) : null}
          {active.id === 'sweep' && sweep ? (
            <SweepEditor
              hint={sweep.hint}
              disabled={disabled}
              value={sweepValue}
              onChange={onSweepChange}
              onRemove={disabled ? undefined : () => onSweepChange(undefined)}
            />
          ) : null}
        </div>
      ) : (
        <NoteText>
          {available.length
            ? `No hardware ${available.map((a) => a.label.toLowerCase()).join(' or ')} yet.`
            : 'No hardware envelope or sweep.'}
        </NoteText>
      )}
    </div>
  );
}

function EnvelopeEditor({
  hint,
  disabled,
  value,
  periodMax,
  periodSibling,
  siblingPeriod,
  onChange,
  onSiblingPeriodChange,
  onRemove,
}: {
  hint?: string;
  disabled: boolean;
  value: unknown;
  periodMax: number;
  periodSibling: boolean;
  siblingPeriod: number;
  onChange: (csv: string | undefined) => void;
  onSiblingPeriodChange?: (period: number) => void;
  onRemove?: () => void;
}): React.JSX.Element {
  const parsed = parseHardwareEnvelope(value);
  const invalid = value != null && value !== '' && !parsed;
  const level = parsed?.level ?? 12;
  const direction: EnvelopeDirection = parsed?.direction ?? 'down';
  const packedPeriod = parsed?.period ?? 1;
  const period = periodSibling
    ? Math.max(0, Math.min(periodMax, Number.isFinite(siblingPeriod) ? siblingPeriod : 1))
    : Math.max(0, Math.min(periodMax, packedPeriod));

  const commit = (next: { level: number; direction: EnvelopeDirection; period: number }) => {
    if (next.direction === 'flat') {
      onChange(formatHardwareEnvelope({ level: next.level, direction: 'flat', period: 0 }));
      if (periodSibling) onSiblingPeriodChange?.(0);
      return;
    }
    if (periodSibling) {
      onChange(`${next.level},${next.direction}`);
      onSiblingPeriodChange?.(next.period);
    } else {
      onChange(formatHardwareEnvelope(next));
    }
  };

  if (invalid) {
    return (
      <div className="bb-inst-editor__macro" title={hint}>
        <NoteText>Unrecognized envelope — fix or replace.</NoteText>
        <div className="bb-inst-editor__macro-add">
          <button
            type="button"
            className="bb-inst-editor__macro-add-btn"
            disabled={disabled}
            onClick={() => commit({ level: 12, direction: 'down', period: 1 })}
          >
            <span dangerouslySetInnerHTML={{ __html: icon('plus', 'w-3 h-3') }} />
            <span>Reset to 12,down</span>
          </button>
        </div>
      </div>
    );
  }

  const preview = simulateGBEnvelope(
    { level, direction, period: direction === 'flat' ? 0 : period },
    32,
  );

  return (
    <div className="bb-inst-editor__macro" title={hint}>
      <div className="bb-inst-editor__macro-controls">
        <CtrlPair id="bb-hw-env-level" label="Level">
          <input
            id="bb-hw-env-level"
            className="bb-settings-number"
            type="number"
            min={0}
            max={15}
            disabled={disabled}
            value={level}
            onChange={(e) => commit({
              level: Math.max(0, Math.min(15, Number(e.target.value) || 0)),
              direction,
              period,
            })}
          />
        </CtrlPair>
        <CtrlPair id="bb-hw-env-dir" label="Dir">
          <select
            id="bb-hw-env-dir"
            className="bb-settings-select bb-inst-editor__hw-dir"
            disabled={disabled}
            value={direction}
            onChange={(e) => commit({
              level,
              direction: e.target.value as EnvelopeDirection,
              period,
            })}
          >
            <option value="down">down</option>
            <option value="up">up</option>
            <option value="flat">flat</option>
          </select>
        </CtrlPair>
        <CtrlPair id="bb-hw-env-period" label="Period">
          <input
            id="bb-hw-env-period"
            className="bb-settings-number"
            type="number"
            min={0}
            max={periodMax}
            disabled={disabled || direction === 'flat'}
            value={direction === 'flat' ? 0 : period}
            onChange={(e) => commit({
              level,
              direction,
              period: Math.max(0, Math.min(periodMax, Number(e.target.value) || 0)),
            })}
          />
        </CtrlPair>
        {onRemove ? (
          <button
            type="button"
            className="bb-settings-btn-secondary bb-inst-editor__macro-remove"
            title="Remove envelope"
            aria-label="Remove envelope"
            onClick={onRemove}
          >
            <span dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }} />
          </button>
        ) : null}
      </div>
      <ShapePreviewCanvas levels={preview} maxLevel={15} />
      <NoteText>
        {direction === 'flat' || period === 0
          ? 'Constant volume (no ramp).'
          : `Hardware ramp · ${direction} every ${period} tick${period === 1 ? '' : 's'}.`}
      </NoteText>
    </div>
  );
}

function SweepEditor({
  hint,
  disabled,
  value,
  onChange,
  onRemove,
}: {
  hint?: string;
  disabled: boolean;
  value: unknown;
  onChange: (csv: string | undefined) => void;
  onRemove?: () => void;
}): React.JSX.Element {
  const parsed = parseHardwareSweep(value);
  const invalid = value != null && value !== '' && !parsed;
  const time = parsed?.time ?? 7;
  const direction: SweepDirection = parsed?.direction ?? 'down';
  const shift = parsed?.shift ?? 3;

  const commit = (next: { time: number; direction: SweepDirection; shift: number }) => {
    onChange(formatHardwareSweep(next));
  };

  if (invalid) {
    return (
      <div className="bb-inst-editor__macro" title={hint}>
        <NoteText>Unrecognized sweep — fix or replace.</NoteText>
        <div className="bb-inst-editor__macro-add">
          <button
            type="button"
            className="bb-inst-editor__macro-add-btn"
            disabled={disabled}
            onClick={() => commit({ time: 7, direction: 'down', shift: 3 })}
          >
            <span dangerouslySetInnerHTML={{ __html: icon('plus', 'w-3 h-3') }} />
            <span>Reset to 7,down,3</span>
          </button>
        </div>
      </div>
    );
  }

  const ratios = simulateHardwareSweep({ time, direction, shift }, 16);

  return (
    <div className="bb-inst-editor__macro" title={hint}>
      <div className="bb-inst-editor__macro-controls">
        <CtrlPair id="bb-hw-sweep-time" label="Time">
          <input
            id="bb-hw-sweep-time"
            className="bb-settings-number"
            type="number"
            min={0}
            max={7}
            disabled={disabled}
            value={time}
            onChange={(e) => commit({
              time: Math.max(0, Math.min(7, Number(e.target.value) || 0)),
              direction,
              shift,
            })}
          />
        </CtrlPair>
        <CtrlPair id="bb-hw-sweep-dir" label="Dir">
          <select
            id="bb-hw-sweep-dir"
            className="bb-settings-select bb-inst-editor__hw-dir"
            disabled={disabled}
            value={direction}
            onChange={(e) => commit({
              time,
              direction: e.target.value as SweepDirection,
              shift,
            })}
          >
            <option value="down">down</option>
            <option value="up">up</option>
          </select>
        </CtrlPair>
        <CtrlPair id="bb-hw-sweep-shift" label="Shift">
          <input
            id="bb-hw-sweep-shift"
            className="bb-settings-number"
            type="number"
            min={0}
            max={7}
            disabled={disabled}
            value={shift}
            onChange={(e) => commit({
              time,
              direction,
              shift: Math.max(0, Math.min(7, Number(e.target.value) || 0)),
            })}
          />
        </CtrlPair>
        {onRemove ? (
          <button
            type="button"
            className="bb-settings-btn-secondary bb-inst-editor__macro-remove"
            title="Remove sweep"
            aria-label="Remove sweep"
            onClick={onRemove}
          >
            <span dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }} />
          </button>
        ) : null}
      </div>
      <ShapePreviewCanvas
        levels={ratios.map((r) => r * 15)}
        maxLevel={15}
      />
      <NoteText>
        {time === 0
          ? 'Sweep off (time 0).'
          : `Frequency ${direction} · time ${time}, shift ${shift}.`}
      </NoteText>
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
}: {
  samples: number[];
  def: NonNullable<ChipInstrumentEditor['waveform']>;
  disabled: boolean;
  hex: string;
  quiet: boolean;
  onChange: (samples: number[]) => void;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const lastIdx = useRef(-1);
  const hexFocused = useRef(false);
  const [hexDraft, setHexDraft] = useState(hex);

  useEffect(() => {
    if (!hexFocused.current) setHexDraft(hex);
  }, [hex]);

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

  const applyHexDraft = (raw: string, normalizeField: boolean) => {
    const parsed = parseWaveHexInput(raw, def.length);
    if (normalizeField) setHexDraft(parsed.hex);
    onChange(parsed.samples);
  };

  return (
    <div className="bb-inst-editor__wave">
      <SectionHeading>Waveform</SectionHeading>
      <canvas
        ref={canvasRef}
        width={320}
        height={96}
        className="bb-inst-editor__wave-canvas"
        onPointerDown={(e) => { painting.current = true; (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); paintAt(e, e.shiftKey); }}
        onPointerMove={(e) => { if (painting.current) paintAt(e, e.shiftKey); }}
        onPointerUp={() => { painting.current = false; }}
      />
      {quiet ? <NoteText>Peak is below max — wavetable may sound quiet.</NoteText> : null}
      <div className="bb-inst-editor__wave-presets">
        {(def.presets ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            className="bb-settings-btn-secondary"
            disabled={disabled}
            onClick={() => {
              const next = typeof p.samples === 'string'
                ? generateWaveformPreset(p.samples, def.length, def.min, def.max)
                : p.samples.slice(0, def.length);
              onChange(next);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {def.hexImport ? (
        <label className="bb-inst-editor__hex-field" htmlFor="bb-inst-wave-hex">
          <span className="bb-inst-editor__ctrl-pair-label">Hex</span>
          <input
            id="bb-inst-wave-hex"
            className="bb-settings-text bb-inst-editor__hex-input"
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            maxLength={def.length}
            value={hexDraft}
            onFocus={() => { hexFocused.current = true; }}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, def.length);
              setHexDraft(cleaned);
              applyHexDraft(cleaned, false);
            }}
            onBlur={(e) => {
              hexFocused.current = false;
              applyHexDraft(e.target.value, true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            title="32-nibble hUGETracker hex — short values pad with 0; canvas updates as you type"
            aria-label="Wavetable hex"
          />
        </label>
      ) : null}
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
  const [activeName, setActiveName] = useState<string | null>(null);

  useEffect(() => {
    if (!defined.length) {
      setActiveName(null);
      return;
    }
    setActiveName((cur) => (
      cur && defined.some((m) => m.name === cur) ? cur : defined[0]!.name
    ));
  }, [defined]);

  if (!macros.length) return null;

  const supportedLabels = macros.map((m) => m.label).join(', ');
  const active = defined.find((m) => m.name === activeName) ?? defined[0] ?? null;
  const activeParsed = active ? parseMacro(draft[active.name]) : null;

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
                  setActiveName(macro.name);
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

      {defined.length && active && activeParsed ? (
        <div className="bb-inst-editor__macro-panel">
          <div className="bb-inst-editor__macro-tabs" role="tablist" aria-label="Defined macros">
            {defined.map((macro) => {
              const selected = macro.name === active.name;
              return (
                <button
                  key={macro.name}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`bb-inst-editor__macro-tab${selected ? ' is-active' : ''}`}
                  onClick={() => setActiveName(macro.name)}
                >
                  {macro.label}
                  {macro.kind === 'hardware' ? <span className="bb-inst-editor__macro-hw">hw</span> : null}
                </button>
              );
            })}
          </div>
          <MacroRow
            def={active}
            values={activeParsed.values}
            loopPoint={activeParsed.loopPoint}
            disabled={disabled}
            onChange={(values, loopPoint) => {
              if (!values.length) {
                onChange(active.name, undefined);
                return;
              }
              onChange(active.name, macroToFieldText(values, loopPoint));
            }}
            onRemove={disabled ? undefined : () => onChange(active.name, undefined)}
          />
        </div>
      ) : !lockReason ? (
        <NoteText>
          {available.length
            ? `No macros defined yet. Supported on this type: ${supportedLabels}.`
            : 'No macros defined.'}
        </NoteText>
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
  const trackRef = useRef<HTMLDivElement>(null);
  const painting = useRef(false);
  const lastIdx = useRef(-1);
  const valuesRef = useRef(values);
  const loopRef = useRef(loopPoint);
  valuesRef.current = values;
  loopRef.current = loopPoint;

  const length = Math.max(1, values.length || 8);
  const display = values.length ? values : new Array(length).fill(def.signed ? 0 : def.min);
  const range = def.max - def.min || 1;
  const zeroPct = def.signed ? ((0 - def.min) / range) * 100 : null;

  const paintAt = (clientX: number, clientY: number, shift: boolean) => {
    const track = trackRef.current;
    if (!track || disabled) return;
    const rect = track.getBoundingClientRect();
    const n = display.length;
    const idx = Math.max(0, Math.min(n - 1, Math.floor(((clientX - rect.left) / rect.width) * n)));
    const nextVal = Math.round(def.max - ((clientY - rect.top) / rect.height) * range);
    const clamped = Math.max(def.min, Math.min(def.max, nextVal));
    const next = (valuesRef.current.length ? valuesRef.current : display).slice();
    while (next.length < n) next.push(def.signed ? 0 : def.min);
    if (shift && lastIdx.current >= 0) {
      const from = lastIdx.current;
      const fromVal = next[from] ?? clamped;
      const a = Math.min(from, idx);
      const b = Math.max(from, idx);
      for (let i = a; i <= b; i++) {
        const t = b === a ? 1 : (i - from) / (idx - from || 1);
        next[i] = Math.round(fromVal + (clamped - fromVal) * Math.abs(t));
      }
    } else {
      next[idx] = clamped;
    }
    lastIdx.current = idx;
    onChange(next, loopRef.current);
  };

  const points = display.map((v, i) => {
    const x = ((i + 0.5) / display.length) * 100;
    const y = 100 - ((v - def.min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bb-inst-editor__macro" title={def.hint}>
      <div className="bb-inst-editor__macro-head">
        <div className="bb-inst-editor__macro-controls">
          <CtrlPair id={`bb-macro-len-${def.name}`} label="Len">
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
          </CtrlPair>
          {def.loop ? (
            <CtrlPair id={`bb-macro-loop-${def.name}`} label="Loop">
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
            </CtrlPair>
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
            </button>
          ) : null}
        </div>
        {def.hint ? <NoteText>{def.hint}</NoteText> : null}
      </div>
      <div
        ref={trackRef}
        className={`bb-inst-editor__macro-bars${def.signed ? ' is-signed' : ''}${disabled ? ' is-disabled' : ''}`}
        onPointerDown={(e) => {
          if (disabled) return;
          painting.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          paintAt(e.clientX, e.clientY, e.shiftKey);
        }}
        onPointerMove={(e) => {
          if (!painting.current) return;
          paintAt(e.clientX, e.clientY, e.shiftKey);
        }}
        onPointerUp={() => { painting.current = false; lastIdx.current = -1; }}
      >
        {zeroPct != null ? (
          <div className="bb-inst-editor__macro-zero" style={{ bottom: `${zeroPct}%` }} />
        ) : null}
        <svg className="bb-inst-editor__macro-poly" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polyline fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={points} />
        </svg>
        {display.map((v, i) => {
          const pct = ((v - def.min) / range) * 100;
          return (
            <div
              key={i}
              className={`bb-inst-editor__macro-bar${i === loopPoint ? ' is-loop' : ''}`}
              style={{ height: `${Math.max(4, pct)}%` }}
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
