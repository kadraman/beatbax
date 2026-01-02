import type { CstNode } from 'chevrotain';
import { expandPattern, transposePattern } from '../../patterns/expand.js';
import { parseSweep } from '../../chips/gameboy/pulse.js';

// Helper: recursively collect tokens from a CST node
function collectTokens(node: any): any[] {
  const out: any[] = [];
  if (!node || typeof node !== 'object') return out;
  for (const k of Object.keys(node.children || {})) {
    const arr = node.children[k];
    for (const el of arr) {
      if (el.image !== undefined) out.push(el);
      else out.push(...collectTokens(el));
    }
  }
  return out.sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
}

export function transform(cst: CstNode | undefined) {
  const ast: any = {
    pats: {},
    insts: {},
    seqs: {},
    channels: [],
    bpm: undefined,
    chip: undefined,
    play: undefined,
    metadata: {},
  };

  if (!cst || !cst.children || !cst.children.directive) return ast;

  for (const dir of (cst.children.directive as any[])) {
    const d = dir as any;
    const childKeys = Object.keys(d.children || {});
    for (const key of childKeys) {
      const nodes = d.children[key] as any[];
      if (!nodes || nodes.length === 0) continue;
      const node = nodes[0] as any;
      const tokens = collectTokens(node);

      if (key === 'patStmt') {
        // split around '='
        const eqIdx = tokens.findIndex(t => t.tokenType && t.tokenType.name === 'Equals');
        if (eqIdx < 0) continue;
        const lhs = tokens.slice(0, eqIdx);
        const rhs = tokens.slice(eqIdx + 1);
        const nameToken = lhs.find(t => t.tokenType && t.tokenType.name === 'Id');
        if (!nameToken) continue;
        const nameSpec = nameToken.image + lhs.slice(lhs.indexOf(nameToken) + 1).map(t => t.image).join('');
        const parts = nameSpec.split(':');
        const baseName = parts[0];
        const mods = parts.slice(1);
        let rhsText = rhs.map(t => t.image).join(' ').trim();
        if ((rhsText.startsWith('"') && rhsText.endsWith('"')) || (rhsText.startsWith("'") && rhsText.endsWith("'"))) {
          rhsText = rhsText.slice(1, -1);
        }
        let expanded: string[];
        try {
          expanded = expandPattern(rhsText);
        } catch (e) {
          expanded = [rhsText];
        }
        // apply mods
        if (mods.length > 0) {
          let semitones = 0;
          let octaves = 0;
          for (const mod of mods) {
            const mOct = mod.match(/^oct\((-?\d+)\)$/i);
            if (mOct) { octaves += parseInt(mOct[1], 10); continue; }
            if (/^rev$/i.test(mod)) { expanded = expanded.slice().reverse(); continue; }
            const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
            if (mSlow) {
              const factor = mSlow[1] ? parseInt(mSlow[1], 10) : 2;
              const out: string[] = [];
              for (const t of expanded) for (let r = 0; r < factor; r++) out.push(t);
              expanded = out; continue;
            }
            const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
            if (mFast) {
              const factor = mFast[1] ? parseInt(mFast[1], 10) : 2;
              expanded = expanded.filter((_, idx) => idx % factor === 0); continue;
            }
            const mTrans = mod.match(/^([+-]?\d+)$/);
            if (mTrans) { semitones += parseInt(mTrans[1], 10); continue; }
            const mSem = mod.match(/^semitone\((-?\d+)\)$/i) || mod.match(/^st\((-?\d+)\)$/i) || mod.match(/^trans\((-?\d+)\)$/i);
            if (mSem) { semitones += parseInt(mSem[1], 10); continue; }
          }
          if (semitones !== 0 || octaves !== 0) {
            expanded = transposePattern(expanded, { semitones, octaves });
          }
        }
        ast.pats[baseName] = expanded;
      }

      else if (key === 'instStmt') {
        const eqIdx = tokens.findIndex(t => t.tokenType && t.tokenType.name === 'Equals');
        if (eqIdx < 0) continue;
        const lhs = tokens.slice(0, eqIdx);
        const rhs = tokens.slice(eqIdx + 1);
        const nameToken = lhs.find(t => t.tokenType && t.tokenType.name === 'Id');
        if (!nameToken) continue;
        const name = nameToken.image;
        // split rhs by whitespace tokens to get properties like key=val
        const parts: string[] = [];
        let cur = '';
        for (const t of rhs) {
          if (/^\s+$/.test(t.image)) continue; // tokens shouldn't include whitespace, but be safe
          if (t.tokenType && t.tokenType.name === 'Comma') {
            if (cur) { parts.push(cur.trim()); cur = ''; }
            continue;
          }
          if (t.tokenType && t.tokenType.name === 'Id' && !cur) { cur = t.image; continue; }
          cur += t.image;
        }
        if (cur) parts.push(cur.trim());
        const props: Record<string, any> = {};
        for (const p of parts) {
          const eq = p.indexOf('=');
          if (eq >= 0) {
            const k = p.slice(0, eq);
            let v = p.slice(eq + 1);
            // strip surrounding quotes
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
            // attempt JSON parse for object-like values
            if (v.startsWith('{') && v.endsWith('}')) {
              try { props[k] = JSON.parse(v); } catch (e) { props[k] = v; }
            } else props[k] = v;
          } else {
            props[p] = 'true';
          }
        }
        // parse sweep if present
        try {
          if (props.sweep) {
            const parsed = parseSweep(props.sweep as any);
            if (parsed) props.sweep = parsed as any;
          }
        } catch (e) {
          // Log a warning to make parsing issues visible during migration and testing.
          console.warn(`Chevrotain parser: failed to parse sweep for instrument '${name}': ${String(e)}`);
          // Preserve the original string value and record the parse error for debugging.
          props.sweepParseError = String(e);
        }
        ast.insts[name] = props;
      }

      else if (key === 'seqStmt') {
        const eqIdx = tokens.findIndex(t => t.tokenType && t.tokenType.name === 'Equals');
        if (eqIdx < 0) continue;
        const lhs = tokens.slice(0, eqIdx);
        const rhs = tokens.slice(eqIdx + 1);
        const nameToken = lhs.find(t => t.tokenType && t.tokenType.name === 'Id');
        if (!nameToken) continue;
        const name = nameToken.image;
        // simple tokenization: join rhs images and split by whitespace preserving groups
        const rhsText = rhs.map(t => t.image).join(' ');
        // reuse the existing tokenization logic from legacy parser
        const tokenize = (s: string): string[] => {
          const out: string[] = [];
          let i = 0; let cur = '';
          let inS = false; let inD = false;
          while (i < s.length) {
            const ch = s[i];
            if (ch === "'" && !inD) { inS = !inS; cur += ch; i++; continue; }
            if (ch === '"' && !inS) { inD = !inD; cur += ch; i++; continue; }
            if (inS || inD) { cur += ch; i++; continue; }
            if (ch === '(') {
              let depth = 1; let j = i + 1; let group = '(';
              while (j < s.length && depth > 0) { const c2 = s[j]; group += c2; if (c2 === '(') depth++; else if (c2 === ')') depth--; j++; }
              cur += group; i = j; continue;
            }
            if (/\s/.test(ch) || ch === ',') { if (cur.trim()) { out.push(cur.trim()); cur = ''; } i++; continue; }
            cur += ch; i++;
          }
          if (cur.trim()) out.push(cur.trim());
          return out;
        };
        const parts = tokenize(rhsText);
        ast.seqs[name] = parts;
      }

      else if (key === 'songStmt') {
        // tokens: Song Id StringLiteral
        const keyTok = tokens.find(t => t.tokenType && t.tokenType.name === 'Id');
        const valTok = tokens.find(t => t.tokenType && t.tokenType.name === 'StringLiteral');
        if (!keyTok || !valTok) continue;
        let v = valTok.image;
        // Support triple-quoted multiline strings ("""...""" or '''...''') as well as single-quoted strings
        if ((v.startsWith('"""') && v.endsWith('"""')) || (v.startsWith("'''") && v.endsWith("'''"))) {
          v = v.slice(3, -3);
        } else if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        const key = keyTok.image;
        if (key === 'tags') {
          const tags = v.split(/[,\n\r]+/).map((t: string) => t.trim()).filter(Boolean);
          ast.metadata.tags = (ast.metadata.tags || []).concat(tags);
        } else if (key === 'name' || key === 'artist' || key === 'description') {
          (ast.metadata as any)[key] = v;
        }
      }

      else if (key === 'exportStmt') {
        const fmtTok = tokens.find(t => t.tokenType && t.tokenType.name === 'Id');
        const destTok = tokens.find(t => t.tokenType && t.tokenType.name === 'StringLiteral');
        if (!fmtTok) continue;
        const fmt = fmtTok.image;
        let dest: string | undefined = undefined;
        if (destTok) {
          dest = destTok.image.replace(/^['"]|['"]$/g, '');
        }
        (ast.metadata.exports as any) = (ast.metadata.exports || []);
        (ast.metadata.exports as any).push({ format: fmt, dest });
      }

      else if (key === 'channelStmt') {
        const eqIdx = tokens.findIndex(t => t.tokenType && t.tokenType.name === 'Equals');
        if (eqIdx < 0) continue;
        const lhs = tokens.slice(0, eqIdx);
        const rhs = tokens.slice(eqIdx + 1);
        const idToken = lhs.find(t => t.tokenType && t.tokenType.name === 'NumberLiteral');
        if (!idToken) continue;
        const id = parseInt(idToken.image, 10);
        const tokensText = rhs.map(t => t.image).join(' ');
        const toks = tokensText.split(/\s+/).filter(Boolean);
        const ch: any = { id };
        for (let i = 0; i < toks.length; i++) {
          const t = toks[i];
          if (t === 'inst' && toks[i + 1]) { ch.inst = toks[i + 1]; i++; }
          else if (t === 'pat' && toks[i + 1]) { ch.pat = toks[i + 1]; i++; }
          else if (t === 'seq' && toks[i + 1]) { ch.pat = toks[i + 1]; i++; }
          else if (t.startsWith('speed=')) { let v = t.slice(6); v = String(v).replace(/x$/i, ''); const n = parseFloat(v); if (!isNaN(n)) ch.speed = n; }
          else if (t === 'speed' && toks[i + 1]) { let v = toks[i + 1]; v = String(v).replace(/x$/i, ''); const n = parseFloat(v); if (!isNaN(n)) { ch.speed = n; i++; } }
        }
        ast.channels.push(ch);
      }

      else if (key === 'simpleDirective') {
        // tokens may contain Chip, Bpm, Play, Export and an optional Id
        const t0 = tokens[0];
        if (!t0) continue;
        const name = t0.tokenType && t0.tokenType.name;
        if (name === 'Chip') {
          const id = tokens.find(t => t.tokenType && t.tokenType.name === 'Id');
          if (id) ast.chip = id.image;
        } else if (name === 'Bpm') {
          const id = tokens.find(t => (t.tokenType && (t.tokenType.name === 'NumberLiteral' || t.tokenType.name === 'Id')));
          if (id) ast.bpm = parseInt(id.image, 10);
        } else if (name === 'Play') {
          ast.play = {};
        } else if (name === 'Export') {
          // ignore for now
        }
      }
    }
  }

  return ast as any;
}
