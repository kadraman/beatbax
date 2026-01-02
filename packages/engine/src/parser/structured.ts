import {
  PatternEvent,
  SequenceItem,
  SequenceTransform,
  SourceLocation,
} from './ast.js';

export interface RawSeqModifier { raw: string; loc?: SourceLocation }
export interface RawSeqItem { name: string; modifiers: RawSeqModifier[]; raw?: string; loc?: SourceLocation }

export const isPeggyEventsEnabled = (): boolean => {
  try {
    const env = typeof process !== 'undefined' && (process as any)?.env ? (process as any).env : undefined;
    const val = env?.BEATBAX_PEGGY_EVENTS ?? env?.beatbax_peggy_events;
    if (val === undefined || val === null) return true; // default on
    const s = String(val).toLowerCase();
    if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  } catch (err) {
    // Surface unexpected environment access failures instead of silently disabling the flag.
    try {
      console.warn('[BeatBax Parser] Warning: failed to read BEATBAX_PEGGY_EVENTS env', err);
    } catch {
      /* ignore logging failures */
    }
    return false;
  }
};

export const patternEventsToTokens = (events?: PatternEvent[]): string[] => {
  if (!events) return [];
  const out: string[] = [];
  for (const ev of events) {
    if (!ev) continue;
    const raw = ev.raw;
    switch (ev.kind) {
      case 'note': {
        const base = ev.value ?? raw ?? '';
        const token = ev.effects && ev.effects.length > 0 ? base + ev.effects.join('') : base;
        const dur = ev.duration && ev.duration > 0 ? ev.duration : 1;
        out.push(token);
        for (let i = 1; i < dur; i++) out.push('_');
        break;
      }
      case 'rest': {
        const token = ev.value ?? raw ?? '.';
        const dur = ev.duration && ev.duration > 0 ? ev.duration : 1;
        out.push(token);
        for (let i = 1; i < dur; i++) out.push('_');
        break;
      }
      case 'inline-inst': {
        const name = ev.name ?? raw ?? '';
        out.push(`inst ${name}`.trim());
        break;
      }
      case 'temp-inst': {
        const name = ev.name ?? '';
        const dur = ev.duration && ev.duration > 0 ? ev.duration : undefined;
        const suffix = dur ? `,${dur}` : '';
        out.push(`inst(${name}${suffix})`);
        break;
      }
      case 'token': {
        const token = ev.value ?? raw ?? '';
        if (Array.isArray(token)) {
          out.push(...token);
        } else if (token) {
          out.push(token);
        }
        break;
      }
      default:
        if (raw) out.push(raw);
        break;
    }
  }
  return out;
};

export const parseSeqTransforms = (mods: RawSeqModifier[]): SequenceTransform[] => {
  const out: SequenceTransform[] = [];
  for (const m of mods || []) {
    const raw = (m.raw || '').trim();
    const loc = m.loc;
    if (!raw) continue;
    const mOct = raw.match(/^oct\(([+-]?\d+)\)$/i);
    if (mOct) { out.push({ kind: 'oct', value: parseInt(mOct[1], 10), raw, loc }); continue; }
    if (/^rev$/i.test(raw)) { out.push({ kind: 'rev', raw, loc }); continue; }
    const mSlow = raw.match(/^slow(?:\((\d+)\))?$/i);
    if (mSlow) { out.push({ kind: 'slow', value: mSlow[1] ? parseInt(mSlow[1], 10) : 2, raw, loc }); continue; }
    const mFast = raw.match(/^fast(?:\((\d+)\))?$/i);
    if (mFast) { out.push({ kind: 'fast', value: mFast[1] ? parseInt(mFast[1], 10) : 2, raw, loc }); continue; }
    const mInst = raw.match(/^inst\(([^)]*)\)$/i);
    if (mInst) { out.push({ kind: 'inst', value: mInst[1], raw, loc }); continue; }
    const mPan = raw.match(/^pan\(([^)]*)\)$/i);
    if (mPan) { out.push({ kind: 'pan', value: mPan[1].trim(), raw, loc }); continue; }
    const mTrans = raw.match(/^([+-]?\d+)$/);
    if (mTrans) { out.push({ kind: 'transpose', value: parseInt(mTrans[1], 10), raw, loc }); continue; }
    const mSem = raw.match(/^semitone\((-?\d+)\)$/i) || raw.match(/^st\((-?\d+)\)$/i) || raw.match(/^trans\((-?\d+)\)$/i);
    if (mSem) { out.push({ kind: 'transpose', value: parseInt(mSem[1], 10), raw, loc }); continue; }
    out.push({ kind: 'unknown', raw, loc });
  }
  return out;
};

const sequenceTransformToString = (tr: SequenceTransform): string => {
  if (!tr) return '';
  if (tr.raw) return tr.raw;
  switch (tr.kind) {
    case 'oct': return `oct(${tr.value ?? 0})`;
    case 'rev': return 'rev';
    case 'slow': return `slow(${tr.value ?? 2})`;
    case 'fast': return `fast(${tr.value ?? 2})`;
    case 'inst': return `inst(${tr.value ?? ''})`;
    case 'pan': return `pan(${tr.value ?? ''})`;
    case 'transpose': {
      const v = typeof tr.value === 'number' ? tr.value : 0;
      return v >= 0 ? `+${v}` : `${v}`;
    }
    default:
      return tr.raw ?? '';
  }
};

const tokenizeSeqRhs = (rhs: string): string[] => {
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
  const parts: string[] = [];
  for (let i = 0; i < rawParts.length; i++) {
    const p = rawParts[i];
    if (p === '*' && i > 0 && i + 1 < rawParts.length && /^\d+$/.test(rawParts[i + 1])) {
      const prev = parts.pop();
      if (prev) parts.push(`${prev}*${rawParts[i + 1]}`);
      i++;
      continue;
    }
    if (/^\*\d+$/.test(p) && parts.length > 0) {
      const prev = parts.pop();
      parts.push(`${prev}${p}`);
      continue;
    }
    parts.push(p);
  }
  return parts;
};

export const normalizeSeqItems = (items?: RawSeqItem[], rhs?: string, rhsTokens?: string[]): SequenceItem[] => {
  if (items && items.length > 0) {
    return items.map(it => ({ name: it.name, transforms: parseSeqTransforms(it.modifiers || []), loc: it.loc, raw: it.raw }));
  }
  const tokens = rhsTokens && rhsTokens.length > 0 ? rhsTokens.slice() : rhs ? tokenizeSeqRhs(rhs) : [];
  return tokens.map(tok => {
    const parts = tok.split(':');
    const base = parts.shift() || tok;
    const modifiers = parts.map(p => ({ raw: p }));
    return { name: base, transforms: parseSeqTransforms(modifiers), raw: tok };
  });
};

export const materializeSequenceItems = (items: SequenceItem[]): string[] => {
  const out: string[] = [];
  for (const it of items || []) {
    const mods = (it.transforms || []).map(t => sequenceTransformToString(t)).filter(Boolean);
    const repeat = it.repeat && it.repeat > 1 ? it.repeat : 1;
    const token = mods.length > 0 ? `${it.name}${mods.map(m => `:${m}`).join('')}` : it.name;
    for (let r = 0; r < repeat; r++) out.push(token);
  }
  return out;
};
