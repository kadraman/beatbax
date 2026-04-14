import { AST } from './ast.js';
import { parseWithPeggy } from './peggy/index.js';

export { parseWithPeggy } from './peggy/index.js';

export function parse(source: string): AST {
  // Normalize Windows CRLF / bare CR to LF so the parser handles files
  // saved on Windows or in editors that use CRLF line endings.
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Peggy parser is the single supported parser now.
  return parseWithPeggy(normalized);
}

export default {
  parse,
};
