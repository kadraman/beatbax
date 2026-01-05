import { AST } from './ast.js';
import { parseWithPeggy } from './peggy/index.js';

export { parseWithPeggy } from './peggy/index.js';

export function parse(source: string): AST {
  // Peggy parser is the single supported parser now.
  return parseWithPeggy(source);
}

export default {
  parse,
};
