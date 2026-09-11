/**
 * Split an `inst` RHS into `key=value` tokens without breaking quoted values
 * or bracket/brace groups. `parseInstRhs` and preset body parsing must use
 * the same rules so writeback of `dmc_sample="local:My Samples/kick.dmc"`
 * does not reparse into extra properties.
 */
export function tokenizeInstRhs(rhs: string): string[] {
  const tokens: string[] = [];
  let buf = '';
  let depth = 0;
  let quote: string | null = null;
  for (const ch of rhs) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (buf) tokens.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf) tokens.push(buf);
  return tokens;
}
