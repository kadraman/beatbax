const editorInstance = {
  getValue: () => '',
  setValue: jest.fn(),
  getSelection: () => null,
  executeEdits: jest.fn(),
  focus: jest.fn(),
  dispose: jest.fn(),
  updateOptions: jest.fn(),
  getPosition: () => ({ lineNumber: 1, column: 1 }),
  setPosition: jest.fn(),
  revealPositionInCenter: jest.fn(),
  onDidChangeModelContent: jest.fn(),
  getModel: () => ({ getValueInRange: () => '' }),
  layout: jest.fn(),
};

export const languages = {
  register: jest.fn(),
  setMonarchTokensProvider: jest.fn(),
  setLanguageConfiguration: jest.fn(),
  registerCompletionItemProvider: jest.fn(),
  registerHoverProvider: jest.fn(),
  registerCodeActionProvider: jest.fn(),
  registerCodeLensProvider: jest.fn(),
};

export const editor = {
  create: jest.fn(() => editorInstance),
  setTheme: jest.fn(),
  defineTheme: jest.fn(),
};

export const KeyCode = {};
export const KeyMod = {};
