// Mock for monaco-editor in tests
export const KeyMod = {
  CtrlCmd: 2048,
  Shift: 1024,
  Alt: 512,
  WinCtrl: 256,
};

export const KeyCode = {
  KeyD: 24,
  KeyE: 25,
  KeyF: 27,
  KeyH: 35,
  KeyJ: 36,
  KeyM: 43,
  KeyP: 52,
  KeyR: 53,
  KeyV: 60,
  Space: 10,
  Escape: 9,
  Enter: 3,
};

export const editor = {
  create: jest.fn(),
  setTheme: jest.fn(),
  defineTheme: jest.fn(),
  setModelMarkers: jest.fn(),
  getModelMarkers: jest.fn(() => []),
  registerCommand: jest.fn(),
  MouseTargetType: {
    GUTTER_GLYPH_MARGIN: 2,
  },
};

export const languages = {
  register: jest.fn(),
  setLanguageConfiguration: jest.fn(),
  setMonarchTokensProvider: jest.fn(),
  registerCompletionItemProvider: jest.fn(),
  registerHoverProvider: jest.fn(),
  registerCodeLensProvider: jest.fn(),
  registerFoldingRangeProvider: jest.fn(),
  registerDocumentHighlightProvider: jest.fn(),
  registerDocumentSemanticTokensProvider: jest.fn(),
  registerDocumentFormattingEditProvider: jest.fn(),
  registerSignatureHelpProvider: jest.fn(),
  registerCodeActionProvider: jest.fn(),
  CodeActionKind: {
    QuickFix: 'quickfix',
    Refactor: 'refactor',
  },
  FoldingRangeKind: {
    Comment: 1,
  },
  typescript: {
    javascriptDefaults: {
      setDiagnosticsOptions: jest.fn(),
    },
  },
  CompletionItemKind: {
    Keyword: 1,
    Snippet: 2,
    Function: 3,
    Value: 4,
    Enum: 5,
    Constant: 6,
    Property: 7,
    File: 8,
  },
  CompletionItemInsertTextRule: {
    InsertAsSnippet: 4,
  },
};

export const MarkerSeverity = {
  Error: 8,
  Warning: 4,
  Info: 2,
};

export const GlyphMarginLane = {
  Left: 1,
  Right: 2,
};

export class Range {
  constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {}
}

export class Emitter<T = void> {
  event = jest.fn();
  fire = jest.fn();
  dispose = jest.fn();
}

export default {
  editor,
  languages,
  MarkerSeverity,
  GlyphMarginLane,
  KeyMod,
  KeyCode,
  Emitter,
};
