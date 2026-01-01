import tokenModule from './tokens';

let cached = {
  builtTokens: null as any | null,
  LexerInstance: null as any | null,
};

function buildTokensAndLexer() {
  // Attempt to require Chevrotain synchronously. This will work in Node
  // environments where `chevrotain` is resolvable via require(). If not,
  // an error will be thrown when lex() is called; callers can handle that
  // by skipping tests or using the higher-level parseWithChevrotain.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const chev = require('chevrotain');
  const { createToken, Lexer } = chev as any;

  const { tokenSpecs } = tokenModule as any;
  const built: Record<string, any> = {};
  const allTokens: any[] = [];

  for (const spec of tokenSpecs) {
    const opt: any = { name: spec.name, pattern: spec.pattern };
    if (spec.skip) opt.group = Lexer.SKIPPED;
    const tk = createToken(opt);
    built[spec.name] = tk;
    allTokens.push(tk);
  }

  cached.builtTokens = { ...built, allTokens };
  cached.LexerInstance = new Lexer(allTokens);
}

export function lex(text: string) {
  if (!cached.LexerInstance) {
    buildTokensAndLexer();
  }
  const lexResult = cached.LexerInstance.tokenize(text);
  return { tokens: lexResult.tokens, errors: lexResult.errors };
}

export function getBuiltTokens() {
  if (!cached.builtTokens) buildTokensAndLexer();
  return cached.builtTokens;
}