export * from './tokenizer';

import { expandPattern, transposePattern } from '../patterns/expand';

/** AST shape for parsed source (minimal for now). */
export type AST = {
  pats: Record<string, string[]>;
  insts: Record<string, Record<string, string>>;
  channels: Array<{ id: number; inst?: string; pat?: string | string[]; bpm?: number }>;
  // future: insts, channels, bpm, etc.
};

/**
 * Parse source text and build a minimal AST. Currently this parser
 * focuses on resolving `pat` definitions into expanded token arrays
 * using `expandPattern` and collecting `inst` and `channel` entries.
 */
export function parse(source: string): AST {
  const pats: Record<string, string[]> = {};
  const insts: Record<string, Record<string, string>> = {};
  const channels: Array<{ id: number; inst?: string; pat?: string | string[]; bpm?: number }> = [];

  // Match lines like: pat NAME[:mod...]* = ... (capture RHS to EOL)
  const re = /^\s*pat\s+([A-Za-z_][A-Za-z0-9_\-]*(?::[^\s=]+)*)\s*=\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const nameSpec = m[1];
    let rhs = m[2].trim();

    // If RHS is a quoted string, strip quotes
    if ((rhs.startsWith('"') && rhs.endsWith('"')) || (rhs.startsWith("'") && rhs.endsWith("'"))) {
      rhs = rhs.slice(1, -1);
    }

    // nameSpec may include modifiers like NAME:oct(-1):+2
    const parts = nameSpec.split(':');
    const baseName = parts[0];
    const mods = parts.slice(1);

    try {
      let expanded = expandPattern(rhs);
      if (mods.length > 0) {
        // parse modifiers and apply transpose
        let semitones = 0;
        let octaves = 0;
        for (const mod of mods) {
          const mOct = mod.match(/^oct\((-?\d+)\)$/i);
          if (mOct) {
            octaves += parseInt(mOct[1], 10);
            continue;
          }
          const mTrans = mod.match(/^([+-]?\d+)$/);
          if (mTrans) {
            semitones += parseInt(mTrans[1], 10);
            continue;
          }
          const mSem = mod.match(/^semitone\((-?\d+)\)$/i) || mod.match(/^st\((-?\d+)\)$/i) || mod.match(/^trans\((-?\d+)\)$/i);
          if (mSem) {
            semitones += parseInt(mSem[1], 10);
            continue;
          }
        }
        if (semitones !== 0 || octaves !== 0) {
          expanded = transposePattern(expanded, { semitones, octaves });
        }
      }
      pats[baseName] = expanded;
    } catch (err) {
      pats[baseName] = [rhs];
    }
  }

  // Parse inst definitions: inst NAME key=val key2=val2 ...
  const reInst = /^\s*inst\s+([A-Za-z_][A-Za-z0-9_\-]*)\s+(.+)$/gm;
  while ((m = reInst.exec(source)) !== null) {
    const name = m[1];
    const rest = m[2].trim();
    const parts = rest.split(/\s+/);
    const props: Record<string, string> = {};
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq >= 0) {
        const k = p.slice(0, eq);
        const v = p.slice(eq + 1);
        props[k] = v;
      } else {
        // flag or type shorthand
        props[p] = 'true';
      }
    }
    insts[name] = props;
  }

  // Parse channel definitions: channel N => ...
  const reChan = /^\s*channel\s+(\d+)\s*=>\s*(.+)$/gm;
  while ((m = reChan.exec(source)) !== null) {
    const id = parseInt(m[1], 10);
    const rhs = m[2].trim();
    // Simple tokenization of RHS
    const tokens = rhs.split(/\s+/);
    const ch: { id: number; inst?: string; pat?: string | string[]; bpm?: number } = { id };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === 'inst' && tokens[i + 1]) {
        ch.inst = tokens[i + 1];
        i++;
      } else if (t === 'pat' && tokens[i + 1]) {
        const patRef = tokens[i + 1];
        // allow quoted pattern names
        let patSpec = (patRef.startsWith('"') || patRef.startsWith("'")) ? patRef.replace(/^['"]|['"]$/g, '') : patRef;
        ch.pat = patSpec;
        i++;
      } else if (t.startsWith('bpm=')) {
        const v = t.slice(4);
        const n = parseInt(v, 10);
        if (!isNaN(n)) ch.bpm = n;
      } else if (t.startsWith('bpm')) {
        // bpm 140
        const v = tokens[i + 1];
        const n = parseInt(v, 10);
        if (!isNaN(n)) { ch.bpm = n; i++; }
      }
    }
    // If pat refers to a named pattern, resolve to expanded tokens if available
    if (typeof ch.pat === 'string') {
      // support inline modifiers like NAME:oct(-1) or NAME:+2
      const parts = ch.pat.split(':');
      const base = parts[0];
      const mods = parts.slice(1);
      if (pats[base]) {
        let tokensResolved = pats[base].slice();
        if (mods.length > 0) {
          // parse modifiers into semitone/octave adjustments
          let semitones = 0;
          let octaves = 0;
          for (const mod of mods) {
            const mOct = mod.match(/^oct\((-?\d+)\)$/i);
            if (mOct) {
              octaves += parseInt(mOct[1], 10);
              continue;
            }
            const mTrans = mod.match(/^([+-]?\d+)$/);
            if (mTrans) {
              semitones += parseInt(mTrans[1], 10);
              continue;
            }
            const mSem = mod.match(/^semitone\((-?\d+)\)$/i) || mod.match(/^st\((-?\d+)\)$/i) || mod.match(/^trans\((-?\d+)\)$/i);
            if (mSem) {
              semitones += parseInt(mSem[1], 10);
              continue;
            }
          }
          if (semitones !== 0 || octaves !== 0) {
            tokensResolved = transposePattern(tokensResolved, { semitones, octaves });
          }
        }
        ch.pat = tokensResolved;
      } else {
        // leave unresolved string (could be inline pattern literal)
      }
    }
    channels.push(ch);
  }

  return { pats, insts, channels };
}

export default {
  parse,
};

export * from './tokenizer';

// Future: parser implementation will live here (AST builder, resolver)
