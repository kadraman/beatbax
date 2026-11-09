/**
 * Desktop Monaco view preferences (feature 108).
 * Pure mapping from stored choices to Monaco options. No editor instance.
 */

export const EDITOR_FONT_SIZE_MIN = 8;
export const EDITOR_FONT_SIZE_MAX = 32;
export const EDITOR_FONT_SIZE_DEFAULT = 14;
export const EDITOR_FONT_SIZE_STEP = 2;

export const EDITOR_FONT_FAMILY_IDS = [
  'default',
  'consolas',
  'cascadia-mono',
  'courier-new',
  'ui-monospace',
] as const;

export type EditorFontFamilyId = (typeof EDITOR_FONT_FAMILY_IDS)[number];
export type EditorTabSize = 2 | 4;
export type EditorLineNumbers = 'on' | 'off';
export type EditorWhitespace = 'selection' | 'all' | 'none';
export type EditorCursorStyle = 'line' | 'block' | 'underline';

export interface EditorFontFamilyChoice {
  id: EditorFontFamilyId;
  label: string;
}

export const EDITOR_FONT_FAMILY_CHOICES: readonly EditorFontFamilyChoice[] = [
  { id: 'default', label: 'Default' },
  { id: 'consolas', label: 'Consolas' },
  { id: 'cascadia-mono', label: 'Cascadia Mono' },
  { id: 'courier-new', label: 'Courier New' },
  { id: 'ui-monospace', label: 'System ui-monospace' },
];

const NAMED_FONT_STACKS: Record<Exclude<EditorFontFamilyId, 'default'>, string> = {
  consolas: 'Consolas, monospace',
  'cascadia-mono': '"Cascadia Mono", monospace',
  'courier-new': '"Courier New", monospace',
  'ui-monospace': 'ui-monospace, monospace',
};

export const EDITOR_VIEW_DEFAULTS = {
  fontFamily: 'default' as EditorFontFamilyId,
  tabSize: 2 as EditorTabSize,
  minimap: true,
  lineNumbers: 'on' as EditorLineNumbers,
  whitespace: 'selection' as EditorWhitespace,
  indentGuides: true,
  cursorStyle: 'line' as EditorCursorStyle,
  fontSize: EDITOR_FONT_SIZE_DEFAULT,
  mouseWheelZoom: false,
};

export interface EditorViewPreferences {
  fontFamily: EditorFontFamilyId;
  tabSize: EditorTabSize;
  minimap: boolean;
  lineNumbers: EditorLineNumbers;
  whitespace: EditorWhitespace;
  indentGuides: boolean;
  cursorStyle: EditorCursorStyle;
  fontSize: number;
  mouseWheelZoom: boolean;
}

export interface EditorViewMonacoOptions {
  fontSize: number;
  fontFamily: string;
  tabSize: EditorTabSize;
  insertSpaces: true;
  minimap: { enabled: boolean };
  lineNumbers: EditorLineNumbers;
  renderWhitespace: EditorWhitespace;
  guides: { indentation: boolean };
  cursorStyle: EditorCursorStyle;
  mouseWheelZoom: boolean;
}

export function clampEditorFontSize(value: number): number {
  if (!Number.isFinite(value)) return EDITOR_FONT_SIZE_DEFAULT;
  return Math.min(EDITOR_FONT_SIZE_MAX, Math.max(EDITOR_FONT_SIZE_MIN, Math.round(value)));
}

export function stepEditorFontSize(current: number, direction: 1 | -1): number {
  return clampEditorFontSize(clampEditorFontSize(current) + direction * EDITOR_FONT_SIZE_STEP);
}

export function normalizeEditorFontFamily(value: unknown): EditorFontFamilyId {
  return EDITOR_FONT_FAMILY_IDS.includes(value as EditorFontFamilyId)
    ? (value as EditorFontFamilyId)
    : EDITOR_VIEW_DEFAULTS.fontFamily;
}

export function normalizeEditorTabSize(value: unknown): EditorTabSize {
  return Number(value) === 4 ? 4 : 2;
}

export function normalizeEditorLineNumbers(value: unknown): EditorLineNumbers {
  return value === 'off' ? 'off' : 'on';
}

export function normalizeEditorWhitespace(value: unknown): EditorWhitespace {
  return value === 'all' || value === 'none' ? value : 'selection';
}

export function normalizeEditorCursorStyle(value: unknown): EditorCursorStyle {
  return value === 'block' || value === 'underline' ? value : 'line';
}

/** Monaco's own platform default, used for the Default font-family choice. */
export function platformMonacoFontFamily(): string {
  const hint = typeof navigator === 'undefined'
    ? ''
    : `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  if (/Mac|iPhone|iPad/i.test(hint)) return "Menlo, Monaco, 'Courier New', monospace";
  if (/Linux|X11/i.test(hint) && !/Android/i.test(hint)) return "'Droid Sans Mono', 'monospace', monospace";
  return "Consolas, 'Courier New', monospace";
}

export function editorFontFamilyStack(id: EditorFontFamilyId, defaultStack: string): string {
  return id === 'default' ? defaultStack : NAMED_FONT_STACKS[id];
}

export interface WheelModifierKeys {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

/** Platform modifier for font zoom: Ctrl on Windows/Linux, Cmd or Ctrl on macOS. */
export function editorWheelZoomModifierActive(keys: WheelModifierKeys, mac: boolean): boolean {
  if (keys.shift || keys.alt) return false;
  if (mac) return keys.meta || keys.ctrl;
  return keys.ctrl && !keys.meta;
}

export function editorViewMonacoOptions(
  prefs: EditorViewPreferences,
  defaultFontFamily: string,
): EditorViewMonacoOptions {
  return {
    fontSize: clampEditorFontSize(prefs.fontSize),
    fontFamily: editorFontFamilyStack(prefs.fontFamily, defaultFontFamily),
    tabSize: normalizeEditorTabSize(prefs.tabSize),
    insertSpaces: true,
    minimap: { enabled: prefs.minimap },
    lineNumbers: prefs.lineNumbers,
    renderWhitespace: prefs.whitespace,
    guides: { indentation: prefs.indentGuides },
    cursorStyle: prefs.cursorStyle,
    mouseWheelZoom: prefs.mouseWheelZoom,
  };
}
