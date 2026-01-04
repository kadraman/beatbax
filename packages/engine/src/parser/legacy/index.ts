import { expandPattern, transposePattern } from '../../patterns/expand.js';
import { AST, SeqMap, ChannelNode, PlayNode, InstMap } from '../ast.js';
import { parseSweep } from '../../chips/gameboy/pulse.js';
import { warn } from '../../util/diag.js';
import { applyModsToTokens } from '../../expand/refExpander.js';

const warnProblematicPatternName = (name: string): void => {
  const isSingleLetterNote = /^[A-Ga-g]$/.test(name);
  const isNoteWithOctave = /^[A-Ga-g][#b]?-?\d+$/.test(name);

  if (isSingleLetterNote || isNoteWithOctave) {
    warn('parser', `Pattern name '${name}' may be confused with a note name. Consider using a more descriptive name like '${name}_pattern' or '${name}_pat'.`);
  }
};

/**
 * Legacy parser implementation (regex + string processing).
 * Maintained for backcompat while the Peggy parser matures.
 */
export function parseLegacy(source: string): AST {
  // Remove inline comments starting with `#` unless inside quotes, brackets,
  // or parentheses. This keeps comment support consistent across `pat`,
  // `seq`, and `channel` lines where users may append notes.
  const stripInlineComments = (s: string): string => {
    return s.split(/\r?\n/).map(line => {
      let inS = false;
      let inD = false;
      let bracket = 0;
      let paren = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "'" && !inD) {
          inS = !inS;
          continue;
        }
        if (ch === '"' && !inS) {
          inD = !inD;
          continue;
        }
        if (inS || inD) continue;
        if (ch === '[') {
          bracket++;
          continue;
        }
        if (ch === ']') {
          if (bracket > 0) bracket--;
          continue;
        }
        if (ch === '(') {
          paren++;
          continue;
        }
        if (ch === ')') {
          if (paren > 0) paren--;
          continue;
        }
        if (ch === '#' && bracket === 0 && paren === 0) {
          return line.slice(0, i).trimEnd();
        }
      }
      return line;
    }).join('\n');
  };
  const src = stripInlineComments(source);
  // Extract song metadata directives (supports single/double-quoted and triple-quoted multiline strings)
  const metadata: any = {};
  const songRe = /^\s*song\s+(name|artist|description|tags)\s+(?:"""([\s\S]*?)"""|"([^"]*?)"|'([^']*?)')/gim;
  let srcTemp = src;
  srcTemp = srcTemp.replace(songRe, (_full: any, key: any, triple: any, dbl: any, sgl: any) => {
    const val = triple ?? dbl ?? sgl ?? '';
    if (key === 'tags') {
      const tags = String(val).split(/[\,\n\r]+/).map((t: string) => t.trim()).filter(Boolean);
      metadata.tags = (metadata.tags || []).concat(tags);
    } else if (key === 'name') {
      metadata.name = val;
    } else if (key === 'artist') {
      metadata.artist = val;
    } else if (key === 'description') {
      metadata.description = val;
    }
    return '';
  });
  const cleanedSrc = srcTemp;
  const pats: Record<string, string[]> = {};
  const insts: Record<string, any> = {};
  const seqs: Record<string, string[]> = {};
  const channels: any[] = [];
  let topBpm: number | undefined = undefined;
  // Match lines like: pat NAME[:mod...]* = ... (capture RHS to EOL)
  const re = /^\s*pat\s+([A-Za-z_][A-Za-z0-9_\-]*(?::[^\s=]+)*)\s*=\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleanedSrc)) !== null) {
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

    warnProblematicPatternName(baseName);

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
          // support reverse, slow, fast transforms
          if (/^rev$/i.test(mod)) {
            expanded = expanded.slice().reverse();
            continue;
          }
          if (/^slow(?:\((\d+)\))?$/i.test(mod)) {
            const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
            const factor = mSlow && mSlow[1] ? parseInt(mSlow[1], 10) : 2;
            // repeat each token `factor` times
            const out: string[] = [];
            for (const t of expanded) for (let r = 0; r < factor; r++) out.push(t);
            expanded = out;
            continue;
          }
          if (/^fast(?:\((\d+)\))?$/i.test(mod)) {
            const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
            const factor = mFast && mFast[1] ? parseInt(mFast[1], 10) : 2;
            // take every `factor`th token
            expanded = expanded.filter((_, idx) => idx % factor === 0);
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
  while ((m = reInst.exec(cleanedSrc)) !== null) {
    const name = m[1];
    const rest = m[2].trim();
    const parts = rest.split(/\s+/);
    const props: Record<string, string> = {};
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq >= 0) {
        const k = p.slice(0, eq);
        const v = p.slice(eq + 1);
        // If value looks like an object literal, attempt to parse as JSON
        if (v.startsWith('{') && v.endsWith('}')) {
          try {
            props[k] = JSON.parse(v);
          } catch (e) {
            // Fall back to raw string if JSON parsing fails
            props[k] = v;
          }
        } else {
          props[k] = v;
        }
      } else {
        // flag or type shorthand
        props[p] = 'true';
      }
    }
    // Parse sweep into a structured object when possible for safer downstream use.
    // `props.sweep` may already be an object (from JSON.parse above) or a string.
    try {
      if (props.sweep) {
        const parsed = parseSweep(props.sweep as any);
        if (parsed) props.sweep = parsed as any;
      }
    } catch (e) {
      // keep original value if parsing fails
    }
    insts[name] = props;
  }

  // Parse seq definitions line-by-line to avoid accidental multiline captures
  // and provide a clear warning if the RHS is empty.
  const seqLineRe = /^\s*seq\s+([A-Za-z_][A-Za-z0-9_\-]*)\s*=\s*(.*)$/;
  const lines = cleanedSrc.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const lm = lines[li].match(seqLineRe);
    if (!lm) continue;
    const name = lm[1];
    const rhs = lm[2].trim();
    if (!rhs) {
      warn('parser', `sequence '${name}' has no RHS content (empty). Define patterns after '=' or remove the empty 'seq ${name} =' line.`);
      seqs[name] = [];
      continue;
    }

    // split by whitespace to preserve modifiers like A:inst(bass)
    // Tokenize RHS preserving parenthesized groups as single tokens.
    const tokenize = (s: string): string[] => {
      const out: string[] = [];
      let i = 0;
      let cur = '';
      let inS = false;
      let inD = false;
      while (i < s.length) {
        const ch = s[i];
        if (ch === "'" && !inD) { inS = !inS; cur += ch; i++; continue; }
        if (ch === '"' && !inS) { inD = !inD; cur += ch; i++; continue; }
        if (inS || inD) { cur += ch; i++; continue; }
        if (ch === '(') {
          // If we have accumulated text (like "P:inst"), keep it and append the parenthesized part
          // This handles cases like "P:inst(foo)" which should be a single token
          let depth = 1;
          let j = i + 1;
          let group = '(';
          while (j < s.length && depth > 0) {
            const c2 = s[j];
            group += c2;
            if (c2 === '(') depth++;
            else if (c2 === ')') depth--;
            j++;
          }
          cur += group;
          i = j;
          continue;
        }
        if (/\s/.test(ch) || ch === ',') {
          if (cur.trim()) { out.push(cur.trim()); cur = ''; }
          i++; continue;
        }
        cur += ch;
        i++;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    };

    const rawParts = tokenize(rhs);
    // Normalize space-separated repetition syntax: `name * 2` -> `name*2`
    const parts: string[] = [];
    for (let i = 0; i < rawParts.length; i++) {
      const p = rawParts[i];
      if (p === '*' && i > 0 && i + 1 < rawParts.length && /^\d+$/.test(rawParts[i + 1])) {
        const prev = parts.pop();
        if (prev) parts.push(`${prev}*${rawParts[i + 1]}`);
        i++;
        continue;
      }
      // support form where '*' and number are attached as a token (e.g. '*2')
      if (/^\*\d+$/.test(p) && parts.length > 0) {
        const prev = parts.pop();
        parts.push(`${prev}${p}`);
        continue;
      }
      parts.push(p);
    }
    seqs[name] = parts;
  }

  // Parse channel definitions: channel N => ...
  const reChan = /^\s*channel\s+(\d+)\s*=>\s*(.+)$/gm;
  while ((m = reChan.exec(cleanedSrc)) !== null) {
    const id = parseInt(m[1], 10);
    const rhs = m[2].trim();
    // Simple tokenization of RHS
    const tokens = rhs.split(/\s+/);
    const ch: { id: number; inst?: string; pat?: string | string[]; speed?: number } = { id };
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
      } else if (t === 'seq' && tokens[i + 1]) {
        // channel may point to one or more sequences. Capture the rest of the
        // channel RHS as a single sequence specification string so callers
        // can support comma-separated lists and repetition syntax like "name * 2".
        const restTokens = tokens.slice(i + 1);
        const rest = restTokens.join(' ');
        let seqSpec = (rest.startsWith('"') || rest.startsWith("'")) ? rest.replace(/^['\"]|['\"]$/g, '') : rest;
        ch.pat = seqSpec.trim(); // leave as string; resolver will expand sequences
        // also attach raw token array to help the resolver parse space-separated
        // sequence lists like: `seq lead lead2` or `seq lead * 2`.
        (ch as any).seqSpecTokens = restTokens;
        // consume the rest of the tokens (we've handled them)
        break;
      } else if (t.startsWith('bpm=')) {
        // Channel-level `bpm` is not supported. Fail fast with a parse error
        // to guide users to use top-level `bpm` or sequence transforms instead.
        const v = t.slice(4);
        const n = parseInt(v, 10);
        throw new Error(
          `channel ${id}: channel-level 'bpm' is not supported (found 'bpm=${v}'). ` +
          `Use a top-level 'bpm' directive or sequence transforms (fast/slow) instead.`
        );
      } else if (t === 'bpm') {
        // legacy form: 'bpm 140' on the channel line
        const v = tokens[i + 1];
        throw new Error(
          `channel ${id}: channel-level 'bpm' is not supported (found 'bpm ${v}'). ` +
          `Use a top-level 'bpm' directive or sequence transforms (fast/slow) instead.`
        );
      } else if (t.startsWith('speed=')) {
        let v = t.slice(6);
        // support syntax like '2x' or '1.5x'
        v = String(v).replace(/x$/i, '');
        const n = parseFloat(v);
        if (!isNaN(n)) ch.speed = n;
      } else if (t === 'speed' && tokens[i + 1]) {
        let v = tokens[i + 1];
        v = String(v).replace(/x$/i, '');
        const n = parseFloat(v);
        if (!isNaN(n)) { ch.speed = n; i++; }
      }
    }
    // If pat refers to a named pattern, resolve to expanded tokens if available
    if (typeof ch.pat === 'string') {
      // support inline modifiers like NAME:oct(-1) or NAME:+2
      const parts = ch.pat.split(':');
      const base = parts[0];
      const mods = parts.slice(1);
      if (pats[base]) {
        const res = applyModsToTokens(pats[base].slice(), mods);
        if (res.instOverride) ch.inst = res.instOverride;
        ch.pat = res.tokens;
      } else {
        // leave unresolved string (could be inline pattern literal)
      }
    }
    channels.push(ch);
  }

  // Parse top-level bpm directive: `bpm 160` or `bpm=160`
  const reBpm = /^\s*bpm\s*(?:=)?\s*(\d+)$/gim;
  while ((m = reBpm.exec(cleanedSrc)) !== null) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n)) topBpm = n;
  }

  // Parse top-level chip directive: `chip gameboy` or `chip=gameboy`
  let chipName: string | undefined = undefined;
  const reChip = /^\s*chip\s*(?:=)?\s*([A-Za-z_][A-Za-z0-9_\-]*)/gim;
  while ((m = reChip.exec(cleanedSrc)) !== null) {
    chipName = m[1];
  }

  // Parse top-level play directive: `play` optionally followed by flags
  // e.g. `play auto repeat` or `play repeat`
  let playNode: PlayNode | undefined = undefined;
  const rePlay = /^\s*play(?:\s+(.+))?$/gim;
  while ((m = rePlay.exec(cleanedSrc)) !== null) {
    const flagsRaw = m[1] ? m[1].trim() : '';
    const flags = flagsRaw ? flagsRaw.split(/\s+/) : [];
    playNode = {
      flags,
      auto: flags.includes('auto'),
      repeat: flags.includes('repeat'),
    };
  }

  // Validation: Ensure sweep is only used for pulse1 on gameboy
  if (chipName === 'gameboy' || !chipName) {
    for (const [name, props] of Object.entries(insts)) {
      const p = props as any;
      if (p.sweep && p.type !== 'pulse1') {
        warn('parser', `Instrument '${name}' has a 'sweep' property but is not type 'pulse1'. Sweep is only supported on Pulse 1.`);
      }

      // Wave instrument: parse and validate `volume` / `vol` parameter
      if (p.type && String(p.type).toLowerCase() === 'wave') {
        const raw = p.volume !== undefined ? p.volume : (p.vol !== undefined ? p.vol : undefined);
        if (raw === undefined) {
          // Default to 100% for good balance
          p.volume = 100;
        } else {
          let s = String(raw).trim();
          if (s.endsWith('%')) s = s.slice(0, -1).trim();
          const vNum = parseInt(s, 10);
          if (![0, 25, 50, 100].includes(vNum)) {
            throw new Error(`Invalid wave volume ${raw} for instrument "${name}". Must be 0, 25, 50, or 100`);
          }
          p.volume = vNum;
        }
      }
    }
  }

  return { pats, insts, seqs, channels, bpm: topBpm, chip: chipName, play: playNode, metadata };
}
