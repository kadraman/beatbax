export function parse(source?: string) {
  // Minimal mock parse — return a lightweight AST used by UI tests.
  return { pats: {}, patsOrder: [], insts: {}, seqs: {}, channels: [], bpm: 120 };
}
export default { parse };
