import { parse } from '../src/parser/index.js';
import { expandAllSequences } from '../src/sequences/expand.js';

const src = `
  pat A = C4
  pat B = D4
  seq s = (A:inst(foo) B)*2
`;
const ast = parse(src);
const expanded = expandAllSequences(ast.seqs, ast.pats, ast.insts);
console.log(expanded.s);
