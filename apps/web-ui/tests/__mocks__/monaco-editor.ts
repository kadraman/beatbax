// Mock for monaco-editor in tests
export const editor = {
  create: jest.fn(),
  setTheme: jest.fn(),
  defineTheme: jest.fn(),
  setModelMarkers: jest.fn(),
};

export const languages = {
  register: jest.fn(),
  setLanguageConfiguration: jest.fn(),
  setMonarchTokensProvider: jest.fn(),
  registerCompletionItemProvider: jest.fn(),
  registerHoverProvider: jest.fn(),
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

export default {
  editor,
  languages,
  MarkerSeverity,
};
