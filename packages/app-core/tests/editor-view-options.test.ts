import { getCapabilities } from '../src/client-profile';
import { StorageKey } from '../src/utils/local-storage';
import {
  EDITOR_FONT_SIZE_DEFAULT,
  EDITOR_VIEW_DEFAULTS,
  clampEditorFontSize,
  editorViewMonacoOptions,
  editorWheelZoomModifierActive,
  stepEditorFontSize,
  type EditorViewPreferences,
} from '../src/editor/editor-view-options';

const factory: EditorViewPreferences = {
  fontFamily: 'default',
  tabSize: 2,
  minimap: true,
  lineNumbers: 'on',
  whitespace: 'selection',
  indentGuides: true,
  cursorStyle: 'line',
  fontSize: 14,
  mouseWheelZoom: false,
};

describe('editor view option mapping', () => {
  it('maps factory preferences onto today\'s Monaco look', () => {
    expect(editorViewMonacoOptions(factory, 'DEFAULT_STACK')).toEqual({
      fontSize: 14,
      fontFamily: 'DEFAULT_STACK',
      tabSize: 2,
      insertSpaces: true,
      minimap: { enabled: true },
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      guides: { indentation: true },
      cursorStyle: 'line',
      mouseWheelZoom: false,
    });
  });

  it('maps each named font, whitespace mode, and cursor style', () => {
    const options = editorViewMonacoOptions({
      ...factory,
      fontFamily: 'cascadia-mono',
      tabSize: 4,
      minimap: false,
      lineNumbers: 'off',
      whitespace: 'all',
      indentGuides: false,
      cursorStyle: 'block',
      fontSize: 40,
      mouseWheelZoom: true,
    }, 'DEFAULT_STACK');
    expect(options.fontFamily).toBe('"Cascadia Mono", monospace');
    expect(options.tabSize).toBe(4);
    expect(options.insertSpaces).toBe(true);
    expect(options.minimap).toEqual({ enabled: false });
    expect(options.lineNumbers).toBe('off');
    expect(options.renderWhitespace).toBe('all');
    expect(options.guides).toEqual({ indentation: false });
    expect(options.cursorStyle).toBe('block');
    expect(options.fontSize).toBe(32);
    expect(options.mouseWheelZoom).toBe(true);
    expect(editorViewMonacoOptions({ ...factory, fontFamily: 'consolas' }, 'DEFAULT_STACK').fontFamily)
      .toBe('Consolas, monospace');
    expect(editorViewMonacoOptions({ ...factory, fontFamily: 'courier-new' }, 'DEFAULT_STACK').fontFamily)
      .toBe('"Courier New", monospace');
    expect(editorViewMonacoOptions({ ...factory, fontFamily: 'ui-monospace' }, 'DEFAULT_STACK').fontFamily)
      .toBe('ui-monospace, monospace');
    expect(editorViewMonacoOptions({ ...factory, whitespace: 'none', cursorStyle: 'underline' }, 'DEFAULT_STACK'))
      .toMatchObject({ renderWhitespace: 'none', cursorStyle: 'underline' });
  });

  it('uses Ctrl on Windows and Cmd or Ctrl on macOS', () => {
    const plain = { ctrl: false, meta: false, shift: false, alt: false };
    expect(editorWheelZoomModifierActive(plain, false)).toBe(false);
    expect(editorWheelZoomModifierActive({ ...plain, ctrl: true }, false)).toBe(true);
    expect(editorWheelZoomModifierActive({ ...plain, ctrl: true, shift: true }, false)).toBe(false);
    expect(editorWheelZoomModifierActive({ ...plain, meta: true }, false)).toBe(false);
    expect(editorWheelZoomModifierActive({ ...plain, meta: true }, true)).toBe(true);
    expect(editorWheelZoomModifierActive({ ...plain, ctrl: true }, true)).toBe(true);
  });

  it('clamps font size to 8–32 and steps by 2', () => {
    expect(clampEditorFontSize(Number.NaN)).toBe(EDITOR_FONT_SIZE_DEFAULT);
    expect(clampEditorFontSize(7.2)).toBe(8);
    expect(clampEditorFontSize(32.4)).toBe(32);
    expect(stepEditorFontSize(31, 1)).toBe(32);
    expect(stepEditorFontSize(8, -1)).toBe(8);
    expect(stepEditorFontSize(14, 1)).toBe(16);
    expect(stepEditorFontSize(14, -1)).toBe(12);
  });
});

