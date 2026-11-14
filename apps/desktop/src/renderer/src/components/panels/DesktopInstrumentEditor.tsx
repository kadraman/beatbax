import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
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
  normalizeWaveSamples,
  parseWaveHexInput,
  samplesToHex,
  type ChipInstrumentEditor,
  type ChipInstrumentFieldDef,
  type ChipInstrumentMacroDef,
  type InstrumentNode,
  type ValidationError,
} from '@beatbax/engine';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import {
  bundledSamplePrefix,
  fieldApplies,
  findInstrumentTypeDef,
  formatInstrumentSampleRef,
  INSTRUMENT_SAMPLE_SCHEMES,
  BUILTIN_INSTRUMENT_SECTION_IDS,
  listBundledSampleNames,
  listInstrumentEditorSections,
  parseInstrumentSampleRef,
  resolveBundledSampleMeta,
  resolveInstrumentEditorSchema,
  resolvePreviewMode,
  resolvePreviewOctave,
  ugeNotePreviewStrip,
  sampleRemainderForSchemeChange,
  type InstrumentSampleScheme,
} from '@beatbax/app-core/editor/instrument-editor-schema';
import type { InstNotePreviewOptions } from '@beatbax/app-core/editor/codelens-preview';
import {
  collectLocalInstNames,
  collectLocalSubpatNames,
  deleteInstLine,
  duplicateInstLine,
  findInstLineIndex,
  findSubpatLineIndex,
  insertInstLine,
  instIsReferenced,
  isValidInstName,
  readSubpatRows,
  renameInstrumentInSource,
  replaceInstLine,
  splitTrailingComment,
  syncSubpatBlock,
  uniqueInstName,
} from '@beatbax/app-core/editor/instrument-editor-writeback';
import {
  formatSubPatternRow,
  type SubPatternRowLike,
} from '@beatbax/app-core/editor/subpat-format';
import {
  instrumentDraftFingerprint,
  instrumentDraftPreviewPatch,
  isInstrumentDraftDirty,
} from '@beatbax/app-core/editor/instrument-editor-draft';
import { localSampleRemainder, songDirectory } from '@beatbax/app-core/editor/instrument-sample-path';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import {
  discreteSweepPatchFromCsv,
  discreteSweepValueFromDraft,
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
import { getClientProfile } from '@beatbax/app-core/client-profile';
import { detectShortcutPlatform, formatCommandShortcut } from '@beatbax/app-core/shortcuts';
import { focusInstrumentEditorPanel, isInstrumentEditorTypingTarget, shouldHandleInstrumentPreviewKey } from '../../lib/instrument-editor-keys';

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

function SettingsField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="bb-inst-editor__prop">
      <div className="bb-settings-row">
        <label className="bb-settings-label" htmlFor={id}>{label}</label>
        {children}
      </div>
      {hint ? <p className="bb-settings-note bb-inst-editor__prop-note">{hint}</p> : null}
    </div>
  );
}

const SAMPLE_VALUE_PLACEHOLDER: Record<InstrumentSampleScheme, string> = {
  bundled: '',
  local: 'path/to/sample.dmc',
  https: 'example.com/sample.dmc',
  github: 'user/repo/path.dmc',
};

