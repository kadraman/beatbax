// Token specifications for lazy construction by the lexer.
// This module intentionally does not import `chevrotain` to avoid requiring
// the ESM-only package at module-load time in CommonJS test environments.

export const tokenSpecs = [
  // skipped
  { name: 'WhiteSpace', pattern: /\s+/, skip: true },
  // String literal (supports triple-quoted multiline and single/double quoted)
  { name: 'StringLiteral', pattern: /"""([\s\S]*?)"""|'''([\s\S]*?)'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/ },

  { name: 'Comment', pattern: /#[^\n]*/, skip: true },

  // directives
  { name: 'Pat', pattern: /pat/ },
  { name: 'Inst', pattern: /inst/ },
  { name: 'Seq', pattern: /seq/ },
  { name: 'Channel', pattern: /channel/ },
  { name: 'Chip', pattern: /chip/ },
  { name: 'Song', pattern: /song/ },
  { name: 'Bpm', pattern: /bpm/ },
  { name: 'Play', pattern: /play/ },
  { name: 'Export', pattern: /export/ },

  // literals
  { name: 'StringLiteral', pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/ },
  { name: 'NumberLiteral', pattern: /[+-]?\d+/ },
  { name: 'Id', pattern: /[A-Za-z_][A-Za-z0-9_\-]*/ },

  // punctuation
  { name: 'Equals', pattern: /=/ },
  { name: 'Colon', pattern: /:/ },
  { name: 'LParen', pattern: /\(/ },
  { name: 'RParen', pattern: /\)/ },
  { name: 'LBracket', pattern: /\[/ },
  { name: 'RBracket', pattern: /\]/ },
  { name: 'Comma', pattern: /,/ },
  { name: 'Asterisk', pattern: /\*/ },
  { name: 'Dot', pattern: /\./ },
];

export default { tokenSpecs };