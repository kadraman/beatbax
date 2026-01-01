import tokenModule from './tokens';

let cached = {
  builtTokens: null as any | null,
  LexerInstance: null as any | null,
  buildPromise: null as Promise<void> | null,
};

// Synchronous token/lexer builder for CommonJS environments (where require is available)
function buildTokensAndLexer() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  if (typeof require !== 'function') {
    throw new Error('Synchronous build not available in ESM-only runtime. Use getBuiltTokensAsync() instead.');
  }
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
  cached.LexerInstance = new (chev as any).Lexer(allTokens);
}

// Async builder that works with ESM dynamic import
async function buildTokensAndLexerAsync() {
  if (cached.buildPromise) return cached.buildPromise;
  cached.buildPromise = (async () => {
    const chev = await import('chevrotain');
    const { createToken, Lexer } = chev as any;
    const { tokenSpecs } = tokenModule as any;
    const built: Record<string, any> = {};
    const allTokens: any[] = [];

    for (const spec of tokenSpecs) {
      const opt: any = { name: spec.name, pattern: spec.pattern };
      if (spec.skip) opt.group = (Lexer as any).SKIPPED;
      const tk = createToken(opt);
      built[spec.name] = tk;
      allTokens.push(tk);
    }

    cached.builtTokens = { ...built, allTokens };
    cached.LexerInstance = new (Lexer as any)(allTokens);
  })();
  return cached.buildPromise;
}

export function lex(text: string) {
  if (!cached.LexerInstance) {
    // try sync build first for backwards compatibility
    try {
      buildTokensAndLexer();
    } catch (e) {
      throw new Error('Lexer is not initialized synchronously. Use lexAsync() or use the async parser entrypoint. ' + String(e));
    }
  }
  const lexResult = cached.LexerInstance.tokenize(text);
  return { tokens: lexResult.tokens, errors: lexResult.errors };
}

export async function lexAsync(text: string) {
  if (!cached.LexerInstance) {
    await buildTokensAndLexerAsync();
  }
  const lexResult = cached.LexerInstance.tokenize(text);
  return { tokens: lexResult.tokens, errors: lexResult.errors };
}

export function getBuiltTokens() {
  if (!cached.builtTokens) buildTokensAndLexer();
  return cached.builtTokens;
}

export async function getBuiltTokensAsync() {
  if (!cached.builtTokens) await buildTokensAndLexerAsync();
  return cached.builtTokens;
}