describe('editor view preference atoms', () => {
  async function loadStore() {
    jest.resetModules();
    return import('../src/stores/settings.store');
  }

  it('defaults to the factory look and lists the new editor keys', async () => {
    localStorage.clear();
    const store = await loadStore();
    expect(store.settingFontSize.get()).toBe(EDITOR_VIEW_DEFAULTS.fontSize);
    expect(store.settingEditorFontFamily.get()).toBe('default');
    expect(store.settingEditorTabSize.get()).toBe(2);
    expect(store.settingEditorMinimap.get()).toBe(true);
    expect(store.settingEditorLineNumbers.get()).toBe('on');
    expect(store.settingEditorWhitespace.get()).toBe('selection');
    expect(store.settingEditorIndentGuides.get()).toBe(true);
    expect(store.settingEditorCursorStyle.get()).toBe('line');
    expect(store.settingEditorMouseWheelZoom.get()).toBe(false);
    expect(store.settingFoldComments.get()).toBe(false);
    expect(store.SECTION_KEYS.editor).toEqual(expect.arrayContaining([
      StorageKey.FONT_SIZE,
      StorageKey.FONT_FAMILY,
      StorageKey.TAB_SIZE,
      StorageKey.MINIMAP,
      StorageKey.LINE_NUMBERS,
      StorageKey.WHITESPACE,
      StorageKey.INDENT_GUIDES,
      StorageKey.CURSOR_STYLE,
      StorageKey.MOUSE_WHEEL_ZOOM,
      StorageKey.FOLD_COMMENTS,
    ]));
  });

  it('falls back when stored view values are corrupt and clamps font size', async () => {
    localStorage.clear();
    localStorage.setItem('beatbax:editor.fontSize', '99');
    localStorage.setItem('beatbax:editor.fontFamily', 'comic-sans');
    localStorage.setItem('beatbax:editor.tabSize', '3');
    localStorage.setItem('beatbax:editor.minimap', 'yes');
    localStorage.setItem('beatbax:editor.lineNumbers', 'relative');
    localStorage.setItem('beatbax:editor.whitespace', 'boundary');
    localStorage.setItem('beatbax:editor.cursorStyle', 'beam');
    const store = await loadStore();
    expect(store.settingFontSize.get()).toBe(32);
    expect(localStorage.getItem('beatbax:editor.fontSize')).toBe('32');
    expect(store.settingEditorFontFamily.get()).toBe('default');
    expect(store.settingEditorTabSize.get()).toBe(2);
    expect(store.settingEditorMinimap.get()).toBe(true);
    expect(store.settingEditorLineNumbers.get()).toBe('on');
    expect(store.settingEditorWhitespace.get()).toBe('selection');
    expect(store.settingEditorCursorStyle.get()).toBe('line');
    store.settingFontSize.set(7);
    expect(store.settingFontSize.get()).toBe(8);
    store.settingEditorFontFamily.set('courier-new');
    expect(store.settingEditorFontFamily.get()).toBe('courier-new');
    expect(localStorage.getItem('beatbax:editor.fontFamily')).toBe('courier-new');
  });
});

describe('web-lite editor chrome boundary', () => {
  it('does not enable the Settings panel', () => {
    expect(getCapabilities('web-lite').settingsPanel).toBe(false);
  });
});
