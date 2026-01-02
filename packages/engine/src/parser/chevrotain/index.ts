import { transform } from './transformer';

export async function parseWithChevrotain(input: string) {
  // Dynamic import of Chevrotain to avoid raising module resolution errors
  // during normal test runs (when the feature flag is not enabled).
  // Prefer reusing the shared lexer/token builder so token ordering and
  // options remain consistent across sync/async parser entrypoints.
  const lexerModule = await import('./lexer');
  const built = await lexerModule.getBuiltTokensAsync();
  const chev = await import('chevrotain');
  const { CstParser } = chev as any;

  const run = async (built: any) => {
    const allTokens = built.allTokens;
    const lexer = new (chev as any).Lexer(allTokens);
    const lexResult = lexer.tokenize(input);
    if (lexResult.errors && lexResult.errors.length) return { errors: lexResult.errors, ast: null };

    // Use the canonical parser implementation from parser.ts
    const parserModule = await import('./parser');
    const BaxParser = parserModule.createParserWithTokens(CstParser, built);

    // Diagnostic: surface parser prototype shape when instantiation fails in CI
    try {
      const protoKeys = Object.getOwnPropertyNames(BaxParser.prototype);
      console.info('BaxParser.prototype keys:', protoKeys.join(', '));
    } catch (e) {
      console.info('Failed to enumerate BaxParser.prototype:', e);
    }

    let parser;
    try {
      parser = new BaxParser();
    } catch (err: any) {
      console.error('Failed to instantiate BaxParser:', err && err.message ? err.message : String(err));
      // Also dump prototype keys for debugging
      try { console.error('BaxParser.prototype keys (post-error):', Object.getOwnPropertyNames(BaxParser.prototype).join(', ')); } catch (e) { /* ignore */ }
      throw err;
    }

    parser.input = lexResult.tokens as any;
    const cst = parser.program();
    if (parser.errors && parser.errors.length) return { errors: parser.errors, ast: null };

    const ast = transform(cst);
    return { errors: [], ast };
  };

  return await run(built);
}

export function parseWithChevrotainSync(input: string) {
  // Synchronous CommonJS path for existing sync parse() API compatibility
  // This uses `require` so environments that can `require('chevrotain')` can
  // run the parser synchronously without dynamic import.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const chev = require('chevrotain');
  // Reuse lexer builder so token order and options match tokens.ts
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lexerModule = require('./lexer');
  const built = lexerModule.getBuiltTokens();
  const { allTokens } = built as any;
  const { CstParser } = chev as any;

  const run = (built: any) => {
    const allTokens = built.allTokens;
    const lexer = new (chev as any).Lexer(allTokens);
    const lexResult = lexer.tokenize(input);
    if (lexResult.errors && lexResult.errors.length) return { errors: lexResult.errors, ast: null };

    // Use canonical parser implementation to avoid duplication
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const parserModule = require('./parser');
    const BaxParser = parserModule.createParserWithTokens(CstParser as any, built);
    const parser = new BaxParser();
    parser.input = lexResult.tokens as any;
    const cst = parser.program();
    if (parser.errors && parser.errors.length) return { errors: parser.errors, ast: null };

    const ast = transform(cst);
    return { errors: [], ast };
  };

  return run(built);
}

export default parseWithChevrotain;
