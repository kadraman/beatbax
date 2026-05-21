/**
 * Split a string on a separator while respecting (), [], and quoted strings.
 * Used for sequence/pattern refs like `pat:clamp(C3,C6)` or `pat:arp(0,4,7)`.
 */
export function splitTopLevel(s: string, sep = ':'): string[] {
  const out: string[] = [];
  let cur = '';
  let inS = false;
  let inD = false;
  let bracket = 0;
  let paren = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inD) { inS = !inS; cur += ch; continue; }
    if (ch === '"' && !inS) { inD = !inD; cur += ch; continue; }
    if (inS || inD) { cur += ch; continue; }
    if (ch === '[') { bracket++; cur += ch; continue; }
    if (ch === ']') { if (bracket > 0) bracket--; cur += ch; continue; }
    if (ch === '(') { paren++; cur += ch; continue; }
    if (ch === ')') { if (paren > 0) paren--; cur += ch; continue; }
    if (ch === sep && bracket === 0 && paren === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

export default { splitTopLevel };
