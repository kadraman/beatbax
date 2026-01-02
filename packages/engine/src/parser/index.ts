import { AST } from './ast.js';
import { parseLegacy } from './legacy/index.js';
import { parseWithPeggy } from './peggy/index.js';

export { parseLegacy } from './legacy/index.js';
export { parseWithPeggy } from './peggy/index.js';
export * from './legacy/tokenizer.js';

type ParserImpl = (source: string) => AST;

const selectParser = (): ParserImpl => {
  let impl: string | undefined;
  try {
    const env = typeof process !== 'undefined' && (process as any)?.env ? (process as any).env : undefined;
    impl = env?.BEATBAX_PARSER;
  } catch {
    impl = undefined;
  }
  if (impl && impl.toLowerCase() === 'legacy') return parseLegacy;
  return parseWithPeggy;
};

export function parse(source: string): AST {
  const impl = selectParser();
  return impl(source);
}

export default {
  parse,
};
