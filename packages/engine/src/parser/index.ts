import { AST } from './ast.js';
import { parseWithPeggy } from './peggy/index.js';

export { parseWithPeggy } from './peggy/index.js';

type ParserImpl = (source: string) => AST;

const tryLoadLegacy = (): ParserImpl | undefined => {
  try {
    // Prefer CommonJS-style require when available at runtime to avoid
    // forcing static ESM imports of the legacy parser into bundles.
    const req = (globalThis as any).require ?? (globalThis as any).module?.require;
    if (typeof req === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = req('./legacy/index.js');
      if (mod && typeof mod.parseLegacy === 'function') return mod.parseLegacy;
      if (mod && typeof mod.default === 'function') return mod.default;
    }
  } catch {
    // ignore; fall back to Peggy
  }
  return undefined;
};

export function parse(source: string): AST {
  let impl: ParserImpl | undefined;
  try {
    const env = typeof process !== 'undefined' && (process as any)?.env ? (process as any).env : undefined;
    const implName = env?.BEATBAX_PARSER;
    if (implName && String(implName).toLowerCase() === 'legacy') {
      impl = tryLoadLegacy();
      if (!impl) throw new Error('Legacy parser requested via BEATBAX_PARSER but could not be loaded in this runtime.');
    }
  } catch (e) {
    // If anything goes wrong reading env or loading legacy, prefer Peggy parser.
  }
  const parser = impl ?? parseWithPeggy;
  return parser(source);
}

export default {
  parse,
};
