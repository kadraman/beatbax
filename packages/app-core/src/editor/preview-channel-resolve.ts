/**
 * Resolve which song channel (and therefore which instrument) a pattern or
 * nested sequence belongs to, for isolated preview.
 *
 * Channel assignments often name a top-level form seq (`seq wave = deep_w …`)
 * rather than the leaf pattern (`wave_i`). Walking only one seq level — or
 * taking the first `channel N => inst` in the file — previews cave bass as
 * pulse 1 `adv_lead`, which cannot play a wave table.
 */

export interface PreviewChannelRef {
  id: number;
  inst: string;
}

/** Strip transforms (`:oct(-1)`) and repeats (`*8`) from a seq/pat token. */
export function seqTokenBase(token: string): string {
  return token.split(':')[0].trim().replace(/\*\d+$/, '');
}

function tokenName(token: unknown): string {
  if (typeof token === 'string') return seqTokenBase(token);
  if (token && typeof token === 'object' && 'name' in token) {
    return seqTokenBase(String((token as { name?: unknown }).name ?? ''));
  }
  return '';
}

/**
 * True when `target` is `tokens` themselves, or appears anywhere in the seq
 * tree those tokens expand to. `visiting` breaks cycles (`seq a = b` / `seq b = a`).
 */
export function seqTreeContains(
  tokens: unknown[],
  target: string,
  seqs: Record<string, unknown[] | undefined>,
  visiting: Set<string> = new Set(),
): boolean {
  for (const token of tokens) {
    const name = tokenName(token);
    if (!name || name === ',') continue;
    if (name === target) return true;
    const nested = seqs[name];
    if (!Array.isArray(nested) || visiting.has(name)) continue;
    visiting.add(name);
    if (seqTreeContains(nested, target, seqs, visiting)) return true;
  }
  return false;
}

function channelSeqTokens(channel: {
  seqSpecTokens?: unknown;
  pat?: unknown;
}): unknown[] {
  if (Array.isArray(channel.seqSpecTokens)) return channel.seqSpecTokens;
  if (typeof channel.pat === 'string') {
    return channel.pat.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

/** First channel whose seq tree contains `itemName` (a pat or nested seq). */
export function findChannelForNamedItem(
  ast: { channels?: Array<{ id?: unknown; inst?: unknown; seqSpecTokens?: unknown; pat?: unknown }>; seqs?: Record<string, unknown[]> },
  itemName: string,
): PreviewChannelRef | null {
  for (const ch of ast.channels ?? []) {
    if (!ch.inst) continue;
    if (seqTreeContains(channelSeqTokens(ch), itemName, ast.seqs ?? {})) {
      const id = Number(ch.id);
      return {
        id: Number.isFinite(id) && id > 0 ? id : 1,
        inst: String(ch.inst),
      };
    }
  }
  return null;
}

const CHANNEL_LINE_RE =
  /^\s*channel\s+(\d+)\s*=>\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)\s+seq\s+(.+)$/;
const SEQ_LINE_RE = /^\s*seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/**
 * Same lookup as {@link findChannelForNamedItem}, from source text.
 * Command-palette Alt+P builds a synthetic `.bax` with regex and does not
 * parse an AST; this keeps that path in sync with CodeLens.
 */
export function findChannelForNamedItemInSource(
  source: string,
  itemName: string,
): PreviewChannelRef | null {
  const seqs: Record<string, string[]> = {};
  const lines = source.split('\n');
  for (const line of lines) {
    const sm = line.match(SEQ_LINE_RE);
    if (sm) seqs[sm[1]] = sm[2].trim().split(/[\s,]+/).filter(Boolean);
  }
  for (const line of lines) {
    const cm = line.match(CHANNEL_LINE_RE);
    if (!cm) continue;
    // Drop channel flags (`lock=scale`) so they are not walked as seq names.
    const tokens = cm[3]
      .trim()
      .split(/[\s,]+/)
      .filter((t) => t && /^[A-Za-z_]/.test(t) && !t.includes('='));
    if (seqTreeContains(tokens, itemName, seqs)) {
      return { id: Number(cm[1]), inst: cm[2] };
    }
  }
  return null;
}