function InstrumentSampleField({
  chip,
  disabled,
  field,
  value,
  onChange,
}: {
  chip: string;
  disabled: boolean;
  field: ChipInstrumentFieldDef;
  value: string;
  onChange: (next: string) => void;
}): React.JSX.Element {
  const parsed = parseInstrumentSampleRef(value, chip);
  const names = listBundledSampleNames(chip);
  const [emptyScheme, setEmptyScheme] = useState<InstrumentSampleScheme>(parsed.scheme);
  const scheme = value.trim() ? parsed.scheme : emptyScheme;
  const remainder = parsed.remainder;
  const schemeOptions = names.length > 0 || scheme === 'bundled'
    ? INSTRUMENT_SAMPLE_SCHEMES
    : INSTRUMENT_SAMPLE_SCHEMES.filter((s) => s.id !== 'bundled');
  const nameOpts = remainder && scheme === 'bundled' && !names.includes(remainder)
    ? [remainder, ...names]
    : names;
  const fieldId = `bb-inst-field-${field.name}`;
  const schemeId = `${fieldId}-scheme`;
  const prefixHint = scheme === 'bundled'
    ? bundledSamplePrefix(chip)
    : scheme === 'https'
      ? 'https://'
      : `${scheme}:`;
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const checkEpochRef = useRef(0);

  const commit = (nextScheme: InstrumentSampleScheme, nextRemainder: string) => {
    checkEpochRef.current += 1;
    setBusy(false);
    setStatus(null);
    onChange(formatInstrumentSampleRef(nextScheme, nextRemainder, chip));
  };

  const onBrowse = async () => {
    if (disabled || busy) return;
    const songPath = storage.get(StorageKey.LAST_DOCUMENT_PATH);
    const directory = songPath ? songDirectory(songPath) : null;
    if (!directory) {
      setStatus({ kind: 'error', text: 'Save the song before choosing a local sample.' });
      return;
    }
    const api = window.electronAPI;
    if (!api?.openFile) {
      setStatus({ kind: 'error', text: 'File browse is only available in the desktop app.' });
      return;
    }
    setBusy(true);
    try {
      const picked = await api.openFile({
        title: 'Choose a DMC sample',
        defaultPath: directory,
        pathOnly: true,
        filters: [
          { name: 'DMC samples (*.dmc)', extensions: ['dmc'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (!picked?.path) return;
      const relative = localSampleRemainder(picked.path, songPath);
      if (!relative.ok) {
        setStatus({ kind: 'error', text: relative.error });
        return;
      }
      commit('local', relative.remainder);
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const onCheck = async () => {
    if (disabled || busy) return;
    const ref = formatInstrumentSampleRef(scheme, remainder, chip);
    if (!ref) {
      setStatus({ kind: 'error', text: 'Enter a sample reference before checking it.' });
      return;
    }
    const plugin = chipRegistry.get(chipRegistry.resolve(chip));
    if (!plugin?.resolveSampleAsset) {
      setStatus({ kind: 'error', text: 'This chip cannot check samples.' });
      return;
    }
    const epoch = ++checkEpochRef.current;
    setBusy(true);
    try {
      const bytes = await plugin.resolveSampleAsset(ref);
      if (epoch !== checkEpochRef.current) return;
      setStatus({ kind: 'ok', text: `OK · ${bytes.byteLength} bytes` });
    } catch (error) {
      if (epoch !== checkEpochRef.current) return;
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      if (epoch === checkEpochRef.current) setBusy(false);
    }
  };

  return (
    <div className="bb-inst-editor__sample-block" title={field.hint}>
    <div className="bb-settings-row bb-inst-editor__sample-row">
      <span className="bb-settings-label" id={`${fieldId}-label`}>{field.label}</span>
      <div className="bb-inst-editor__sample-controls" role="group" aria-labelledby={`${fieldId}-label`}>
        <select
          id={schemeId}
          className="bb-settings-select bb-inst-editor__sample-scheme"
          disabled={disabled}
          value={scheme}
          title={prefixHint}
          aria-label={`${field.label} scheme`}
          onChange={(e) => {
            const next = e.target.value as InstrumentSampleScheme;
            const nextRemainder = sampleRemainderForSchemeChange(scheme, next, remainder, chip);
            setEmptyScheme(next);
            commit(next, nextRemainder);
          }}
        >
          {schemeOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
        {scheme === 'bundled' ? (
          <select
            id={fieldId}
            className="bb-settings-select bb-inst-editor__sample-value"
            disabled={disabled}
            value={remainder}
            aria-label={`${field.label} bundled name`}
            onChange={(e) => commit('bundled', e.target.value)}
          >
            <option value="">—</option>
            {nameOpts.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : (
          <input
            id={fieldId}
            className="bb-settings-text bb-inst-editor__sample-value"
            disabled={disabled}
            type="text"
            value={remainder}
            placeholder={SAMPLE_VALUE_PLACEHOLDER[scheme]}
            aria-label={`${field.label} value`}
            onChange={(e) => {
              setEmptyScheme(scheme);
              commit(scheme, e.target.value);
            }}
          />
        )}
        <div className="bb-inst-editor__sample-actions">
          {scheme === 'local' ? (
            <button
              type="button"
              className="bb-settings-btn-secondary bb-inst-editor__sample-browse"
              title="Browse for a .dmc file in the song folder"
              aria-label="Browse for a sample file"
              disabled={disabled || busy}
              onClick={() => { void onBrowse(); }}
            >
              <span dangerouslySetInnerHTML={{ __html: icon('folder-open', 'w-3.5 h-3.5') }} />
            </button>
          ) : null}
          <button
            type="button"
            className="bb-settings-btn-secondary"
            disabled={disabled || busy || !formatInstrumentSampleRef(scheme, remainder, chip)}
            onClick={() => { void onCheck(); }}
          >
            Check
          </button>
          {status?.kind === 'ok' ? (
            <span className="bb-inst-editor__sample-ok">{status.text}</span>
          ) : null}
        </div>
      </div>
    </div>
      {status?.kind === 'error' ? (
        <p className="bb-settings-note bb-inst-editor__sample-status is-error">
          {status.text}
        </p>
      ) : null}
    </div>
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

/** Phantom AST name for New-instrument audition (never written to the song). */
const CREATE_PREVIEW_INST = '__bb_new__';
/** Left-nav id for the New-instrument page while creating. */
const CREATE_SECTION_ID = 'new';

type CreateCandidate = {
  kind: 'type' | 'preset' | 'copy';
  id: string;
  body: string;
  /** Snapshot when the candidate was chosen; edits are dirty against this. */
  baseline: InstrumentNode;
  draft: InstrumentNode;
};

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

export interface InstrumentMidiAudition {
  name: string;
  /** Preview note token (melodic pitch, or `hit` for percussion oneshot). */
  note: string;
  options: InstNotePreviewOptions;
}

export interface DesktopInstrumentEditorHandle {
  show: () => void;
  hide: () => void;
  selectInstrument: (name: string) => void;
  getSelectedName: () => string | null;
  /** MIDI idle audition for the selected instrument (oneshot vs melodic). */
  getMidiAudition: () => InstrumentMidiAudition | null;
  isOpen: () => boolean;
  setAst: (ast: any) => void;
  dispose: () => void;
}

export interface DesktopInstrumentEditorOptions {
  eventBus: EventBus;
  getSource: () => string;
  applySource: (next: string) => void;
  revealInst: (name: string | null, opts?: { focus?: boolean; reveal?: boolean }) => void;
  /** Reveal/focus a `subpat` definition without changing the selected-inst highlight. */
  revealSubpat?: (name: string) => void;
  previewNote: (instName: string, note: string, options?: InstNotePreviewOptions) => void;
  stopPreview: () => void;
  isMidiRecordArmed?: () => boolean;
  /** Fired when the modal opens or closes. Not called on mount. */
  onOpenChange?: (open: boolean) => void;
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

function pianoBindings(octave: number): Array<{ key: string; note: string }> {
  const out: Array<{ key: string; note: string }> = [];
  for (const slot of PIANO_SLOTS) {
    out.push({ key: slot.white.key, note: pianoNote(slot.white.degree, octave) });
    if (slot.black) out.push({ key: slot.black.key, note: pianoNote(slot.black.degree, octave) });
  }
  return out;
}

function instrumentOptionLabel(name: string, type: string, imported: boolean): string {
  const suffix = [type, imported ? 'imported' : ''].filter(Boolean).join(' · ');
  return suffix ? `${name} (${suffix})` : name;
}

/** Copy-from lists instruments. Always show a subpattern name the same way. */
function copySourceLabel(name: string, subpat: string): string {
  if (!subpat) return name;
  return `${name} (subpattern: ${subpat})`;
}

/** Position the hint without a React render so a hover or press does not rebuild the editor. */
function placeToolbarTip(tip: HTMLDivElement, text: string, anchor: HTMLElement): void {
  tip.textContent = text;
  tip.style.visibility = 'hidden';
  const button = anchor.getBoundingClientRect();
  const tipBox = tip.getBoundingClientRect();
  let left = button.left + (button.width - tipBox.width) / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tipBox.width - 8));
  let top = button.bottom + 6;
  if (top + tipBox.height > window.innerHeight - 8) {
    top = Math.max(8, button.top - tipBox.height - 6);
  }
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.visibility = 'visible';
}

function hideToolbarTip(tip: HTMLDivElement | null): void {
  if (!tip) return;
  tip.style.visibility = 'hidden';
}

const BUILTIN_SECTION_IDS = new Set<string>(BUILTIN_INSTRUMENT_SECTION_IDS);

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
  revealSubpat,
  previewNote,
  stopPreview,
  onOpenChange,
}: Props): React.JSX.Element | null {
  const [ast, setAst] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<InstrumentNode>({});
  const [baseline, setBaseline] = useState<InstrumentNode>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [pianoOctave, setPianoOctave] = useState(4);
  const [liveEdit, setLiveEditState] = useState(
    () => storage.getJSON<boolean>(StorageKey.INSTRUMENT_EDITOR_LIVE_EDIT, true) ?? true,
  );
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameUpdateRefs, setRenameUpdateRefs] = useState(true);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBounds, setRenameBounds] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [dirtyNavOpen, setDirtyNavOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReferenced, setDeleteReferenced] = useState(false);
  const [newInstName, setNewInstName] = useState('');
  const [newInstNameError, setNewInstNameError] = useState<string | null>(null);
  const [showCreateTemplates, setShowCreateTemplates] = useState(false);
  const [showCreateCopy, setShowCreateCopy] = useState(false);
  const [createCandidate, setCreateCandidate] = useState<CreateCandidate | null>(null);
  const [dialogBounds, setDialogBounds] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const toolbarTipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = document.createElement('div');
    tip.className = 'bb-inst-editor__toolbar-tip';
    tip.setAttribute('role', 'tooltip');
    tip.style.visibility = 'hidden';
    document.body.appendChild(tip);
    toolbarTipRef.current = tip;
    return () => {
      tip.remove();
      toolbarTipRef.current = null;
    };
  }, []);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) hideToolbarTip(toolbarTipRef.current);
  }, [open]);
  const [activeSection, setActiveSection] = useState('properties');
  const [creating, setCreating] = useState(false);
  const lastPreviewNote = useRef('C4');
  const selectedRef = useRef<string | null>(null);
  const draftRef = useRef<InstrumentNode>({});
  const baselineRef = useRef<InstrumentNode>({});
  const createCandidateRef = useRef<CreateCandidate | null>(null);
  const creatingRef = useRef(false);
  const liveEditRef = useRef(liveEdit);
  const openRef = useRef(false);
  const requestCloseRef = useRef<() => void>(() => {});
  const abandonCreating = useCallback(() => {
    creatingRef.current = false;
    createCandidateRef.current = null;
    setCreating(false);
    setCreateCandidate(null);
    setShowCreateTemplates(false);
    setShowCreateCopy(false);
    setNewInstName('');
    setNewInstNameError(null);
    setErrors([]);
    stopPreview();
    setActiveNote(null);
  }, [stopPreview]);

  const setModalOpen = useCallback((next: boolean) => {
    openRef.current = next;
    if (!next) {
      // Closing must drop an unfinished New session so reopen edits the selected instrument.
      abandonCreating();
      setActiveSection((prev) => (prev === CREATE_SECTION_ID ? 'properties' : prev));
    }
    setOpen(next);
    onOpenChange?.(next);
  }, [abandonCreating, onOpenChange]);
  const dirtyRef = useRef(false);
  /** Latest Create insert; dirty-nav Apply reads this so the dialog is not a stale closure. */
  const applyCreateCandidateRef = useRef<() => boolean>(() => false);
  const pendingNavRef = useRef<(() => void) | null>(null);
  const chipRef = useRef('gameboy');
  const bodyRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  selectedRef.current = selected;
  draftRef.current = draft;
  baselineRef.current = baseline;
  createCandidateRef.current = createCandidate;
  creatingRef.current = creating;
  liveEditRef.current = liveEdit;
  // Fingerprint only when draft/baseline identity changes — not on every
  // piano/rename/dialog re-render. Mutation handlers already replace these refs.
  const baselineFp = useMemo(() => instrumentDraftFingerprint(baseline), [baseline]);
  const draftFp = useMemo(() => instrumentDraftFingerprint(draft), [draft]);
  const selectedDirty = baselineFp !== draftFp;
  const createDirty = Boolean(
    creating
    && createCandidate
    && isInstrumentDraftDirty(createCandidate.baseline, createCandidate.draft),
  );
  // While New is open, only candidate edits are "unsaved"; the prior inst draft is parked.
  const dirty = creating ? createDirty : selectedDirty;
  dirtyRef.current = dirty;

  const chip = String(ast?.chip ?? 'gameboy').toLowerCase();
  chipRef.current = chip;
  const schema: ChipInstrumentEditor = useMemo(() => resolveInstrumentEditorSchema(chip), [chip]);
  // Read live source each render so New/Delete update locality before parse:success.
  const localNames = collectLocalInstNames(getSource());
  const instNames = Object.keys(ast?.insts ?? {});
  // Keep a just-created name visible before parse:success updates the AST.
  const pickerNames = selected && !instNames.includes(selected)
    ? [...instNames, selected]
    : instNames;
  const selectedLocal = selected ? localNames.has(selected) : false;
  const fieldOrder = useMemo(() => {
    const order: string[] = [];
    for (const f of schema.fields) {
      if (f.widget === 'sweep' && f.storage === 'discrete') {
        order.push('sweep_en', 'sweep_period', 'sweep_shift', 'sweep_dir');
      } else {
        order.push(f.name);
      }
    }
    return order;
  }, [schema.fields]);

  const syncPreviewOctave = useCallback((nextDraft: InstrumentNode, nextChip: string, nextSchema: ChipInstrumentEditor) => {
    const type = String(nextDraft.type ?? nextSchema.types[0]?.id ?? '');
    if (resolvePreviewMode(type, nextChip, nextSchema, nextDraft) !== 'melodic') return;
    setPianoOctave(resolvePreviewOctave(nextDraft.note, type, nextChip, nextSchema, PIANO_OCTAVE_MIN, PIANO_OCTAVE_MAX));
  }, []);

  const loadInst = useCallback((name: string, nextAst?: any, opts?: { focus?: boolean; reveal?: boolean }) => {
    const sourceAst = nextAst ?? ast;
    setSelected(name);
    const nextDraft = cloneInst(sourceAst?.insts?.[name]);
    setDraft(nextDraft);
    setBaseline(cloneInst(nextDraft));
    setErrors([]);
    const nextChip = String(sourceAst?.chip ?? 'gameboy').toLowerCase();
    syncPreviewOctave(nextDraft, nextChip, resolveInstrumentEditorSchema(nextChip));
    const focus = opts?.focus === true;
    // Reveal/highlight on explicit requests (dropdown, New, CodeLens).
    // Never jump the editor on passive selection sync.
    // Only "Show in editor" focuses Monaco — otherwise A–J would type into source.
    const reveal = opts?.reveal === true || focus;
    revealInst(name, { focus, reveal });
  }, [ast, revealInst, syncPreviewOctave]);

  /** Apply AST instrument body into panel state. Callers must not invoke this from a state updater. */
  const adoptDraftFromAst = useCallback((name: string | null, instrumentAst: any, nextSchema: ChipInstrumentEditor) => {
    const nextChip = String(instrumentAst?.chip ?? 'gameboy').toLowerCase();
    if (name && instrumentAst?.insts?.[name]) {
      const d = cloneInst(instrumentAst.insts[name]);
      setSelected(name);
      setDraft(d);
      setBaseline(cloneInst(d));
      setErrors([]);
      syncPreviewOctave(d, nextChip, nextSchema);
      revealInst(name, { focus: false, reveal: false });
      return;
    }
    const first = Object.keys(instrumentAst?.insts ?? {})[0] ?? null;
    if (first) {
      const d = cloneInst(instrumentAst.insts[first]);
      setSelected(first);
      setDraft(d);
      setBaseline(cloneInst(d));
      setErrors([]);
      syncPreviewOctave(d, nextChip, nextSchema);
      revealInst(first, { focus: false, reveal: false });
      return;
    }
    setSelected(null);
    setDraft({});
    setBaseline({});
    setErrors([]);
    revealInst(null);
  }, [revealInst, syncPreviewOctave]);

  /**
   * After AST replace: keep a dirty draft if that name still exists; otherwise
   * adopt the current (or first) instrument. Uses selectedRef so side effects
   * stay outside React state updaters.
   */
  const syncSelectionFromAst = useCallback((instrumentAst: any) => {
    const names = Object.keys(instrumentAst?.insts ?? {});
    const cur = selectedRef.current;
    // Keep an unsaved draft when Live is off (spec 099).
    if (dirtyRef.current && cur && names.includes(cur)) {
      revealInst(cur, { focus: false, reveal: false });
      return;
    }
    const nextSchema = resolveInstrumentEditorSchema(String(instrumentAst?.chip ?? 'gameboy').toLowerCase());
    adoptDraftFromAst(cur && names.includes(cur) ? cur : null, instrumentAst, nextSchema);
  }, [adoptDraftFromAst, revealInst]);

  const restorePanelFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      focusInstrumentEditorPanel(bodyRef.current);
    });
  }, []);

  useImperativeHandle(panelRef, () => ({
    show: () => {
      setModalOpen(true);
      window.requestAnimationFrame(() => focusInstrumentEditorPanel(bodyRef.current));
    },
    hide: () => requestCloseRef.current(),
    isOpen: () => openRef.current,
    selectInstrument: (name) => {
      const go = () => {
        if (creatingRef.current) abandonCreating();
        loadInst(name, undefined, { reveal: false, focus: false });
      };
      if (dirtyRef.current) {
        pendingNavRef.current = go;
        setDirtyNavOpen(true);
        return;
      }
      go();
    },
    getSelectedName: () => selectedRef.current,
    getMidiAudition: () => {
      const creatingNow = creatingRef.current;
      const candidate = createCandidateRef.current;
      if (creatingNow && !candidate) return null;
      const name = creatingNow ? CREATE_PREVIEW_INST : selectedRef.current;
      if (!name) return null;
      const chipName = chipRef.current;
      const schemaNow = resolveInstrumentEditorSchema(chipName);
      const d = creatingNow && candidate ? candidate.draft : draftRef.current;
      const type = String(d.type ?? schemaNow.types[0]?.id ?? '');
      const mode = resolvePreviewMode(type, chipName, schemaNow, d);
      const draftPatch = creatingNow
        ? instrumentDraftPreviewPatch(d)
        : isInstrumentDraftDirty(baselineRef.current, d)
          ? instrumentDraftPreviewPatch(d)
          : undefined;
      if (mode === 'melodic') {
        return {
          name,
          note: lastPreviewNote.current || 'C4',
          options: { sustain: true, ...(draftPatch ? { instPatch: draftPatch } : {}) },
        };
      }
      const options: InstNotePreviewOptions = { mode: 'hit', sustain: false };
      if (mode === 'uge_note') {
        const uge = d.uge_note;
        if (!(typeof uge === 'string' && uge.trim())) {
          options.instPatch = { ...(draftPatch ?? {}), uge_note: 'C-6' };
        } else if (draftPatch) {
          options.instPatch = draftPatch;
        }
      } else if (draftPatch) {
        options.instPatch = draftPatch;
      }
      return { name, note: 'hit', options };
    },
    setAst: (next) => {
      setAst(next);
      syncSelectionFromAst(next);
    },
    dispose: () => {
      revealInst(null);
    },
  }), [abandonCreating, ast, loadInst, revealInst, setModalOpen, syncSelectionFromAst]);

  useEffect(() => {
    return eventBus.on('parse:success', ({ ast: next, resolvedAst, ephemeral }) => {
      if (ephemeral) return;
      // Prefer resolved AST so imported insts (local:/github:/https:) appear read-only (spec 021).
      const instrumentAst = resolvedAst ?? next;
      setAst(instrumentAst);
      syncSelectionFromAst(instrumentAst);
    });
  }, [eventBus, syncSelectionFromAst]);

  useEffect(() => {
    return eventBus.on('instrument-editor:open', ({ name }) => {
      setModalOpen(true);
      if (!name) {
        restorePanelFocus();
        return;
      }
      const go = () => {
        if (creatingRef.current) abandonCreating();
        loadInst(name, undefined, { reveal: true, focus: false });
        restorePanelFocus();
      };
      if (dirtyRef.current) {
        pendingNavRef.current = go;
        setDirtyNavOpen(true);
        return;
      }
      go();
    });
  }, [abandonCreating, eventBus, loadInst, restorePanelFocus, setModalOpen]);

  useEffect(() => {
    return eventBus.on('instrument-editor:select', ({ name }) => {
      const go = () => {
        if (creatingRef.current) abandonCreating();
        loadInst(name, undefined, { reveal: true, focus: false });
      };
      if (dirtyRef.current) {
        setModalOpen(true);
        pendingNavRef.current = go;
        setDirtyNavOpen(true);
        return;
      }
      go();
    });
  }, [abandonCreating, eventBus, loadInst, setModalOpen]);

  useEffect(() => {
    return eventBus.on('instrument-editor:audition', ({ note }) => {
      if (!note) {
        setActiveNote(null);
        return;
      }
      setActiveNote(note);
      lastPreviewNote.current = note;
    });
  }, [eventBus]);

  const commitToSource = useCallback((next: InstrumentNode = draftRef.current): boolean => {
    if (!selected || !selectedLocal) return false;
    const issues = validateDraft(chip, next);
    if (issues.length) {
      setErrors(issues);
      return false;
    }
    const block = syncSubpatBlock(getSource(), next, selected);
    if (!block.ok) {
      setErrors([{
        field: 'subpat',
        message: block.error ?? `Could not write subpattern '${String(next.subpat ?? '')}'.`,
      }]);
      return false;
    }
    const { next: source, ok } = replaceInstLine(block.next, selected, next, fieldOrder);
    if (!ok) {
      // e.g. external edit removed the inst line — not a field validation failure.
      setErrors([{
        field: 'inst',
        message: `Could not write '${selected}' — it is no longer in the editor source.`,
      }]);
      return false;
    }
    applySource(source);
    const committed = cloneInst(next);
    setBaseline(committed);
    baselineRef.current = committed;
    draftRef.current = next;
    dirtyRef.current = false;
    setErrors([]);
    revealInst(selected, { focus: false, reveal: false });
    return true;
  }, [applySource, chip, fieldOrder, getSource, revealInst, selected, selectedLocal]);

  const writeDraft = useCallback((next: InstrumentNode) => {
    // New-instrument candidate: edit in memory only until Create.
    if (creatingRef.current && createCandidateRef.current) {
      const updated: CreateCandidate = { ...createCandidateRef.current, draft: next };
      createCandidateRef.current = updated;
      dirtyRef.current = isInstrumentDraftDirty(updated.baseline, next);
      setCreateCandidate(updated);
      setErrors(validateDraft(chip, next));
      return;
    }
    setDraft(next);
    // Keep refs current for audition before the next render (playNote / MIDI).
    draftRef.current = next;
    dirtyRef.current = isInstrumentDraftDirty(baselineRef.current, next);
    if (!selected || !selectedLocal) return;
    const issues = validateDraft(chip, next);
    setErrors(issues);
    if (!liveEditRef.current) return;
    if (issues.length) return;
    commitToSource(next);
  }, [chip, commitToSource, selected, selectedLocal]);

  const revertDraft = useCallback(() => {
    const restored = cloneInst(baselineRef.current);
    // Keep draftRef/dirtyRef in sync for callers that run before the next render
    // (e.g. pending dirty-nav actions after Discard).
    draftRef.current = restored;
    dirtyRef.current = false;
    setDraft(restored);
    setErrors(validateDraft(chip, restored));
    syncPreviewOctave(restored, chip, schema);
  }, [chip, schema, syncPreviewOctave]);

  const applyDraft = useCallback(() => {
    commitToSource(draftRef.current);
  }, [commitToSource]);

  const setLiveEdit = useCallback((next: boolean): boolean => {
    if (next && isInstrumentDraftDirty(baselineRef.current, draftRef.current)) {
      if (!commitToSource(draftRef.current)) return false;
    }
    setLiveEditState(next);
    storage.setJSON(StorageKey.INSTRUMENT_EDITOR_LIVE_EDIT, next);
    return true;
  }, [commitToSource]);

  const withDirtyGuard = useCallback((action: () => void) => {
    const candidate = creatingRef.current ? createCandidateRef.current : null;
    const sessionDirty = candidate
      ? isInstrumentDraftDirty(candidate.baseline, candidate.draft)
      : isInstrumentDraftDirty(baselineRef.current, draftRef.current);
    if (!sessionDirty) {
      action();
      return;
    }
    pendingNavRef.current = action;
    setDirtyNavOpen(true);
  }, []);
  requestCloseRef.current = () => withDirtyGuard(() => setModalOpen(false));

  const closeDirtyNav = useCallback(() => {
    pendingNavRef.current = null;
    setDirtyNavOpen(false);
  }, []);

  const resolveDirtyNav = useCallback((choice: 'apply' | 'discard' | 'cancel') => {
    const pending = pendingNavRef.current;
    if (choice === 'cancel') {
      closeDirtyNav();
      return;
    }
    const creatingNow = creatingRef.current;
    const candidate = createCandidateRef.current;
    if (creatingNow && candidate) {
      if (choice === 'apply') {
        // Insert the candidate (Create), then run the pending close/navigation.
        if (!applyCreateCandidateRef.current()) return;
      } else {
        // Drop the create session so pending close/loadInst is not stuck on New.
        abandonCreating();
        dirtyRef.current = isInstrumentDraftDirty(baselineRef.current, draftRef.current);
        if (selectedRef.current) setActiveSection('properties');
      }
      pendingNavRef.current = null;
      setDirtyNavOpen(false);
      pending?.();
      return;
    }
    if (choice === 'apply') {
      if (!commitToSource(draftRef.current)) return;
    } else {
      // revertDraft syncs draftRef before `pending` runs (state updates are async).
      revertDraft();
    }
    pendingNavRef.current = null;
    setDirtyNavOpen(false);
    pending?.();
  }, [abandonCreating, closeDirtyNav, commitToSource, revertDraft]);

  const patch = (partial: Partial<InstrumentNode>) => {
    const base = creatingRef.current && createCandidateRef.current
      ? createCandidateRef.current.draft
      : draft;
    const next = { ...base, ...partial };
    writeDraft(next);
    if (partial.type !== undefined || partial.note !== undefined || partial.tone_mix !== undefined) {
      syncPreviewOctave(next, chip, schema);
    }
  };

  /** Draft shown/edited in panels: create candidate while New, else selected instrument. */
  const workingDraft = creating && createCandidate ? createCandidate.draft : draft;
  const canEditFields = creating ? Boolean(createCandidate) : selectedLocal;
  const previewDraft = workingDraft;
  const instType = String(previewDraft.type ?? schema.types[0]?.id ?? '');
  const isDmcType = instType.toLowerCase() === 'dmc';
  const previewMode = resolvePreviewMode(instType, chip, schema, previewDraft);
  const currentUge = typeof previewDraft.uge_note === 'string' ? previewDraft.uge_note.trim() : '';
  const dmcSampleMeta = previewMode === 'oneshot' && isDmcType
    ? resolveBundledSampleMeta(chip, previewDraft.dmc_sample)
    : null;
  /**
   * `parseInstrumentBody` keeps `subpat=` and drops resolved rows. Put the
   * source instrument's rows back so the copy can show and write that block.
   * The `subpat` name stays shared — the block is not cloned.
   */
  const withSubpatRows = (draft: InstrumentNode, sourceName?: string): InstrumentNode => {
    const subpat = typeof draft.subpat === 'string' ? draft.subpat.trim() : '';
    if (!subpat) return draft;
    if (Array.isArray(draft.subpatRows) && draft.subpatRows.length > 0) return draft;
    const fromAst = sourceName ? ast?.insts?.[sourceName]?.subpatRows : undefined;
    const rows = Array.isArray(fromAst) && fromAst.length
      ? fromAst as SubPatternRowLike[]
      : readSubpatRows(getSource(), subpat);
    if (!rows?.length) return draft;
    return { ...draft, subpatRows: cloneSubpatRows(rows) };
  };

  const finishCreate = (name: string, nextDraft: InstrumentNode) => {
    selectedRef.current = name;
    creatingRef.current = false;
    createCandidateRef.current = null;
    dirtyRef.current = false;
    setSelected(name);
    setDraft(nextDraft);
    setBaseline(cloneInst(nextDraft));
    setErrors([]);
    setCreateCandidate(null);
    setCreating(false);
    setActiveSection('properties');
    syncPreviewOctave(nextDraft, chip, schema);
    revealInst(name, { focus: false, reveal: true });
    restorePanelFocus();
  };

  const selectCreateCandidate = (candidate: CreateCandidate) => {
    createCandidateRef.current = candidate;
    dirtyRef.current = false;
    setCreateCandidate(candidate);
    syncPreviewOctave(candidate.draft, chip, schema);
    stopPreview();
    setActiveNote(null);
  };

  const cancelCreating = () => {
    withDirtyGuard(() => {
      abandonCreating();
      if (selectedRef.current) {
        setActiveSection('properties');
      }
    });
  };

  const selectCreateType = (typeId: string) => {
    const typeDef = schema.types.find((t) => t.id === typeId);
    const body = (typeDef?.blankContent?.trim() || `type=${typeId}`).replace(/^inst\s+\S+\s+/i, '');
    const draft = parseInstrumentBody(body);
    selectCreateCandidate({
      kind: 'type',
      id: typeId,
      body,
      baseline: cloneInst(draft),
      draft,
    });
  };

  const selectCreatePreset = (presetId: string, content: string) => {
    const body = content.replace(/^inst\s+\S+\s+/i, '');
    const draft = parseInstrumentBody(body);
    selectCreateCandidate({
      kind: 'preset',
      id: presetId,
      body,
      baseline: cloneInst(draft),
      draft,
    });
  };

  const selectCreateCopy = (sourceName: string) => {
    if (localNames.has(sourceName)) {
      const source = getSource();
      const idx = findInstLineIndex(source, sourceName);
      if (idx < 0) return;
      const { code } = splitTrailingComment(source.split(/\r?\n/)[idx]!);
      const bodyMatch = code.match(/^\s*inst\s+\S+\s+(.*)$/);
      const body = (bodyMatch?.[1] ?? '').trim();
      if (!body) return;
      const draft = withSubpatRows(parseInstrumentBody(body), sourceName);
      selectCreateCandidate({
        kind: 'copy',
        id: sourceName,
        body,
        baseline: cloneInst(draft),
        draft,
      });
      return;
    }
    const src = ast?.insts?.[sourceName];
    if (!src) return;
    const { __loc: _loc, ...rest } = cloneInst(src);
    const copied = withSubpatRows(rest, sourceName);
    selectCreateCandidate({
      kind: 'copy',
      id: sourceName,
      body: '',
      baseline: cloneInst(copied),
      draft: copied,
    });
  };

  /** Blank → unique fallback; typed name must be a valid unused local identifier. */
  const resolveCreateName = (fallbackBase: string): string | null => {
    const trimmed = newInstName.trim();
    if (!trimmed) {
      setNewInstNameError(null);
      return uniqueInstName(fallbackBase, localNames);
    }
    if (!isValidInstName(trimmed)) {
      setNewInstNameError(
        'Must start with a letter or underscore; then letters, digits, underscore, or hyphen.',
      );
      return null;
    }
    if (localNames.has(trimmed)) {
      setNewInstNameError(`Name '${trimmed}' is already used.`);
      return null;
    }
    setNewInstNameError(null);
    return trimmed;
  };

  const validateNewInstName = (raw: string) => {
    setNewInstName(raw);
    const trimmed = raw.trim();
    if (!trimmed) {
      setNewInstNameError(null);
      return;
    }
    if (!isValidInstName(trimmed)) {
      setNewInstNameError(
        'Must start with a letter or underscore; then letters, digits, underscore, or hyphen.',
      );
      return;
    }
    if (localNames.has(trimmed)) {
      setNewInstNameError(`Name '${trimmed}' is already used.`);
      return;
    }
    setNewInstNameError(null);
  };

  const applyCreateCandidate = (): boolean => {
    const candidate = createCandidateRef.current;
    if (!candidate || newInstNameError) return false;
    const nextDraft = cloneInst(candidate.draft);
    const issues = validateDraft(chip, nextDraft);
    if (issues.length) {
      setErrors(issues);
      return false;
    }
    const type = String(nextDraft.type ?? schema.types[0]?.id ?? '');
    const name = resolveCreateName(
      candidate.kind === 'copy' ? candidate.id : defaultNewInstBaseName(type),
    );
    if (!name) return false;
    const afterName = selectedLocal && selected ? selected : undefined;
    const source = insertInstLine(getSource(), `inst ${name} type=${type}`, afterName);
    const block = syncSubpatBlock(source, nextDraft, name);
    if (!block.ok) {
      setErrors([{
        field: 'subpat',
        message: block.error ?? `Could not write subpattern '${String(nextDraft.subpat ?? '')}'.`,
      }]);
      return false;
    }
    const { next, ok } = replaceInstLine(block.next, name, nextDraft, fieldOrder);
    if (!ok) {
      setErrors([{ field: 'inst', message: `Could not create '${name}'.` }]);
      return false;
    }
    selectedRef.current = name;
    applySource(next);
    finishCreate(name, nextDraft);
    dirtyRef.current = false;
    return true;
  };
  applyCreateCandidateRef.current = applyCreateCandidate;

  const onNew = () => {
    withDirtyGuard(() => {
      setNewInstName('');
      setNewInstNameError(null);
      setShowCreateTemplates(false);
      setShowCreateCopy(false);
      setCreateCandidate(null);
      setErrors([]);
      setActiveSection(CREATE_SECTION_ID);
      setCreating(true);
    });
  };

  const onDuplicate = () => {
    if (!selected || !selectedLocal) return;
    withDirtyGuard(() => {
      // Copy the persisted source line — not the panel draft — so invalid edits
      // withheld by write-valid-only never land in the document.
      const { next, newName, body, ok } = duplicateInstLine(getSource(), selected, localNames);
      if (!ok) return;
      const nextDraft = withSubpatRows(parseInstrumentBody(body), selected);
      selectedRef.current = newName;
      applySource(next);
      setSelected(newName);
      setDraft(nextDraft);
      setBaseline(cloneInst(nextDraft));
      setErrors([]);
      syncPreviewOctave(nextDraft, chip, schema);
      revealInst(newName, { focus: false, reveal: true });
      restorePanelFocus();
    });
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleteReferenced(false);
  };

  const confirmDelete = () => {
    if (!selected || !selectedLocal) {
      closeDelete();
      return;
    }
    const name = selected;
    const idx = instNames.indexOf(name);
    const remaining = instNames.filter((n) => n !== name);
    const neighbor = remaining[idx] ?? remaining[idx - 1] ?? null;
    // Point the next parse at the neighbor before it runs, so it does not
    // clear the panel and then land on the first instrument in the song.
    selectedRef.current = neighbor;
    applySource(deleteInstLine(getSource(), name));
    closeDelete();
    if (neighbor && ast?.insts?.[neighbor]) {
      const nextDraft = cloneInst(ast.insts[neighbor]);
      setSelected(neighbor);
      setDraft(nextDraft);
      setBaseline(cloneInst(nextDraft));
      setErrors([]);
      syncPreviewOctave(nextDraft, chip, schema);
      revealInst(neighbor, { focus: false, reveal: true });
    } else {
      setSelected(null);
      setDraft({});
      setBaseline({});
      setErrors([]);
      revealInst(null);
    }
    restorePanelFocus();
  };

  const onDelete = () => {
    if (!selected || !selectedLocal) return;
    // Resolve pending draft edits before the delete confirmation (spec 099).
    withDirtyGuard(() => {
      setDeleteReferenced(instIsReferenced(getSource(), selected));
      setDeleteOpen(true);
    });
  };

  const onRename = () => {
    if (!selected || !selectedLocal) return;
    withDirtyGuard(() => {
      setRenameValue(selected);
      setRenameUpdateRefs(true);
      setRenameError(null);
      setRenameOpen(true);
    });
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
      setRenameError('Must start with a letter or underscore; then letters, digits, underscore, or hyphen.');
      return;
    }
    if (localNames.has(nextName)) {
      setRenameError(`Name '${nextName}' is already used.`);
      return;
    }
    // Rename the persisted source line only — do not flush an invalid draft.
    const { next, ok } = renameInstrumentInSource(getSource(), selected, nextName, {
      updateReferences: renameUpdateRefs,
    });
    if (!ok) return;
    applySource(next);
    setSelected(nextName);
    closeRename();
    revealInst(nextName, { focus: false, reveal: true });
    restorePanelFocus();
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

  useEffect(() => {
    if (!deleteOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDelete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteOpen]);

  useLayoutEffect(() => {
    if (!renameOpen && !dirtyNavOpen && !deleteOpen) {
      setRenameBounds(null);
      setDialogBounds(null);
      return;
    }
    const syncBounds = () => {
      const el = bodyRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const bounds = { top: r.top, left: r.left, width: r.width, height: r.height };
      setRenameBounds(bounds);
      setDialogBounds(bounds);
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
  }, [renameOpen, dirtyNavOpen, deleteOpen]);

  const copyImported = () => {
    if (!selected) return;
    withDirtyGuard(() => {
      // Read draftRef so Discard → Copy uses the reverted baseline props.
      const d = draftRef.current;
      const type = String(d.type ?? schema.types[0]?.id ?? '');
      const name = uniqueInstName(selected, localNames);
      const body = withSubpatRows({ ...d, __loc: undefined }, selected);
      const { next } = replaceInstLine(
        insertInstLine(getSource(), `inst ${name} type=${type}`),
        name,
        body,
        fieldOrder,
      );
      selectedRef.current = name;
      applySource(next);
      const nextDraft = cloneInst(body);
      setSelected(name);
      setDraft(nextDraft);
      setBaseline(cloneInst(nextDraft));
      setErrors([]);
      syncPreviewOctave(nextDraft, chip, schema);
      revealInst(name, { focus: false, reveal: true });
      restorePanelFocus();
    });
  };

  const playNote = (note: string, options?: InstNotePreviewOptions) => {
    const creatingNow = creatingRef.current;
    const candidate = createCandidateRef.current;
    if (creatingNow && !candidate) return;
    const name = creatingNow ? CREATE_PREVIEW_INST : selectedRef.current;
    if (!name) return;
    lastPreviewNote.current = note;
    setActiveNote(note);
    // Refs stay current across key events between renders (same as getMidiAudition).
    const draftPatch = creatingNow && candidate
      ? instrumentDraftPreviewPatch(candidate.draft)
      : dirtyRef.current
        ? instrumentDraftPreviewPatch(draftRef.current)
        : undefined;
    const merged: InstNotePreviewOptions = { ...options };
    if (draftPatch || options?.instPatch) {
      // Explicit audition overrides (e.g. uge strip) win over draft props.
      merged.instPatch = { ...(draftPatch ?? {}), ...(options?.instPatch ?? {}) };
    }
    previewNote(name, note, merged);
  };

  const playHit = (label: string, options?: InstNotePreviewOptions) => {
    playNote(label, { mode: 'hit', ...options });
  };

  const releaseNote = () => {
    setActiveNote(null);
    stopPreview();
  };

  /** Percussion oneshot (noise / DMC / uge_note): clear highlight without stopping audio. */
  const isPercussionOneshot = previewMode === 'oneshot' || previewMode === 'uge_note';
  const releaseHoldPreview = () => {
    if (isPercussionOneshot) {
      setActiveNote(null);
      return;
    }
    releaseNote();
  };

  const shiftPianoOctave = useCallback((delta: number) => {
    setPianoOctave((o) => Math.max(PIANO_OCTAVE_MIN, Math.min(PIANO_OCTAVE_MAX, o + delta)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const auditionKey = e.code === 'KeyA'
        || e.code === 'Space'
        || e.key === ' '
        || e.key === 'Spacebar'
        || e.key.toLowerCase() === 'a';
      if (previewMode !== 'melodic') {
        // A and Space audition even when a select or button has focus. Text
        // fields still take the key so names and numbers can be typed.
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (bodyRef.current?.dataset.bbInstEditorOpen !== 'true') return;
        if (isInstrumentEditorTypingTarget(e.target) && (e.target as HTMLElement).tagName !== 'SELECT') return;
        if (!auditionKey) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'keydown' && !e.repeat) {
          if (previewMode === 'uge_note') {
            playHit('hit', {
              sustain: false,
              instPatch: typeof previewDraft.uge_note === 'string' && previewDraft.uge_note.trim()
                ? undefined
                : { uge_note: 'C-6' },
            });
          } else {
            playHit('hit', { sustain: false });
          }
        }
        if (e.type === 'keyup') releaseHoldPreview();
        return;
      }
      if (!shouldHandleInstrumentPreviewKey(e, bodyRef.current)) return;
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
      if (e.type === 'keydown' && !e.repeat) playNote(found.note, { sustain: true });
      if (e.type === 'keyup') releaseNote();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  });

  const waveDef = schema.waveform && fieldApplies(schema.waveform.whenType, instType)
    ? schema.waveform
    : undefined;
  const waveSamples = waveDef
    ? normalizeWaveSamples(workingDraft[waveDef.field], waveDef.length, waveDef.min, waveDef.max)
    : [];
  const subpatSet = typeof workingDraft.subpat === 'string' && workingDraft.subpat.trim().length > 0;
  const quietWave = waveDef && waveSamples.length && Math.max(...waveSamples) < waveDef.max;
  const visibleFields = schema.fields.filter((f) => fieldApplies(f.whenType, instType));

  const clearOrSetField = (name: string, next: string) => {
    if (!next) {
      const cleared = { ...workingDraft };
      delete cleared[name];
      writeDraft(cleared);
      return;
    }
    patch({ [name]: next });
  };

  /** Keep a vendor prefix such as `gb:width` when the parsed value carries `format`. */
  const setChoiceField = (name: string, next: string) => {
    if (!next.trim()) {
      clearOrSetField(name, '');
      return;
    }
    const current = workingDraft[name];
    if (current && typeof current === 'object' && 'format' in current) {
      const format = String((current as { format?: string }).format ?? '').trim();
      const n = Number(next);
      if (format && Number.isFinite(n)) {
        patch({ [name]: { value: n, format } });
        return;
      }
    }
    patch({ [name]: next });
  };

  const renderDefaultField = (field: ChipInstrumentFieldDef) => {
    const value = formatInstrumentFieldValue(field.name, workingDraft[field.name]);
    const fieldId = `bb-inst-field-${field.name}`;
    if (field.widget === 'note' || field.widget === 'uge_note') {
      const options = field.widget === 'uge_note' ? UGE_NOTE_OPTIONS : BEATBAX_NOTE_OPTIONS;
      const opts = value && !options.includes(value) ? [value, ...options] : options;
      return (
        <SettingsField key={field.name} id={fieldId} label={field.label} hint={field.hint}>
          <select
            id={fieldId}
            className="bb-settings-select"
            disabled={!canEditFields}
            value={value}
            onChange={(e) => clearOrSetField(field.name, e.target.value)}
          >
            <option value="">—</option>
            {opts.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </SettingsField>
      );
    }
    return (
      <SettingsField key={field.name} id={fieldId} label={field.label} hint={field.hint}>
        <input
          id={fieldId}
          className="bb-settings-number"
          disabled={!canEditFields}
          type="number"
          min={field.min ?? 0}
          max={field.max ?? 127}
          value={value}
          onChange={(e) => clearOrSetField(field.name, e.target.value)}
        />
      </SettingsField>
    );
  };

  const renderVoiceField = (field: ChipInstrumentFieldDef) => {
    const raw = workingDraft[field.name];
    const value = formatInstrumentFieldValue(field.name, raw);
    const fieldId = `bb-inst-field-${field.name}`;
    if (field.widget === 'bool') {
      return (
        <ToggleRow
          key={field.name}
          checked={value === 'true' || value === '1'}
          disabled={!canEditFields}
          label={field.label}
          title={field.hint}
          onChange={(checked) => patch({ [field.name]: checked ? 'true' : 'false' })}
        />
      );
    }
    if (field.widget === 'sample') {
      return (
        <InstrumentSampleField
          key={`${creating ? CREATE_PREVIEW_INST : (selected ?? '')}:${field.name}`}
          chip={chip}
          disabled={!canEditFields}
          field={field}
          value={value}
          onChange={(next) => clearOrSetField(field.name, next)}
        />
      );
    }
    if (field.name === 'subpat') {
      const subpatName = typeof raw === 'string' ? raw.trim() : value.trim();
      const subpatLine = subpatName ? findSubpatLineIndex(getSource(), subpatName) : -1;
      const canReveal = Boolean(subpatName && subpatLine >= 0 && revealSubpat);
      const revealHelp = canReveal
        ? `Show subpat ${subpatName} in the source editor`
        : `No subpat ${subpatName} definition in this file`;
      return (
        <div className="bb-settings-row bb-inst-editor__subpat-row" key={field.name}>
          <span className="bb-settings-label" id={`${fieldId}-label`} title={field.hint}>{field.label}</span>
          <div className="bb-inst-editor__subpat-controls" role="group" aria-labelledby={`${fieldId}-label`}>
            <span className="bb-inst-editor__subpat-name" id={fieldId}>{subpatName || '—'}</span>
            {subpatName ? (
              <button
                type="button"
                className="bb-inst-editor__toolbar-btn bb-inst-editor__subpat-link"
                disabled={!canReveal}
                title={revealHelp}
                aria-label={revealHelp}
                onClick={() => {
                  if (canReveal && subpatName) revealSubpat?.(subpatName);
                }}
                dangerouslySetInnerHTML={{ __html: icon('arrows-pointing-in', 'w-3.5 h-3.5') }}
              />
            ) : null}
          </div>
        </div>
      );
    }
    return (
      <SettingsField key={field.name} id={fieldId} label={field.label} hint={field.hint}>
        {field.widget === 'enum' && field.values ? (
          field.values.length <= 8 ? (
            <div
              className="bb-inst-editor__choices"
              id={fieldId}
              role="radiogroup"
              aria-label={field.label}
            >
              <button
                type="button"
                className="bb-inst-editor__choice bb-inst-editor__choice--clear"
                disabled={!canEditFields || !value}
                title={value
                  ? `Clear ${field.label} (omit from instrument; use default)`
                  : `${field.label} is already omitted`}
                aria-label={`Clear ${field.label}`}
                onClick={() => setChoiceField(field.name, '')}
              >
                <span dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }} />
              </button>
              {(value && !field.values.includes(value) ? [value, ...field.values] : field.values).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  className="bb-inst-editor__choice"
                  aria-checked={value === v}
                  disabled={!canEditFields}
                  onClick={() => setChoiceField(field.name, v)}
                >
                  {v}
                </button>
              ))}
            </div>
          ) : (
            <select
              id={fieldId}
              className="bb-settings-select"
              disabled={!canEditFields}
              value={value}
              onChange={(e) => setChoiceField(field.name, e.target.value)}
            >
              <option value="">—</option>
              {field.values.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )
        ) : (
          <input
            id={fieldId}
            className={field.widget === 'int' ? 'bb-settings-number' : 'bb-settings-text'}
            disabled={!canEditFields}
            type={field.widget === 'int' ? 'number' : 'text'}
            min={field.min}
            max={field.max}
            value={value}
            onChange={(e) => patch({ [field.name]: e.target.value })}
          />
        )}
      </SettingsField>
    );
  };

  const envelopeField = visibleFields.find((f) => f.widget === 'envelope' && !f.nav);
  const sweepField = visibleFields.find((f) => f.widget === 'sweep' && !f.nav);
  const paneFields = visibleFields.filter((f) => !f.nav && f.name !== 'subpat');
  const voiceFields = paneFields.filter((f) => !isHardwarePropField(f) && !isDefaultPropField(f));
  const defaultFields = paneFields.filter(isDefaultPropField);
  const subpatName = typeof workingDraft.subpat === 'string' ? workingDraft.subpat.trim() : '';
  const subpatRows = Array.isArray(workingDraft.subpatRows) ? workingDraft.subpatRows as SubPatternRowLike[] : [];
  const subpatBlockInSource = Boolean(subpatName) && findSubpatLineIndex(getSource(), subpatName) >= 0;
  const subpatAttachNames = [...collectLocalSubpatNames(getSource())]
    .filter((name) => {
      if (name === subpatName) return false;
      const table = (ast?.subpatterns as Record<string, { rows?: unknown[] }> | undefined)?.[name];
      return Array.isArray(table?.rows) && table.rows.length > 0;
    })
    .sort();
  const subpatSharedWith = subpatName
    ? Object.keys(ast?.insts ?? {}).filter((name) => (
      name !== selected
      && localNames.has(name)
      && String(ast?.insts?.[name]?.subpat ?? '').trim() === subpatName
    ))
    : [];
  const editorSections = useMemo(() => {
    if (creating) {
      const createPage = { id: CREATE_SECTION_ID, label: 'New' };
      if (!createCandidate) return [createPage];
      return [
        createPage,
        ...listInstrumentEditorSections({
          schema,
          type: instType,
          hasInstrument: true,
        }),
      ];
    }
    return listInstrumentEditorSections({
      schema,
      type: instType,
      hasInstrument: Boolean(selected),
    });
  }, [creating, createCandidate, schema, instType, selected]);
  useEffect(() => {
    if (!editorSections.some((section) => section.id === activeSection)) {
      setActiveSection(editorSections[0]?.id ?? (creating ? CREATE_SECTION_ID : 'properties'));
    }
  }, [activeSection, creating, editorSections]);
  const siblingPeriod = Number(formatInstrumentFieldValue('env_period', workingDraft.env_period));
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      // Nested prompts: Escape cancels; backdrop click does not dismiss them.
      if (renameOpen) {
        closeRename();
        return;
      }
      if (dirtyNavOpen) {
        resolveDirtyNav('cancel');
        return;
      }
      if (deleteOpen) {
        closeDelete();
        return;
      }
      requestCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDelete, closeRename, deleteOpen, dirtyNavOpen, open, renameOpen, resolveDirtyNav]);
  const catalogKey = `${selected ?? ''}|${pickerNames.map((name) => {
    const type = String(ast?.insts?.[name]?.type ?? (name === selected ? draft.type : '') ?? '');
    return `${name}:${instrumentOptionLabel(name, type, !localNames.has(name))}`;
  }).join('|')}`;
  useEffect(() => {
    const options = pickerNames.map((name) => {
      const type = String(ast?.insts?.[name]?.type ?? (name === selected ? draft.type : '') ?? '');
      return {
        name,
        label: instrumentOptionLabel(name, type, !localNames.has(name)),
      };
    });
    eventBus.emit('instrument-editor:catalog', { options, selected });
    // catalogKey already snapshots names, labels, and selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogKey, eventBus]);

  const showToolbarHint = (hint: string, anchor: HTMLElement) => {
    const tip = toolbarTipRef.current;
    if (!tip) return;
    placeToolbarTip(tip, hint, anchor);
  };
  const toolbarHintProps = (hint: string) => ({
    onMouseEnter: (event: React.MouseEvent<HTMLButtonElement>) => showToolbarHint(hint, event.currentTarget),
    onMouseLeave: () => hideToolbarTip(toolbarTipRef.current),
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => showToolbarHint(hint, event.currentTarget),
    onBlur: () => hideToolbarTip(toolbarTipRef.current),
  });

  const liveEditHintFor = (on: boolean) => (on ? 'Live edit mode - on' : 'Live edit mode - off');
  const liveEditHint = liveEditHintFor(liveEdit);
  const applyHint = creating
    ? (createCandidate
      ? 'Create the instrument in the song and open it for editing'
      : 'Choose a type, template, or copy source first')
    : dirty
      ? 'Write panel draft to the .bax instrument line'
      : 'No panel changes to write';
  const createActionLabel = 'Create';
  const revertHint = dirty
    ? 'Discard panel edits and reload from the editor'
    : 'No panel changes to discard';

  if (!open) return null;

  const sectionClass = (id: string) => (
    `bb-inst-editor__section${activeSection === id ? ' is-active' : ''}`
  );

  return (
    <div
      className="bb-inst-editor-backdrop bb-inst-editor-backdrop--open"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestCloseRef.current();
      }}
    >
    <div
      aria-label="Instrument Editor"
      aria-modal="true"
      className="bb-inst-editor-modal"
      data-bb-inst-editor-open="true"
      ref={bodyRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="bb-inst-editor-modal__header">
        <span className="bb-inst-editor-modal__title">Instrument Editor</span>
        <span className="bb-settings-modal-hint">
          {formatCommandShortcut('view.toggleInstrumentEditor', getClientProfile(), detectShortcutPlatform())}
        </span>
        <button
          aria-label="Close"
          className="bb-inst-editor-modal__close"
          onClick={() => requestCloseRef.current()}
          type="button"
        >
          ✕
        </button>
      </div>
    <div
      className={`bb-inst-editor${renameOpen || dirtyNavOpen || deleteOpen ? ' is-dialog-open' : ''}${dirty ? ' is-draft-dirty' : ''}`}
    >
      <div className="bb-inst-editor__chrome">
      <div className="bb-inst-editor__chrome-row">
      <div className="bb-inst-editor__toolbar" role="toolbar" aria-label="Instrument actions">
        <button
          type="button"
          className="bb-inst-editor__toolbar-btn"
          aria-label="New instrument"
          {...toolbarHintProps(creating ? 'Already creating a new instrument' : 'New instrument')}
          aria-disabled={creating ? 'true' : undefined}
          disabled={creating}
          onClick={onNew}
          dangerouslySetInnerHTML={{ __html: icon('plus', 'w-3.5 h-3.5') }}
        />
        <button
          type="button"
          className="bb-inst-editor__toolbar-btn"
          aria-label="Duplicate instrument"
          {...toolbarHintProps(creating ? 'Unavailable while creating' : 'Duplicate instrument')}
          aria-disabled={creating || !selectedLocal ? 'true' : undefined}
          disabled={creating || !selectedLocal}
          onClick={onDuplicate}
          dangerouslySetInnerHTML={{ __html: icon('document-duplicate', 'w-3.5 h-3.5') }}
        />
        <button
          type="button"
          className="bb-inst-editor__toolbar-btn"
          aria-label="Rename instrument"
          {...toolbarHintProps(creating ? 'Unavailable while creating' : 'Rename instrument')}
          aria-disabled={creating || !selectedLocal ? 'true' : undefined}
          disabled={creating || !selectedLocal}
          onClick={onRename}
          dangerouslySetInnerHTML={{ __html: icon('pencil', 'w-3.5 h-3.5') }}
        />
        <button
          type="button"
          className="bb-inst-editor__toolbar-btn"
          aria-label="Show in editor"
          {...toolbarHintProps(creating ? 'Unavailable while creating' : 'Show this instrument in the editor')}
          aria-disabled={creating || !selected ? 'true' : undefined}
          disabled={creating || !selected}
          onClick={() => {
            if (!selected || creating) return;
            withDirtyGuard(() => {
              setModalOpen(false);
              revealInst(selected, { focus: true, reveal: true });
            });
          }}
          dangerouslySetInnerHTML={{ __html: icon('arrows-pointing-in', 'w-3.5 h-3.5') }}
        />
        <button
          type="button"
          className="bb-inst-editor__toolbar-btn"
          aria-label="Delete instrument"
          {...toolbarHintProps(creating ? 'Unavailable while creating' : 'Delete instrument')}
          aria-disabled={creating || !selectedLocal ? 'true' : undefined}
          disabled={creating || !selectedLocal}
          onClick={onDelete}
          dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }}
        />
        <span className="bb-inst-editor__toolbar-sep" aria-hidden="true" />
        <button
          type="button"
          className={`bb-inst-editor__toolbar-btn${liveEdit && !creating ? ' is-active' : ''}`}
          aria-label="Live edit"
          aria-pressed={liveEdit}
          {...toolbarHintProps(creating ? 'Unavailable while creating' : liveEditHint)}
          aria-disabled={creating ? 'true' : undefined}
          disabled={creating}
          onClick={(event) => {
            if (creating) return;
            const next = !liveEdit;
            if (!setLiveEdit(next)) return;
            showToolbarHint(liveEditHintFor(next), event.currentTarget);
          }}
          dangerouslySetInnerHTML={{ __html: icon('bolt', 'w-3.5 h-3.5') }}
        />
        {/* Always mount Apply/Revert so Live toggle does not shift icon positions. */}
        <button
          type="button"
          className={`bb-inst-editor__toolbar-btn${
            (creating && createCandidate) || (dirty && !liveEdit) ? ' is-dirty' : ''
          }${liveEdit && !creating ? ' is-slot-hidden' : ''}`}
          aria-label={creating ? createActionLabel : 'Write panel draft to the editor'}
          aria-hidden={liveEdit && !creating ? true : undefined}
          tabIndex={liveEdit && !creating ? -1 : undefined}
          {...toolbarHintProps(applyHint)}
          disabled={creating
            ? (!createCandidate || Boolean(newInstNameError) || errors.length > 0)
            : (liveEdit || !selectedLocal || !dirty || errors.length > 0)}
          onClick={creating ? applyCreateCandidate : applyDraft}
          dangerouslySetInnerHTML={{ __html: icon('check-circle', 'w-3.5 h-3.5') }}
        />
        <button
          type="button"
          className={`bb-inst-editor__toolbar-btn${liveEdit || creating ? ' is-slot-hidden' : ''}`}
          aria-label="Discard panel edits and reload from the editor"
          aria-hidden={liveEdit || creating ? true : undefined}
          tabIndex={liveEdit || creating ? -1 : undefined}
          {...toolbarHintProps(revertHint)}
          disabled={liveEdit || creating || !selectedLocal || !dirty}
          onClick={revertDraft}
          dangerouslySetInnerHTML={{ __html: icon('arrow-uturn-left', 'w-3.5 h-3.5') }}
        />
      </div>
      <div className="bb-inst-editor__identity">
        <div className="bb-inst-editor__field">
          <label className="bb-settings-label" htmlFor="bb-inst-picker">Instrument</label>
          <select
            id="bb-inst-picker"
            className="bb-settings-select"
            aria-label="Select instrument"
            disabled={creating || !pickerNames.length}
            value={selected ?? ''}
            onChange={(e) => {
              const name = e.target.value;
              if (!name) return;
              const selectEl = e.currentTarget;
              withDirtyGuard(() => {
                // Already past the dirty prompt — leave New without nesting another guard.
                if (creatingRef.current) abandonCreating();
                loadInst(name, ast, { reveal: true, focus: false });
                selectEl.blur();
                restorePanelFocus();
              });
            }}
          >
            {!pickerNames.length ? <option value="">No instruments</option> : null}
            {pickerNames.map((name) => {
              const type = String(ast?.insts?.[name]?.type ?? (name === selected ? draft.type : '') ?? '');
              return (
                <option key={name} value={name}>
                  {instrumentOptionLabel(name, type, !localNames.has(name))}
                </option>
              );
            })}
          </select>
        </div>
        {creating ? (
          <div className="bb-inst-editor__field bb-inst-editor__field--status">
            <span className="bb-settings-label">Status</span>
            <p className="bb-settings-note bb-inst-editor__field-status">
              {createCandidate
                ? `Creating ${String(createCandidate.draft.type ?? 'instrument')} - return to New and Create to add it`
                : 'Creating - choose a type, template, or copy source'}
            </p>
          </div>
        ) : selected ? (
          <>
            <div className="bb-inst-editor__field">
              <span className="bb-settings-label">Name</span>
              <input className="bb-settings-text" value={selected} disabled readOnly />
            </div>
            <div className="bb-inst-editor__field">
              <label className="bb-settings-label" htmlFor="bb-inst-type">Type</label>
              <select
                id="bb-inst-type"
                className="bb-settings-select"
                disabled={!selectedLocal}
                value={instType}
                onChange={(e) => patch({ type: e.target.value })}
              >
                {schema.types.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <p className="bb-settings-note bb-inst-editor__field--note">No instruments</p>
        )}
      </div>
      </div>
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
      {dirtyNavOpen && dialogBounds
        ? createPortal(
          <div
            className="bb-inst-editor__dialog-backdrop"
            role="presentation"
            style={{
              position: 'fixed',
              top: dialogBounds.top,
              left: dialogBounds.left,
              width: dialogBounds.width,
              height: dialogBounds.height,
            }}
          >
            <div
              className="bb-inst-editor__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bb-inst-dirty-title"
            >
              <div className="bb-inst-editor__dialog-header">
                <span id="bb-inst-dirty-title" className="bb-inst-editor__dialog-title">
                  Unsaved instrument draft
                </span>
                <button
                  type="button"
                  className="bb-inst-editor__dialog-close"
                  aria-label="Close"
                  onClick={() => resolveDirtyNav('cancel')}
                >
                  ✕
                </button>
              </div>
              <div className="bb-inst-editor__dialog-body">
                <p className="bb-inst-editor__dialog-copy">
                  {creating
                    ? 'Create this instrument in the song, discard the new-instrument edits, or cancel and keep editing.'
                    : 'Write your panel edits to the editor, discard them, or cancel and keep editing.'}
                </p>
                {errors.length ? (
                  <ul className="bb-inst-editor__errors" role="alert">
                    {errors.map((err, i) => <li key={i}>{err.field}: {err.message}</li>)}
                  </ul>
                ) : null}
              </div>
              <div className="bb-inst-editor__dialog-footer">
                <button type="button" className="bb-settings-btn-secondary" onClick={() => resolveDirtyNav('cancel')}>
                  Cancel
                </button>
                <button type="button" className="bb-settings-btn-secondary" onClick={() => resolveDirtyNav('discard')}>
                  Discard
                </button>
                <button type="button" className="bb-settings-btn-primary" onClick={() => resolveDirtyNav('apply')}>
                  Apply
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
      {deleteOpen && selected && dialogBounds
        ? createPortal(
          <div
            className="bb-inst-editor__dialog-backdrop"
            role="presentation"
            style={{
              position: 'fixed',
              top: dialogBounds.top,
              left: dialogBounds.left,
              width: dialogBounds.width,
              height: dialogBounds.height,
            }}
          >
            <div
              className="bb-inst-editor__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bb-inst-delete-title"
            >
              <div className="bb-inst-editor__dialog-header">
                <span id="bb-inst-delete-title" className="bb-inst-editor__dialog-title">
                  Delete instrument
                </span>
                <button
                  type="button"
                  className="bb-inst-editor__dialog-close"
                  aria-label="Close"
                  onClick={closeDelete}
                >
                  ✕
                </button>
              </div>
              <div className="bb-inst-editor__dialog-body">
                <p className="bb-inst-editor__dialog-copy">
                  {deleteReferenced
                    ? `Instrument '${selected}' is still referenced. Delete it anyway?`
                    : `Delete instrument '${selected}'?`}
                </p>
              </div>
              <div className="bb-inst-editor__dialog-footer">
                <button type="button" className="bb-settings-btn-secondary" onClick={closeDelete}>
                  Cancel
                </button>
                <button type="button" className="bb-settings-btn-danger" onClick={confirmDelete}>
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
      <div className="bb-inst-editor__layout">
          <nav aria-label="Instrument sections" className="bb-inst-editor__nav">
            {editorSections.map((section) => (
              <button
                aria-selected={activeSection === section.id}
                className={`bb-settings-nav-btn${activeSection === section.id ? ' bb-settings-nav-btn--active' : ''}`}
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                type="button"
              >
                {section.label}
              </button>
            ))}
          </nav>
          <div className="bb-inst-editor__main">
            {selected && !selectedLocal ? (
              <div className="bb-inst-editor__banner bb-settings-warning">
                <span>Imported instruments are read-only.</span>
                <button type="button" className="bb-settings-btn-secondary" onClick={copyImported}>
                  Copy into song
                </button>
              </div>
            ) : null}
          <div className="bb-inst-editor__pane">
        {creating && activeSection === CREATE_SECTION_ID ? (
          <div className="bb-inst-editor__create">
            <SectionHeading>New instrument</SectionHeading>
            <p className="bb-settings-note">
              Choose a type, template, or copy source. Audition in Preview, tweak Properties / Hardware / Macros, then Create. Leave the name blank to auto-name.
            </p>
            <section className="bb-inst-editor__create-group" aria-label="Name">
              <h3 className="bb-inst-editor__stack-title">
                <label htmlFor="bb-inst-new-name">Name</label>
              </h3>
              <input
                id="bb-inst-new-name"
                className="bb-settings-text bb-inst-editor__create-name"
                value={newInstName}
                spellCheck={false}
                autoComplete="off"
                placeholder="Auto (e.g. lead, lead2)"
                aria-invalid={Boolean(newInstNameError)}
                aria-describedby={newInstNameError ? 'bb-inst-new-name-error' : undefined}
                onChange={(e) => validateNewInstName(e.target.value)}
              />
              {newInstNameError ? (
                <p id="bb-inst-new-name-error" className="bb-inst-editor__dialog-error" role="alert">
                  {newInstNameError}
                </p>
              ) : null}
            </section>
            {schema.types.length > 0 ? (
              <section className="bb-inst-editor__create-group" aria-label="Type">
                <h3 className="bb-inst-editor__stack-title">Type</h3>
                <div className="bb-inst-editor__create-types" role="list">
                  {schema.types.map((type) => {
                    const selectedType = createCandidate?.kind === 'type' && createCandidate.id === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        role="listitem"
                        aria-pressed={selectedType}
                        className={`bb-inst-editor__create-type${selectedType ? ' is-selected' : ''}`}
                        onClick={() => selectCreateType(type.id)}
                      >
                        <span className="bb-inst-editor__create-type-label">{type.label}</span>
                        {type.description ? (
                          <span className="bb-inst-editor__create-type-desc">{type.description}</span>
                        ) : (
                          <span className="bb-inst-editor__create-type-desc">{type.id}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {(schema.presets.length > 0 || !schema.types.length) ? (
              <section className="bb-inst-editor__create-group" aria-label="Templates">
                <label className="bb-inst-editor__dialog-check">
                  <input
                    type="checkbox"
                    checked={showCreateTemplates}
                    onChange={(e) => setShowCreateTemplates(e.target.checked)}
                  />
                  <span>Start from a template</span>
                </label>
                {showCreateTemplates ? (
                  <div className="bb-inst-editor__create-list">
                    {schema.presets.map((preset) => {
                      const typeLabel = schema.types.find((type) => type.id === preset.type)?.label ?? preset.type;
                      const selectedPreset = createCandidate?.kind === 'preset' && createCandidate.id === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          aria-pressed={selectedPreset}
                          className={`bb-inst-editor__create-preset${selectedPreset ? ' is-selected' : ''}`}
                          onClick={() => selectCreatePreset(preset.id, preset.content)}
                        >
                          <span className="bb-inst-editor__create-preset-main">
                            <span className="bb-inst-editor__create-preset-name">{preset.label}</span>
                            {preset.description ? (
                              <span className="bb-inst-editor__create-preset-desc">{preset.description}</span>
                            ) : null}
                          </span>
                          <span className="bb-inst-editor__create-preset-type">{typeLabel}</span>
                        </button>
                      );
                    })}
                    {!schema.presets.length ? (
                      <button
                        type="button"
                        aria-pressed={createCandidate?.kind === 'type' && createCandidate.id === (schema.types[0]?.id ?? 'pulse1')}
                        className={`bb-inst-editor__create-preset${
                          createCandidate?.kind === 'type' && createCandidate.id === (schema.types[0]?.id ?? 'pulse1')
                            ? ' is-selected'
                            : ''
                        }`}
                        onClick={() => {
                          const type = schema.types[0]?.id ?? 'pulse1';
                          selectCreateType(type);
                        }}
                      >
                        <span className="bb-inst-editor__create-preset-name">Blank</span>
                        <span className="bb-inst-editor__create-preset-type">
                          {schema.types[0]?.label ?? 'Instrument'}
                        </span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}
            {instNames.length > 0 ? (
              <section className="bb-inst-editor__create-group" aria-label="Copy from song">
                <label className="bb-inst-editor__dialog-check">
                  <input
                    type="checkbox"
                    checked={showCreateCopy}
                    onChange={(e) => setShowCreateCopy(e.target.checked)}
                  />
                  <span>Copy from an instrument in this song</span>
                </label>
                {showCreateCopy ? (
                  <div className="bb-inst-editor__create-list bb-inst-editor__create-copy-list">
                    {instNames.map((name) => {
                      const subpat = typeof ast?.insts?.[name]?.subpat === 'string'
                        ? String(ast.insts[name].subpat).trim()
                        : '';
                      const type = String(ast?.insts?.[name]?.type ?? '');
                      const typeLabel = schema.types.find((t) => t.id === type)?.label ?? type;
                      const selectedCopy = createCandidate?.kind === 'copy' && createCandidate.id === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          aria-pressed={selectedCopy}
                          className={`bb-inst-editor__create-preset${selectedCopy ? ' is-selected' : ''}`}
                          onClick={() => selectCreateCopy(name)}
                        >
                          <span className="bb-inst-editor__create-preset-name">
                            {copySourceLabel(name, subpat)}
                          </span>
                          <span className="bb-inst-editor__create-preset-type">
                            {typeLabel || 'Instrument'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            ) : null}
            <div className="bb-inst-editor__create-actions">
              <button
                type="button"
                className="bb-settings-btn-secondary"
                onClick={cancelCreating}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bb-settings-btn-primary"
                disabled={!createCandidate || Boolean(newInstNameError) || errors.length > 0}
                onClick={applyCreateCandidate}
              >
                {createActionLabel}
              </button>
            </div>
          </div>
        ) : (creating ? Boolean(createCandidate) : Boolean(selected)) ? (
          <>
          <div className={sectionClass('properties')}>
            <SectionHeading>Properties</SectionHeading>
            <PropertiesFields
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
          </div>

          <div className={sectionClass('hardware')}>
            <HardwareEnvSweepSection
              envelope={envelopeField}
              sweep={sweepField}
              envelopeValue={envelopeField ? workingDraft[envelopeField.name] : undefined}
              sweepValue={
                sweepField
                  ? (sweepField.storage === 'discrete'
                    ? discreteSweepValueFromDraft(workingDraft as Record<string, unknown>)
                    : workingDraft[sweepField.name])
                  : undefined
              }
              periodSibling={Boolean(
                envelopeField
                && (envelopeField.storage === 'discrete'
                  || visibleFields.some((f) => f.name === 'env_period')),
              )}
              siblingPeriod={Number.isFinite(siblingPeriod) ? siblingPeriod : 0}
              disabled={!canEditFields}
              onEnvelopeChange={(next, siblingPeriodValue) => {
                if (!envelopeField) return;
                if (next == null) {
                  const cleared: Record<string, unknown> = { [envelopeField.name]: undefined };
                  if (envelopeField.storage === 'discrete' || visibleFields.some((f) => f.name === 'env_period')) {
                    cleared.env_period = undefined;
                  }
                  patch(cleared);
                  return;
                }
                // One patch: sequential patches both spread the same stale draft.
                const partial: Record<string, unknown> = { [envelopeField.name]: next };
                if (siblingPeriodValue !== undefined) {
                  partial.env_period = String(siblingPeriodValue);
                }
                patch(partial);
              }}
              onSweepChange={(next) => {
                if (!sweepField) return;
                if (sweepField.storage === 'discrete') {
                  patch(discreteSweepPatchFromCsv(next));
                  return;
                }
                if (next == null) patch({ [sweepField.name]: undefined });
                else patch({ [sweepField.name]: next });
              }}
              sweepPeriodMin={sweepField?.storage === 'discrete' ? 1 : 0}
            />
          </div>

          <div className={sectionClass('waveform')}>
            {waveDef ? (
              <WaveformCanvas
                samples={waveSamples}
                def={waveDef}
                disabled={!canEditFields}
                hex={samplesToHex(waveSamples.slice(0, waveDef.length))}
                quiet={Boolean(quietWave)}
                onChange={(samples) => {
                  patch({ [waveDef.field]: samples });
                }}
              />
            ) : null}
          </div>

          <div className={sectionClass('macros')}>
            <MacroSection
              draft={workingDraft}
              disabled={!canEditFields || subpatSet}
              lockReason={
                creating
                  ? (subpatSet ? 'Software macros are locked while subpat is set.' : null)
                  : !selectedLocal
                    ? 'Imported instruments are read-only. Copy into the song to edit macros.'
                    : subpatSet
                      ? 'Software macros are locked while subpat is set.'
                      : null
              }
              emptyMessage={
                schema.macros.some((m) => !m.nav)
                && schema.macros.filter((m) => !m.nav).every((m) => !fieldApplies(m.whenType, instType))
                  ? `Macros are not available on ${
                    findInstrumentTypeDef(instType, chip, schema)?.label ?? instType
                  } channels`
                  : null
              }
              macros={schema.macros.filter((m) => !m.nav && fieldApplies(m.whenType, instType))}
              onChange={(name, text) => {
                if (text === undefined) {
                  const next = { ...workingDraft };
                  delete next[name];
                  writeDraft(next);
                  return;
                }
                patch({ [name]: text });
              }}
            />
          </div>

            {errors.length ? (
              <ul className="bb-inst-editor__errors">
                {errors.map((err, i) => <li key={i}>{err.field}: {err.message}</li>)}
              </ul>
            ) : null}

          <div className={sectionClass('subpattern')}>
            <SubpatternSection
              attachNames={subpatAttachNames}
              blockInSource={subpatBlockInSource}
              readOnly={!canEditFields}
              rows={subpatRows}
              sharedWith={subpatSharedWith}
              subpatName={subpatName}
              writable={canEditFields && chip === 'gameboy'}
              onAttach={(name) => {
                const table = (ast?.subpatterns as Record<string, { rows?: SubPatternRowLike[] }> | undefined)?.[name];
                if (!table?.rows?.length) return;
                patch({ subpat: name, subpatRows: cloneSubpatRows(table.rows) });
              }}
              onCreate={() => {
                const instBase = creating
                  ? (newInstName.trim() || defaultNewInstBaseName(instType))
                  : (selected && isValidInstName(selected) ? selected : 'inst');
                const name = uniqueInstName(`${instBase}_subpat`, collectLocalSubpatNames(getSource()));
                patch({ subpat: name, subpatRows: [{ empty: true }] });
              }}
              onDetach={() => {
                const next = { ...workingDraft };
                delete next.subpat;
                delete next.subpatRows;
                writeDraft(next);
              }}
              onReveal={subpatName && revealSubpat ? () => revealSubpat(subpatName) : undefined}
              onRows={(rows) => patch({ subpatRows: rows })}
            />
          </div>
          {editorSections.filter((section) => !BUILTIN_SECTION_IDS.has(section.id) && section.id !== CREATE_SECTION_ID).map((section) => (
            <div className={sectionClass(section.id)} key={section.id}>
              <SectionHeading>{section.label}</SectionHeading>
              {visibleFields.filter((field) => field.nav === section.id).map((field) => renderVoiceField(field))}
              <MacroSection
                draft={workingDraft}
                disabled={!canEditFields || subpatSet}
                macros={schema.macros.filter((macro) => macro.nav === section.id && fieldApplies(macro.whenType, instType))}
                onChange={(name, text) => {
                  if (text === undefined) {
                    const next = { ...workingDraft };
                    delete next[name];
                    writeDraft(next);
                    return;
                  }
                  patch({ [name]: text });
                }}
              />
            </div>
          ))}
          </>
        ) : null}
          </div>
        </div>
      </div>
      {(creating ? Boolean(createCandidate) : Boolean(selected)) ? (
        <div className="bb-inst-editor__preview" aria-label="Preview">
          {creating && createCandidate ? (
            <p className="bb-settings-note bb-inst-editor__create-preview-note">
              Auditioning candidate — not in the song until Create.
            </p>
          ) : null}
          {previewMode === 'oneshot' ? (
            <div className="bb-inst-editor__audition">
              <button
                type="button"
                className={`bb-inst-editor__trigger${activeNote === 'hit' ? ' is-active' : ''}`}
                title={isDmcType ? 'Trigger sample (A / Space) — plays to end' : 'Trigger hit (A / Space) — plays to end'}
                onPointerDown={() => playHit('hit', { sustain: false })}
                onPointerUp={releaseHoldPreview}
                onPointerLeave={releaseHoldPreview}
              >
                <span className="bb-inst-editor__pad-title">{isDmcType ? 'Trigger sample' : 'Trigger'}</span>
                <span className="bb-inst-editor__pad-sub">A / Space</span>
                {dmcSampleMeta ? (
                  <span className="bb-inst-editor__pad-meta">
                    Designed
                    {dmcSampleMeta.designedRate != null ? ` rate ${dmcSampleMeta.designedRate}` : ''}
                    {dmcSampleMeta.baseNote ? ` · ${dmcSampleMeta.baseNote}` : ''}
                    {' '}(guidance only)
                  </span>
                ) : null}
              </button>
              <MidiPreviewStrip />
            </div>
          ) : (
            <>
              <div className="bb-inst-editor__preview-bar">
                {previewMode === 'melodic' ? (
                  <div className="bb-inst-editor__preview-lead">
                    <span className="bb-settings-note bb-inst-editor__keys-label">A–J play the marked octave · Z/X shift</span>
                    <OctaveStepper octave={pianoOctave} onChange={setPianoOctave} />
                  </div>
                ) : null}
                {previewMode === 'uge_note' ? (
                  <div className="bb-inst-editor__preview-lead">
                    <span className="bb-settings-note bb-inst-editor__keys-label">UGE / noise clock (audition only)</span>
                  </div>
                ) : null}
                <MidiPreviewStrip />
              </div>
              {previewMode === 'melodic' ? (
                <MiniKeyboard
                  activeNote={activeNote}
                  octave={pianoOctave}
                  onDown={(note) => playNote(note, { sustain: true })}
                  onUp={releaseNote}
                />
              ) : null}
              {previewMode === 'uge_note' ? (
                <div className="bb-inst-editor__pads">
                  <button
                    type="button"
                    className={`bb-inst-editor__trigger${activeNote === 'hit' ? ' is-active' : ''}`}
                    title="Trigger hit (A / Space) — plays to end"
                    onPointerDown={() => {
                      playHit('hit', {
                        sustain: false,
                        instPatch: currentUge ? undefined : { uge_note: 'C-6' },
                      });
                    }}
                    onPointerUp={releaseHoldPreview}
                    onPointerLeave={releaseHoldPreview}
                  >
                    <span className="bb-inst-editor__pad-title">Trigger</span>
                    <span className="bb-inst-editor__pad-sub">{currentUge || 'C-6'}</span>
                  </button>
                  <UgeNoteStrip
                    activeNote={activeNote}
                    marked={currentUge}
                    onDown={(uge) => playHit(uge, { sustain: false, instPatch: { uge_note: uge } })}
                    onUp={() => setActiveNote(null)}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
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

/** Same label+control column as {@link CtrlPair} so icon buttons sit on the input baseline. */
function CtrlPairAction({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="bb-inst-editor__ctrl-pair bb-inst-editor__ctrl-pair--action">
      <span className="bb-inst-editor__ctrl-pair-label" aria-hidden="true">&nbsp;</span>
      {children}
    </div>
  );
}

/** Defined tabs and remaining Add chips on one row. */
function MacroChipStrip({
  tablistLabel,
  tabs,
  addGroupLabel,
  addButtons,
}: {
  tablistLabel: string;
  tabs?: ReactNode;
  addGroupLabel?: string;
  addButtons?: ReactNode;
}): React.JSX.Element | null {
  if (!tabs && !addButtons) return null;
  return (
    <div className="bb-inst-editor__macro-strip">
      {tabs ? (
        <div className="bb-inst-editor__macro-tabs" role="tablist" aria-label={tablistLabel}>
          {tabs}
        </div>
      ) : null}
      {addButtons ? (
        <div className="bb-inst-editor__macro-add" role="group" aria-label={addGroupLabel}>
          {addButtons}
        </div>
      ) : null}
    </div>
  );
}

function PropertiesFields({
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
  if (!voiceFields.length && !defaultFields.length) return null;
  const both = voiceFields.length > 0 && defaultFields.length > 0;

  return (
    <div className="bb-settings-section">
      {voiceFields.length ? (
        <section className="bb-inst-editor__props-group" aria-label="Voice properties">
          {both ? <SectionHeading>Voice</SectionHeading> : null}
          {voiceFields.map((field) => renderVoiceField(field))}
        </section>
      ) : null}
      {defaultFields.length ? (
        <section className="bb-inst-editor__props-group" aria-label="Default note and program">
          {both ? <SectionHeading>Defaults</SectionHeading> : null}
          {defaultFields.map((field) => renderDefaultField(field))}
        </section>
      ) : null}
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
  sweepPeriodMin = 0,
}: {
  envelope?: ChipInstrumentFieldDef;
  sweep?: ChipInstrumentFieldDef;
  envelopeValue: unknown;
  sweepValue: unknown;
  periodSibling: boolean;
  siblingPeriod: number;
  disabled: boolean;
  /** Optional second arg writes discrete `env_period` in the same parent patch. */
  onEnvelopeChange: (csv: string | undefined, siblingPeriod?: number) => void;
  onSweepChange: (csv: string | undefined) => void;
  /** NES discrete sweep validates period 1–7; GB packed sweep allows 0–7. */
  sweepPeriodMin?: number;
}): React.JSX.Element | null {
  type HwTab = 'envelope' | 'sweep';
  const items = useMemo(() => {
    const next: Array<{ id: HwTab; label: string; hint?: string }> = [];
    if (envelope) next.push({ id: 'envelope', label: envelope.label, hint: envelope.hint });
    if (sweep) next.push({ id: 'sweep', label: sweep.label, hint: sweep.hint });
    return next;
  }, [envelope, sweep]);

  const available = useMemo(
    () => items.filter((item) => (
      item.id === 'envelope' ? !hwFieldDefined(envelopeValue) : !hwFieldDefined(sweepValue)
    )),
    [items, envelopeValue, sweepValue],
  );

  if (!items.length) return null;

  const addEnvelope = () => {
    const defaults = { level: 12, direction: 'down' as const, period: 1 };
    if (periodSibling) {
      onEnvelopeChange(`${defaults.level},${defaults.direction}`, defaults.period);
    } else {
      onEnvelopeChange(formatHardwareEnvelope(defaults));
    }
  };
  const addSweep = () => {
    const time = Math.max(sweepPeriodMin, 7);
    onSweepChange(formatHardwareSweep({ time, direction: 'down', shift: 3 }));
  };

  return (
    <div className="bb-inst-editor__hw-section">
      <div className="bb-inst-editor__macros-header">
        <SectionHeading>Hardware</SectionHeading>
        <MacroChipStrip
          tablistLabel="Add hardware envelope or sweep"
          addGroupLabel="Add hardware envelope or sweep"
          addButtons={available.length ? available.map((item) => (
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
          )) : undefined}
        />
      </div>

      <div className="bb-inst-editor__stack-list">
        {envelope && hwFieldDefined(envelopeValue) ? (
          <section className="bb-inst-editor__stack-block" aria-label={envelope.label}>
            <h3 className="bb-inst-editor__stack-title">{envelope.label}</h3>
            <EnvelopeEditor
              hint={envelope.hint}
              disabled={disabled}
              value={envelopeValue}
              periodMax={envelope.max ?? 7}
              periodSibling={periodSibling}
              siblingPeriod={siblingPeriod}
              onChange={onEnvelopeChange}
              onRemove={disabled ? undefined : () => {
                onEnvelopeChange(undefined);
              }}
            />
          </section>
        ) : null}
        {sweep && hwFieldDefined(sweepValue) ? (
          <section className="bb-inst-editor__stack-block" aria-label={sweep.label}>
            <h3 className="bb-inst-editor__stack-title">{sweep.label}</h3>
            <SweepEditor
              hint={sweep.hint}
              disabled={disabled}
              value={sweepValue}
              periodMin={sweepPeriodMin}
              onChange={onSweepChange}
              onRemove={disabled ? undefined : () => onSweepChange(undefined)}
            />
          </section>
        ) : null}
      </div>
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
  onRemove,
}: {
  hint?: string;
  disabled: boolean;
  value: unknown;
  periodMax: number;
  periodSibling: boolean;
  siblingPeriod: number;
  /** When `periodSibling`, pass discrete `env_period` so the parent can patch both at once. */
  onChange: (csv: string | undefined, siblingPeriod?: number) => void;
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
      const csv = formatHardwareEnvelope({ level: next.level, direction: 'flat', period: 0 });
      if (periodSibling) onChange(csv, 0);
      else onChange(csv);
      return;
    }
    if (periodSibling) {
      onChange(`${next.level},${next.direction}`, next.period);
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
          <CtrlPairAction>
            <button
              type="button"
              className="bb-settings-btn-secondary bb-inst-editor__macro-remove"
              title="Remove envelope"
              aria-label="Remove envelope"
              onClick={onRemove}
            >
              <span dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }} />
            </button>
          </CtrlPairAction>
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
  periodMin = 0,
  onChange,
  onRemove,
}: {
  hint?: string;
  disabled: boolean;
  value: unknown;
  periodMin?: number;
  onChange: (csv: string | undefined) => void;
  onRemove?: () => void;
}): React.JSX.Element {
  const parsed = parseHardwareSweep(value);
  const invalid = value != null && value !== '' && !parsed;
  const defaultTime = Math.max(periodMin, 7);
  const time = Math.max(periodMin, parsed?.time ?? defaultTime);
  const direction: SweepDirection = parsed?.direction ?? 'down';
  const shift = parsed?.shift ?? 3;

  const commit = (next: { time: number; direction: SweepDirection; shift: number }) => {
    onChange(formatHardwareSweep({
      ...next,
      time: Math.max(periodMin, Math.min(7, next.time)),
    }));
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
            onClick={() => commit({ time: defaultTime, direction: 'down', shift: 3 })}
          >
            <span dangerouslySetInnerHTML={{ __html: icon('plus', 'w-3 h-3') }} />
            <span>Reset to {defaultTime},down,3</span>
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
            min={periodMin}
            max={7}
            disabled={disabled}
            value={time}
            onChange={(e) => commit({
              time: Math.max(periodMin, Math.min(7, Number(e.target.value) || periodMin)),
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
          <CtrlPairAction>
            <button
              type="button"
              className="bb-settings-btn-secondary bb-inst-editor__macro-remove"
              title="Remove sweep"
              aria-label="Remove sweep"
              onClick={onRemove}
            >
              <span dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }} />
            </button>
          </CtrlPairAction>
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
    const next = normalizeWaveSamples(samples, def.length, def.min, def.max);
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
    const samples = normalizeWaveSamples(parsed.samples, def.length, def.min, def.max);
    if (normalizeField) setHexDraft(samplesToHex(samples));
    onChange(samples);
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
                : normalizeWaveSamples(p.samples, def.length, def.min, def.max);
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

function cloneSubpatRows(rows: SubPatternRowLike[]): SubPatternRowLike[] {
  return rows.map((row) => {
    const next: SubPatternRowLike = { empty: !!row.empty };
    if (row.offset !== undefined) next.offset = row.offset;
    if (row.vol !== undefined) next.vol = row.vol;
    if (row.jump !== undefined) next.jump = row.jump;
    if (row.halt) next.halt = true;
    if (row.timbre !== undefined) next.timbre = row.timbre;
    if (row.fx) next.fx = { code: row.fx.code, param: row.fx.param };
    return next;
  });
}

function subpatRowsSignature(rows: SubPatternRowLike[]): string {
  return rows.map((row) => formatSubPatternRow(row)).join('\n');
}

function parseOptionalFxNibble(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (!/^[0-9A-Fa-f]+$/.test(trimmed)) return undefined;
  const value = /[A-Fa-f]/.test(trimmed) ? parseInt(trimmed, 16) : parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : undefined;
}

function formatFxNibble(value: number): string {
  if (value >= 0 && value <= 15) return value.toString(16).toUpperCase();
  return String(value);
}

function subpatRowHasFields(row: SubPatternRowLike): boolean {
  if (row.empty) return false;
  return (
    (row.offset !== undefined && row.offset !== null)
    || row.vol !== undefined
    || row.timbre !== undefined
    || !!row.fx
    || row.jump !== undefined
    || !!row.halt
  );
}

function normalizeSubpatRow(row: SubPatternRowLike, collapseEmpty = true): SubPatternRowLike {
  if (row.empty) return { empty: true };
  const next: SubPatternRowLike = { empty: false };
  if (row.offset !== undefined && row.offset !== null) next.offset = row.offset;
  else next.offset = null;
  if (row.vol !== undefined) next.vol = row.vol;
  if (row.timbre !== undefined) next.timbre = row.timbre;
  if (row.fx) next.fx = { code: row.fx.code, param: row.fx.param };
  if (row.jump !== undefined) next.jump = row.jump;
  if (row.halt) next.halt = true;
  if (collapseEmpty && !subpatRowHasFields(next)) return { empty: true };
  // Keep a fieldless editing row non-empty so inputs stay enabled mid-edit.
  if (!subpatRowHasFields(next)) return { empty: false, offset: null };
  return next;
}

type SubpatEditField = 'offset' | 'vol' | 'timbre' | 'jump' | 'fxCode' | 'fxParam';

function subpatEditKey(index: number, field: SubpatEditField): string {
  return `${index}:${field}`;
}

function SubpatternRows({
  disabled,
  rows,
  sharedWith,
  onCommit,
}: {
  disabled: boolean;
  rows: SubPatternRowLike[];
  sharedWith?: string[];
  onCommit: (rows: SubPatternRowLike[]) => void;
}): React.JSX.Element {
  const signature = subpatRowsSignature(rows);
  const [draft, setDraft] = useState<SubPatternRowLike[]>(() => cloneSubpatRows(rows.length ? rows : [{ empty: true }]));
  const [rowError, setRowError] = useState<string | null>(null);
  /** Typed text while a cell is focused (allows '-' / empty before blur commit). */
  const [editText, setEditText] = useState<Record<string, string>>({});
  const draftRef = useRef(draft);
  const seen = useRef(signature);
  draftRef.current = draft;

  useEffect(() => {
    if (seen.current === signature) return;
    seen.current = signature;
    const next = cloneSubpatRows(rows.length ? rows : [{ empty: true }]);
    draftRef.current = next;
    setDraft(next);
    setEditText({});
    setRowError(null);
  }, [rows, signature]);

  const commit = (nextRows: SubPatternRowLike[], opts?: { collapseEmpty?: boolean }): boolean => {
    if (!nextRows.length) {
      setRowError('A subpattern needs at least one row.');
      return false;
    }
    const collapseEmpty = opts?.collapseEmpty !== false;
    const normalized = nextRows.map((row) => normalizeSubpatRow(row, collapseEmpty));
    for (let i = 0; i < normalized.length; i++) {
      const row = normalized[i]!;
      if (row.jump !== undefined && (row.jump < 1 || row.jump > normalized.length)) {
        draftRef.current = nextRows;
        setDraft(nextRows);
        setRowError(`Row ${i + 1}: jump must be between 1 and ${normalized.length}.`);
        return false;
      }
      if (row.vol !== undefined && (row.vol < 0 || row.vol > 15)) {
        draftRef.current = nextRows;
        setDraft(nextRows);
        setRowError(`Row ${i + 1}: vol must be 0–15.`);
        return false;
      }
    }
    draftRef.current = normalized;
    setDraft(normalized);
    setRowError(null);
    // Fieldless mid-edit rows stay local until blur / explicit commit.
    if (!collapseEmpty && normalized.some((row) => !row.empty && !subpatRowHasFields(row))) {
      return true;
    }
    const nextSig = subpatRowsSignature(normalized);
    if (nextSig === seen.current) return true;
    seen.current = nextSig;
    onCommit(normalized);
    return true;
  };

  const updateRow = (
    index: number,
    patch: Partial<SubPatternRowLike> | ((row: SubPatternRowLike) => SubPatternRowLike),
    opts?: { collapseEmpty?: boolean },
  ) => {
    const next = cloneSubpatRows(draftRef.current);
    const current = next[index] ?? { empty: true };
    next[index] = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
    commit(next, opts);
  };

  const clearEditField = (index: number, field: SubpatEditField) => {
    const key = subpatEditKey(index, field);
    setEditText((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const cellText = (index: number, field: SubpatEditField, fallback: string): string => {
    const key = subpatEditKey(index, field);
    return editText[key] !== undefined ? editText[key]! : fallback;
  };

  const beginEdit = (index: number, field: SubpatEditField, fallback: string) => {
    setEditText((prev) => ({ ...prev, [subpatEditKey(index, field)]: fallback }));
  };

  const finishEdit = (index: number, field: SubpatEditField) => {
    clearEditField(index, field);
    commit(draftRef.current, { collapseEmpty: true });
  };

  const onEditKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, index: number, field: SubpatEditField) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    (event.target as HTMLInputElement).blur();
  };

  return (
    <div className="bb-inst-editor__subpat-list">
      <div className="bb-inst-editor__subpat-body">
        <div className="bb-inst-editor__subpat-rows">
      {draft.map((row, index) => {
        const empty = !!row.empty;
        // Empty checkbox disables fields; a cleared mid-edit row stays empty=false.
        const fieldsDisabled = disabled || empty;
        const offsetFallback = empty || row.offset === undefined || row.offset === null ? '' : String(row.offset);
        const volFallback = empty || row.vol === undefined ? '' : String(row.vol);
        const timbreFallback = empty || row.timbre === undefined ? '' : String(row.timbre);
        const jumpFallback = empty || row.jump === undefined ? '' : String(row.jump);
        const fxCodeFallback = empty || !row.fx ? '' : formatFxNibble(row.fx.code);
        const fxParamFallback = empty || !row.fx ? '' : formatFxNibble(row.fx.param);
        return (
          <div className="bb-inst-editor__subpat-line" key={index}>
            <span className="bb-inst-editor__subpat-index">{index + 1}</span>
            <label className="bb-inst-editor__subpat-field bb-inst-editor__subpat-field--check">
              <span>Empty</span>
              <input
                type="checkbox"
                aria-label={`Subpattern row ${index + 1} empty`}
                checked={empty}
                disabled={disabled}
                onChange={(event) => {
                  setEditText({});
                  if (event.target.checked) {
                    updateRow(index, { empty: true }, { collapseEmpty: true });
                    return;
                  }
                  updateRow(index, { empty: false, offset: 0 }, { collapseEmpty: true });
                }}
              />
            </label>
            <label className="bb-inst-editor__subpat-field">
              <span>Offset</span>
              <input
                type="text"
                inputMode="numeric"
                className="bb-settings-text bb-inst-editor__subpat-num"
                aria-label={`Subpattern row ${index + 1} offset`}
                disabled={fieldsDisabled}
                value={cellText(index, 'offset', offsetFallback)}
                onFocus={() => beginEdit(index, 'offset', offsetFallback)}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw !== '' && !/^-?\d*$/.test(raw)) return;
                  setEditText((prev) => ({ ...prev, [subpatEditKey(index, 'offset')]: raw }));
                  if (raw === '' || raw === '-') {
                    updateRow(index, (cur) => {
                      const next = { ...cur, empty: false, offset: null };
                      return next;
                    }, { collapseEmpty: false });
                    return;
                  }
                  const value = Number(raw);
                  if (!Number.isFinite(value)) return;
                  updateRow(index, { empty: false, offset: Math.trunc(value) }, { collapseEmpty: false });
                }}
                onBlur={() => finishEdit(index, 'offset')}
                onKeyDown={(event) => onEditKeyDown(event, index, 'offset')}
              />
            </label>
            <label className="bb-inst-editor__subpat-field">
              <span>Vol</span>
              <input
                type="text"
                inputMode="numeric"
                className="bb-settings-text bb-inst-editor__subpat-num"
                aria-label={`Subpattern row ${index + 1} vol`}
                disabled={fieldsDisabled}
                value={cellText(index, 'vol', volFallback)}
                onFocus={() => beginEdit(index, 'vol', volFallback)}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw !== '' && !/^\d*$/.test(raw)) return;
                  setEditText((prev) => ({ ...prev, [subpatEditKey(index, 'vol')]: raw }));
                  if (raw === '') {
                    updateRow(index, (cur) => {
                      const next = { ...cur, empty: false };
                      delete next.vol;
                      return next;
                    }, { collapseEmpty: false });
                    return;
                  }
                  const value = Number(raw);
                  if (!Number.isFinite(value)) return;
                  updateRow(index, {
                    empty: false,
                    vol: Math.max(0, Math.min(15, Math.trunc(value))),
                  }, { collapseEmpty: false });
                }}
                onBlur={() => finishEdit(index, 'vol')}
                onKeyDown={(event) => onEditKeyDown(event, index, 'vol')}
              />
            </label>
            <label className="bb-inst-editor__subpat-field">
              <span>Timbre</span>
              <input
                type="text"
                inputMode="numeric"
                className="bb-settings-text bb-inst-editor__subpat-num"
                aria-label={`Subpattern row ${index + 1} timbre`}
                disabled={fieldsDisabled}
                value={cellText(index, 'timbre', timbreFallback)}
                onFocus={() => beginEdit(index, 'timbre', timbreFallback)}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw !== '' && !/^-?\d*$/.test(raw)) return;
                  setEditText((prev) => ({ ...prev, [subpatEditKey(index, 'timbre')]: raw }));
                  if (raw === '' || raw === '-') {
                    updateRow(index, (cur) => {
                      const next = { ...cur, empty: false };
                      delete next.timbre;
                      return next;
                    }, { collapseEmpty: false });
                    return;
                  }
                  const value = Number(raw);
                  if (!Number.isFinite(value)) return;
                  updateRow(index, { empty: false, timbre: Math.trunc(value) }, { collapseEmpty: false });
                }}
                onBlur={() => finishEdit(index, 'timbre')}
                onKeyDown={(event) => onEditKeyDown(event, index, 'timbre')}
              />
            </label>
            <label className="bb-inst-editor__subpat-field bb-inst-editor__subpat-field--fx">
              <span>Fx</span>
              <span className="bb-inst-editor__subpat-fx">
                <input
                  type="text"
                  inputMode="text"
                  spellCheck={false}
                  className="bb-settings-text bb-inst-editor__subpat-num"
                  aria-label={`Subpattern row ${index + 1} fx code`}
                  placeholder="C"
                  disabled={fieldsDisabled}
                  value={cellText(index, 'fxCode', fxCodeFallback)}
                  onFocus={() => beginEdit(index, 'fxCode', fxCodeFallback)}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setEditText((prev) => ({ ...prev, [subpatEditKey(index, 'fxCode')]: raw }));
                    const trimmed = raw.trim();
                    if (!trimmed) {
                      updateRow(index, (cur) => {
                        const next = { ...cur, empty: false };
                        delete next.fx;
                        return next;
                      }, { collapseEmpty: false });
                      return;
                    }
                    const code = parseOptionalFxNibble(trimmed);
                    if (code === undefined) return;
                    updateRow(index, {
                      empty: false,
                      fx: { code, param: row.fx?.param ?? 0 },
                    }, { collapseEmpty: false });
                  }}
                  onBlur={() => finishEdit(index, 'fxCode')}
                  onKeyDown={(event) => onEditKeyDown(event, index, 'fxCode')}
                />
                <span className="bb-inst-editor__subpat-fx-sep">,</span>
                <input
                  type="text"
                  inputMode="text"
                  spellCheck={false}
                  className="bb-settings-text bb-inst-editor__subpat-num"
                  aria-label={`Subpattern row ${index + 1} fx param`}
                  placeholder="0"
                  disabled={fieldsDisabled}
                  value={cellText(index, 'fxParam', fxParamFallback)}
                  onFocus={() => beginEdit(index, 'fxParam', fxParamFallback)}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setEditText((prev) => ({ ...prev, [subpatEditKey(index, 'fxParam')]: raw }));
                    const trimmed = raw.trim();
                    if (!trimmed) {
                      updateRow(index, (cur) => {
                        const next = { ...cur, empty: false };
                        delete next.fx;
                        return next;
                      }, { collapseEmpty: false });
                      return;
                    }
                    const param = parseOptionalFxNibble(trimmed);
                    if (param === undefined) return;
                    updateRow(index, {
                      empty: false,
                      fx: { code: row.fx?.code ?? 0, param },
                    }, { collapseEmpty: false });
                  }}
                  onBlur={() => finishEdit(index, 'fxParam')}
                  onKeyDown={(event) => onEditKeyDown(event, index, 'fxParam')}
                />
              </span>
            </label>
            <label className="bb-inst-editor__subpat-field">
              <span>Jump</span>
              <input
                type="text"
                inputMode="numeric"
                className="bb-settings-text bb-inst-editor__subpat-num"
                aria-label={`Subpattern row ${index + 1} jump`}
                disabled={fieldsDisabled}
                value={cellText(index, 'jump', jumpFallback)}
                onFocus={() => beginEdit(index, 'jump', jumpFallback)}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw !== '' && !/^\d*$/.test(raw)) return;
                  setEditText((prev) => ({ ...prev, [subpatEditKey(index, 'jump')]: raw }));
                  if (raw === '') {
                    updateRow(index, (cur) => {
                      const next = { ...cur, empty: false };
                      delete next.jump;
                      return next;
                    }, { collapseEmpty: false });
                    return;
                  }
                  const value = Number(raw);
                  if (!Number.isFinite(value)) return;
                  updateRow(index, {
                    empty: false,
                    jump: Math.max(1, Math.min(draft.length, Math.trunc(value))),
                  }, { collapseEmpty: false });
                }}
                onBlur={() => finishEdit(index, 'jump')}
                onKeyDown={(event) => onEditKeyDown(event, index, 'jump')}
              />
            </label>
            <label className="bb-inst-editor__subpat-field bb-inst-editor__subpat-field--check">
              <span>Halt</span>
              <input
                type="checkbox"
                aria-label={`Subpattern row ${index + 1} halt`}
                checked={!empty && !!row.halt}
                disabled={fieldsDisabled}
                onChange={(event) => {
                  updateRow(index, (cur) => {
                    const next = { ...cur, empty: false, halt: event.target.checked || undefined };
                    if (!event.target.checked) delete next.halt;
                    else next.halt = true;
                    return next;
                  }, { collapseEmpty: true });
                }}
              />
            </label>
            <button
              aria-label={`Remove subpattern row ${index + 1}`}
              className="bb-inst-editor__toolbar-btn bb-inst-editor__subpat-remove"
              disabled={disabled || draft.length <= 1}
              title={draft.length <= 1 ? 'A subpattern needs at least one row' : 'Remove row'}
              type="button"
              onClick={() => {
                if (draftRef.current.length <= 1) {
                  setRowError('A subpattern needs at least one row.');
                  return;
                }
                setEditText({});
                commit(draftRef.current.filter((_, i) => i !== index), { collapseEmpty: true });
              }}
              dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }}
            />
          </div>
        );
      })}
      {rowError ? <p className="bb-inst-editor__subpat-error" role="alert">{rowError}</p> : null}
      <div className="bb-inst-editor__macro-add">
        <button
          className="bb-inst-editor__macro-add-btn"
          disabled={disabled}
          type="button"
          onClick={() => {
            setEditText({});
            commit([...draftRef.current, { empty: true }], { collapseEmpty: true });
          }}
        >
          <span dangerouslySetInnerHTML={{ __html: icon('plus', 'w-3 h-3') }} />
          <span>Add row</span>
        </button>
      </div>
        </div>
        <aside className="bb-inst-editor__subpat-help" aria-label="Subpattern overview">
          <div className="bb-inst-editor__subpat-help-overview">
            <p>One row = one tick (~60 Hz). Same model as hUGETracker instrument subpatterns. Native <code>subpat</code> locks macros.</p>
            {sharedWith && sharedWith.length > 0 ? (
              <p className="bb-inst-editor__subpat-help-shared">
                Shared with {sharedWith.join(', ')}. Edits update that subpattern for every instrument that uses it.
              </p>
            ) : null}
          </div>
          <div className="bb-inst-editor__subpat-help-fields">
            <p><strong>Offset</strong> — semitones from the played note (− = down)</p>
            <p><strong>Timbre</strong> — duty / noise width / wave that tick (hUGE <code>9xx</code>)</p>
            <p><strong>Fx</strong> — one tracker effect for the tick (<code>C</code> vol, <code>9</code> timbre, …); blank = none</p>
            <p><strong>Jump</strong> — next row (1-based #); back = loop</p>
            <p><strong>Halt</strong> — stop advancing</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SubpatternSection({
  writable,
  readOnly,
  subpatName,
  rows,
  blockInSource,
  attachNames,
  sharedWith,
  onCreate,
  onAttach,
  onDetach,
  onRows,
  onReveal,
}: {
  writable: boolean;
  readOnly: boolean;
  subpatName: string;
  rows: SubPatternRowLike[];
  blockInSource: boolean;
  attachNames: string[];
  sharedWith: string[];
  onCreate: () => void;
  onAttach: (name: string) => void;
  onDetach: () => void;
  onRows: (rows: SubPatternRowLike[]) => void;
  onReveal?: () => void;
}): React.JSX.Element {
  const showRows = rows.length > 0;
  const unresolved = Boolean(subpatName) && !showRows && !blockInSource;
  const revealHelp = onReveal && (blockInSource || showRows)
    ? `Show subpat ${subpatName} in the source editor`
    : `No subpat ${subpatName} definition in this file`;

  return (
    <div className="bb-inst-editor__subpat">
      <div className="bb-inst-editor__macros-header">
        <SectionHeading>Subpattern</SectionHeading>
        <div className="bb-inst-editor__subpat-actions">
          {subpatName ? (
            <span className="bb-inst-editor__subpat-name">{subpatName}</span>
          ) : (
            <span className="bb-settings-note">No subpattern attached</span>
          )}
          {writable ? (
            <button
              className="bb-inst-editor__macro-add-btn"
              type="button"
              title={subpatName
                ? 'Create a new subpattern for this instrument. The current block stays in the song.'
                : 'Create a subpattern for this instrument'}
              onClick={onCreate}
            >
              <span dangerouslySetInnerHTML={{ __html: icon('plus', 'w-3 h-3') }} />
              <span>Create</span>
            </button>
          ) : null}
          {writable ? (
            <select
              aria-label="Attach subpattern"
              className="bb-settings-select bb-inst-editor__subpat-attach"
              disabled={!attachNames.length}
              title={attachNames.length
                ? 'Use a different subpattern from this song'
                : 'No other subpatterns in this song'}
              value=""
              onChange={(event) => {
                const name = event.target.value;
                if (name) onAttach(name);
              }}
            >
              <option value="">Attach…</option>
              {attachNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          ) : null}
          {writable && subpatName ? (
            <button className="bb-inst-editor__macro-add-btn" type="button" onClick={onDetach}>
              Detach
            </button>
          ) : null}
          {subpatName ? (
            <button
              aria-label={revealHelp}
              className="bb-inst-editor__toolbar-btn bb-inst-editor__subpat-link"
              disabled={!onReveal || !blockInSource}
              title={revealHelp}
              type="button"
              onClick={() => onReveal?.()}
              dangerouslySetInnerHTML={{ __html: icon('arrows-pointing-in', 'w-3.5 h-3.5') }}
            />
          ) : null}
        </div>
      </div>
      {unresolved ? (
        <NoteText>No subpat {subpatName} definition in this file.</NoteText>
      ) : null}
      {!showRows && sharedWith.length ? (
        <NoteText>Shared with {sharedWith.join(', ')}. Edits update that subpattern for every instrument that uses it.</NoteText>
      ) : null}
      {showRows ? (
        <SubpatternRows
          disabled={!writable || readOnly}
          rows={rows}
          sharedWith={sharedWith}
          onCommit={onRows}
        />
      ) : null}
    </div>
  );
}

function MacroSection({
  macros,
  draft,
  disabled,
  lockReason,
  emptyMessage,
  onChange,
}: {
  macros: ChipInstrumentMacroDef[];
  draft: InstrumentNode;
  disabled: boolean;
  /** When set, macros are supported but temporarily non-editable. */
  lockReason?: string | null;
  /** When no macros apply for this type, still show the Macros heading with this note. */
  emptyMessage?: string | null;
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
  if (!macros.length) {
    if (!emptyMessage) return null;
    return (
      <div className="bb-inst-editor__macros">
        <div className="bb-inst-editor__macros-header">
          <SectionHeading>Macros</SectionHeading>
        </div>
        <NoteText>{emptyMessage}</NoteText>
      </div>
    );
  }

  return (
    <div className="bb-inst-editor__macros">
      <div className="bb-inst-editor__macros-header">
        <SectionHeading>Macros</SectionHeading>
        <MacroChipStrip
          tablistLabel="Add macro"
          addGroupLabel="Add macro"
          addButtons={available.length ? available.map((macro) => (
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
              }}
            >
              <span dangerouslySetInnerHTML={{ __html: icon('plus', 'w-3 h-3') }} />
              <span>{macro.label}</span>
            </button>
          )) : undefined}
        />
      </div>

      {lockReason ? <NoteText>{lockReason}</NoteText> : null}

      <div className="bb-inst-editor__stack-list">
        {defined.map((macro) => {
          const parsed = parseMacro(draft[macro.name]);
          if (!parsed) return null;
          return (
            <section className="bb-inst-editor__stack-block" key={macro.name} aria-label={macro.label}>
              <h3 className="bb-inst-editor__stack-title">
                {macro.label}
                {macro.kind === 'hardware' ? <span className="bb-inst-editor__macro-hw">hw</span> : null}
              </h3>
              <MacroRow
                def={macro}
                values={parsed.values}
                loopPoint={parsed.loopPoint}
                disabled={disabled}
                onChange={(values, loopPoint) => {
                  if (!values.length) {
                    onChange(macro.name, undefined);
                    return;
                  }
                  onChange(macro.name, macroToFieldText(values, loopPoint));
                }}
                onRemove={disabled ? undefined : () => onChange(macro.name, undefined)}
              />
            </section>
          );
        })}
      </div>
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
            <CtrlPairAction>
              <button
                type="button"
                className="bb-settings-btn-secondary bb-inst-editor__macro-remove"
                title={`Remove ${def.label} macro`}
                aria-label={`Remove ${def.label} macro`}
                onClick={onRemove}
              >
                <span dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }} />
              </button>
            </CtrlPairAction>
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
  setDevicesListener?: (listener: (() => void) | null) => void;
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
  const [fault, setFault] = useState('');
  const [flash, setFlash] = useState('');
  const flashTimer = useRef<number | null>(null);
  const supported = MidiStepEntryService.isSupported();

  const showFlash = useCallback((text: string) => {
    setFlash(text);
    if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      flashTimer.current = null;
      setFlash('');
    }, 2500);
  }, []);

  useEffect(() => () => {
    if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
  }, []);

  const refreshDevices = useCallback(async (force = false, announce = false) => {
    if (!supported) {
      setDevices([]);
      return;
    }
    if (announce) setRefreshing(true);
    try {
      const controller = midiController();
      const accessErr = await controller?.requestMidiAccess?.(force);
      if (typeof accessErr === 'string' && accessErr) {
        setDevices([]);
        setFlash('');
        setFault(accessErr);
        return;
      }
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
      setFault('');
      if (announce) {
        showFlash(next.length === 1 ? 'Found 1 device' : `Found ${next.length} devices`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFault(msg ? `MIDI refresh failed: ${msg}` : 'MIDI refresh failed');
    } finally {
      if (announce) setRefreshing(false);
    }
  }, [showFlash, supported]);

  useEffect(() => {
    if (midiEnabled) void refreshDevices();
    else {
      setDevices([]);
      setFault('');
      setFlash('');
    }
  }, [midiEnabled, refreshDevices]);

  useEffect(() => {
    const controller = midiController();
    if (!controller?.setDevicesListener) return;
    controller.setDevicesListener(() => { void refreshDevices(); });
    return () => controller.setDevicesListener?.(null);
  }, [refreshDevices]);

  const selectedName = devices.find((d) => d.id === midiDevice)?.name;
  let status = 'Unsupported';
  if (supported) {
    if (!midiEnabled) status = 'MIDI off';
    else if (!midiDevice || !selectedName) status = devices.length ? 'No device selected' : 'No devices found';
    else status = `Ready · ${selectedName}`;
  }
  const statusLine = refreshing ? 'Checking devices…' : (fault || flash || status);

  return (
    <div className="bb-inst-editor__midi-bar" role="group" aria-label="MIDI input">
      <div className="bb-inst-editor__midi-controls">
        <label className="bb-inst-editor__midi-enable" title="MIDI plays any key">
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
          aria-busy={refreshing}
          disabled={!supported || !midiEnabled || refreshing}
          onClick={() => { void refreshDevices(true, true); }}
        >
          Refresh
        </button>
      </div>
      <span className="bb-inst-editor__midi-status" aria-live="polite">{statusLine}</span>
    </div>
  );
}

function UgeNoteStrip({
  activeNote,
  marked,
  onDown,
  onUp,
}: {
  activeNote: string | null;
  marked: string;
  onDown: (ugeNote: string) => void;
  onUp: () => void;
}): React.JSX.Element {
  const notes = ugeNotePreviewStrip();
  return (
    <div className="bb-inst-editor__uge-keys" role="group" aria-label="UGE noise clock">
      {notes.map((uge) => (
        <button
          key={uge}
          type="button"
          className={`bb-inst-editor__uge-key${activeNote === uge ? ' is-active' : ''}${marked === uge ? ' is-current' : ''}`}
          title={marked === uge
            ? `${uge} — this instrument’s clock (audition; does not write uge_note)`
            : `${uge} (audition; does not write uge_note)`}
          onPointerDown={() => onDown(uge)}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          {uge}
        </button>
      ))}
    </div>
  );
}

function OctaveStepper({
  octave,
  onChange,
}: {
  octave: number;
  onChange: (next: number) => void;
}): React.JSX.Element {
  const clampOctave = (next: number) =>
    Math.max(PIANO_OCTAVE_MIN, Math.min(PIANO_OCTAVE_MAX, next));
  return (
    <div className="bb-inst-editor__octave" role="group" aria-label="Computer-key octave">
      <button
        type="button"
        className="bb-inst-editor__octave-btn"
        aria-label="Octave down"
        title="Octave down (Z)"
        disabled={octave <= PIANO_OCTAVE_MIN}
        onClick={() => onChange(clampOctave(octave - 1))}
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
        onClick={() => onChange(clampOctave(octave + 1))}
      >
        +
      </button>
    </div>
  );
}

function MiniKeyboard({
  activeNote,
  octave,
  onDown,
  onUp,
}: {
  activeNote: string | null;
  octave: number;
  onDown: (note: string) => void;
  onUp: () => void;
}): React.JSX.Element {
  const pianoRef = useRef<HTMLDivElement>(null);
  const computerRef = useRef<HTMLDivElement>(null);
  const octaves: number[] = [];
  for (let oct = PIANO_OCTAVE_MIN; oct <= PIANO_OCTAVE_MAX; oct += 1) octaves.push(oct);

  useEffect(() => {
    const piano = pianoRef.current;
    const span = computerRef.current;
    if (!piano || !span) return;
    const left = span.offsetLeft - (piano.clientWidth - span.offsetWidth) / 2;
    piano.scrollTo({ left: Math.max(0, left) });
  }, [octave]);

  return (
    <div className="bb-inst-editor__keys">
      <div className="bb-inst-editor__piano" aria-label="Preview keyboard" ref={pianoRef}>
        {octaves.map((oct) => {
          const isComputer = oct === octave;
          return (
            <div
              className={`bb-inst-editor__octave-span${isComputer ? ' is-computer' : ''}`}
              key={oct}
              ref={isComputer ? computerRef : undefined}
            >
              {PIANO_SLOTS.map((slot) => {
                const whiteNote = pianoNote(slot.white.degree, oct);
                const blackNote = slot.black ? pianoNote(slot.black.degree, oct) : null;
                const whiteCaption = isComputer
                  ? slot.white.key.toUpperCase()
                  : (slot.white.degree === 'C' ? String(oct) : '');
                return (
                  <div key={whiteNote} className="bb-inst-editor__key-slot">
                    <button
                      type="button"
                      className={`bb-inst-editor__white${activeNote === whiteNote ? ' is-active' : ''}`}
                      title={isComputer ? `${whiteNote} (${slot.white.key.toUpperCase()})` : whiteNote}
                      onPointerDown={() => onDown(whiteNote)}
                      onPointerUp={onUp}
                      onPointerLeave={onUp}
                    >
                      {whiteCaption}
                    </button>
                    {slot.black && blackNote ? (
                      <button
                        type="button"
                        className={`bb-inst-editor__black${activeNote === blackNote ? ' is-active' : ''}`}
                        title={isComputer ? `${blackNote} (${slot.black.key.toUpperCase()})` : blackNote}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          onDown(blackNote);
                        }}
                        onPointerUp={onUp}
                        onPointerLeave={onUp}
                      >
                        {isComputer ? slot.black.key.toUpperCase() : ''}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function createDesktopInstrumentEditor(
  options: DesktopInstrumentEditorOptions,
): DesktopInstrumentEditorHandle {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const handleRef = { current: null as DesktopInstrumentEditorHandle | null };
  let root: Root | null = mountReactRoot(host);

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
    getMidiAudition: () => handleRef.current?.getMidiAudition() ?? null,
    isOpen: () => handleRef.current?.isOpen() ?? false,
    setAst: (ast) => call((h) => h.setAst(ast)),
    dispose: () => {
      handleRef.current?.dispose();
      unmountReactRoot(host, root);
      host.remove();
      root = null;
    },
  };
}
