import { parse as peggyParse } from './generated/parser.js';
import { expandPattern, transposePattern } from '../../patterns/expand.js';
import {
  AST,
  ChannelNode,
  InstMap,
  PatternEvent,
  PatternEventMap,
  PlayNode,
  SequenceItem,
  SequenceItemMap,
  SequenceTransform,
  SeqMap,
  SourceLocation,
  SongMetadata,
} from '../ast.js';
import {
  RawSeqItem,
  RawSeqModifier,
  isPeggyEventsEnabled,
  materializeSequenceItems,
  normalizeSeqItems,
  parseSeqTransforms,
  patternEventsToTokens,
} from '../structured.js';
import { parseSweep } from '../../chips/gameboy/pulse.js';

interface BaseStmt { nodeType: string; loc?: SourceLocation }
interface ChipStmt extends BaseStmt { nodeType: 'ChipStmt'; chip: string }
interface BpmStmt extends BaseStmt { nodeType: 'BpmStmt'; bpm: number }
interface TimeStmt extends BaseStmt { nodeType: 'TimeStmt'; time: number }
interface StepsPerBarStmt extends BaseStmt { nodeType: 'StepsPerBarStmt'; stepsPerBar: number }
interface TicksPerStepStmt extends BaseStmt { nodeType: 'TicksPerStepStmt'; ticksPerStep: number }
interface SongMetaStmt extends BaseStmt { nodeType: 'SongMetaStmt'; key: string; value: string }
interface InstStmt extends BaseStmt { nodeType: 'InstStmt'; name: string; rhs: string }
interface PatStmt extends BaseStmt { nodeType: 'PatStmt'; name: string; rhsEvents?: PatternEvent[]; rhsTokens?: string[]; rhs?: string }
interface SeqStmt extends BaseStmt { nodeType: 'SeqStmt'; name: string; rhsItems?: RawSeqItem[]; rhsTokens?: string[]; rhs?: string }
interface ChannelStmt extends BaseStmt { nodeType: 'ChannelStmt'; channel: number; rhs: string }
interface PlayStmt extends BaseStmt { nodeType: 'PlayStmt'; args: string }
interface ExportStmt extends BaseStmt { nodeType: 'ExportStmt'; format: string; path: string }

type Statement =
  | ChipStmt
  | BpmStmt
  | TimeStmt
  | StepsPerBarStmt
  | TicksPerStepStmt
  | SongMetaStmt
  | InstStmt
  | PatStmt
  | SeqStmt
  | ChannelStmt
  | PlayStmt
  | ExportStmt;

interface ProgramNode {
  nodeType: 'Program';
  body: Statement[];
}

const warnProblematicPatternName = (name: string): void => {
  const isSingleLetterNote = /^[A-Ga-g]$/.test(name);
  const isNoteWithOctave = /^[A-Ga-g][#b]?-?\d+$/.test(name);

  if (isSingleLetterNote || isNoteWithOctave) {
    console.warn(
      `[BeatBax Parser] Warning: Pattern name '${name}' may be confused with a note name. Consider using a more descriptive name like '${name}_pattern' or '${name}_pat'.`
    );
  }
};
const parseInstRhs = (name: string, rhs: string, insts: InstMap): void => {
  const rest = rhs.trim();
  const parts = rest.split(/\s+/);
  const props: Record<string, any> = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq >= 0) {
      const k = p.slice(0, eq);
      const v = p.slice(eq + 1);
      if (v.startsWith('{') && v.endsWith('}')) {
        try {
          props[k] = JSON.parse(v);
        } catch (e) {
          props[k] = v;
        }
      } else {
        props[k] = v;
      }
    } else if (p.trim()) {
      props[p] = 'true';
    }
  }
  try {
    if (props.sweep) {
      const parsed = parseSweep(props.sweep as any);
      if (parsed) props.sweep = parsed as any;
    }
  } catch (e) {
    // keep original value
  }
  insts[name] = props;
};

const expandPatternSpec = (nameSpec: string, rhsRaw?: string, rhsTokens?: string[], rhsEvents?: PatternEvent[]): { name: string; tokens: string[] } => {
  let tokens = rhsTokens ? rhsTokens.slice() : undefined;
  if (!tokens && rhsEvents && rhsEvents.length > 0) {
    tokens = patternEventsToTokens(rhsEvents);
  }

  let rhs = rhsRaw ? rhsRaw.trim() : '';
  if (tokens === undefined) {
    if ((rhs.startsWith('"') && rhs.endsWith('"')) || (rhs.startsWith("'") && rhs.endsWith("'"))) {
      rhs = rhs.slice(1, -1);
    }
  }

  const parts = nameSpec.split(':');
  const baseName = parts[0];
  const mods = parts.slice(1);

  warnProblematicPatternName(baseName);

  try {
    let expanded = tokens ?? expandPattern(rhs);
    if (mods.length > 0) {
      let semitones = 0;
      let octaves = 0;
      for (const mod of mods) {
        const mOct = mod.match(/^oct\((-?\d+)\)$/i);
        if (mOct) {
          octaves += parseInt(mOct[1], 10);
          continue;
        }
        if (/^rev$/i.test(mod)) {
          expanded = expanded.slice().reverse();
          continue;
        }
        if (/^slow(?:\((\d+)\))?$/i.test(mod)) {
          const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
          const factor = mSlow && mSlow[1] ? parseInt(mSlow[1], 10) : 2;
          const out: string[] = [];
          for (const t of expanded) for (let r = 0; r < factor; r++) out.push(t);
          expanded = out;
          continue;
        }
        if (/^fast(?:\((\d+)\))?$/i.test(mod)) {
          const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
          const factor = mFast && mFast[1] ? parseInt(mFast[1], 10) : 2;
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
    return { name: baseName, tokens: expanded };
  } catch (err) {
    return { name: baseName, tokens: [rhs] };
  }
};

const parseChannelRhs = (id: number, rhs: string, pats: Record<string, string[]>): ChannelNode & { seqSpecTokens?: string[] } => {
  const tokens = rhs.split(/\s+/);
  const ch: { id: number; inst?: string; pat?: string | string[]; speed?: number; seqSpecTokens?: string[] } = { id };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'inst' && tokens[i + 1]) {
      ch.inst = tokens[i + 1];
      i++;
    } else if (t === 'pat' && tokens[i + 1]) {
      const patRef = tokens[i + 1];
      let patSpec = (patRef.startsWith('"') || patRef.startsWith("'")) ? patRef.replace(/^['"]|['"]$/g, '') : patRef;
      ch.pat = patSpec;
      i++;
    } else if (t === 'seq' && tokens[i + 1]) {
      const restTokens = tokens.slice(i + 1);
      const rest = restTokens.join(' ');
      let seqSpec = (rest.startsWith('"') || rest.startsWith("'")) ? rest.replace(/^['"]|['"]$/g, '') : rest;
      ch.pat = seqSpec.trim();
      ch.seqSpecTokens = restTokens;
      break;
    } else if (t.startsWith('bpm=')) {
      const v = t.slice(4);
      throw new Error(
        `channel ${id}: channel-level 'bpm' is not supported (found 'bpm=${v}'). ` +
        `Use a top-level 'bpm' directive or sequence transforms (fast/slow) instead.`
      );
    } else if (t === 'bpm') {
      const v = tokens[i + 1];
      throw new Error(
        `channel ${id}: channel-level 'bpm' is not supported (found 'bpm ${v}'). ` +
        `Use a top-level 'bpm' directive or sequence transforms (fast/slow) instead.`
      );
    } else if (t.startsWith('speed=')) {
      let v = t.slice(6);
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

  if (typeof ch.pat === 'string') {
    const parts = ch.pat.split(':');
    const base = parts[0];
    const mods = parts.slice(1);
    if (pats[base]) {
      let tokensResolved = pats[base].slice();
      if (mods.length > 0) {
        let semitones = 0;
        let octaves = 0;
        for (const mod of mods) {
          const mOct = mod.match(/^oct\((-?\d+)\)$/i);
          if (mOct) {
            octaves += parseInt(mOct[1], 10);
            continue;
          }
          if (/^rev$/i.test(mod)) {
            tokensResolved = tokensResolved.slice().reverse();
            continue;
          }
          const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
          if (mSlow) {
            const factor = mSlow[1] ? parseInt(mSlow[1], 10) : 2;
            const out: string[] = [];
            for (const t2 of tokensResolved) for (let r = 0; r < factor; r++) out.push(t2);
            tokensResolved = out;
            continue;
          }
          const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
          if (mFast) {
            const factor = mFast[1] ? parseInt(mFast[1], 10) : 2;
            tokensResolved = tokensResolved.filter((_, idx) => idx % factor === 0);
            continue;
          }
          const mInst = mod.match(/^inst\(([^)]+)\)$/i);
          if (mInst) {
            ch.inst = mInst[1];
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
    }
  }

  return ch;
};

const parsePlay = (args: string): PlayNode => {
  const flagsRaw = args ? args.trim() : '';
  const flags = flagsRaw ? flagsRaw.split(/\s+/) : [];
  return {
    flags,
    auto: flags.includes('auto'),
    repeat: flags.includes('repeat'),
  };
};

export function parseWithPeggy(source: string): AST {
  const program = peggyParse(source, {}) as ProgramNode;
  const pats: Record<string, string[]> = {};
  const insts: InstMap = {};
  const seqs: SeqMap = {};
  const patternEvents: PatternEventMap = {};
  const sequenceItems: SequenceItemMap = {};
  const channels: ChannelNode[] = [];
  const metadata: SongMetadata = {};

  const structuredEnabled = isPeggyEventsEnabled();

  let topBpm: number | undefined = undefined;
  let chipName: string | undefined = undefined;
  let playNode: PlayNode | undefined = undefined;

  for (const stmt of program.body) {
    switch (stmt.nodeType) {
      case 'SongMetaStmt': {
        const val = stmt.value ?? '';
        if (stmt.key === 'tags') {
          const tags = val.split(/[\,\n\r]+/).map(t => t.trim()).filter(Boolean);
          metadata.tags = (metadata.tags || []).concat(tags);
        } else if (stmt.key === 'name') {
          metadata.name = val;
        } else if (stmt.key === 'artist') {
          metadata.artist = val;
        } else if (stmt.key === 'description') {
          metadata.description = val;
        }
        break;
      }
      case 'BpmStmt': {
        topBpm = stmt.bpm;
        break;
      }
      case 'ChipStmt': {
        chipName = stmt.chip;
        break;
      }
      case 'InstStmt': {
        parseInstRhs(stmt.name, stmt.rhs, insts);
        break;
      }
      case 'PatStmt': {
        const { name, tokens } = expandPatternSpec(stmt.name, (stmt as any).rhs, (stmt as any).rhsTokens, stmt.rhsEvents);
        if (stmt.rhsEvents && stmt.rhsEvents.length > 0) {
          patternEvents[name] = stmt.rhsEvents;
        }
        pats[name] = tokens;
        break;
      }
      case 'SeqStmt': {
        const rhs = stmt.rhs ? stmt.rhs.trim() : '';
        const items = normalizeSeqItems(stmt.rhsItems, rhs, stmt.rhsTokens);
        if (items.length === 0) {
          console.warn(
            `[BeatBax Parser] Warning: sequence '${stmt.name}' has no RHS content (empty). ` +
            `Define patterns after '=' or remove the empty 'seq ${stmt.name} =' line.`
          );
          seqs[stmt.name] = [];
          break;
        }
        sequenceItems[stmt.name] = items;
        seqs[stmt.name] = materializeSequenceItems(items);
        break;
      }
      case 'ChannelStmt': {
        channels.push(parseChannelRhs(stmt.channel, stmt.rhs.trim(), pats));
        break;
      }
      case 'PlayStmt': {
        playNode = parsePlay(stmt.args);
        break;
      }
      default:
        // ignore for now (time/stepsPerBar/ticksPerStep/export)
        break;
    }
  }

  if (chipName === 'gameboy' || !chipName) {
    for (const [name, props] of Object.entries(insts)) {
      const p = props as any;
      if (p.sweep && p.type !== 'pulse1') {
        console.warn(`[BeatBax Parser] Warning: Instrument '${name}' has a 'sweep' property but is not type 'pulse1'. Sweep is only supported on Pulse 1.`);
      }

      if (p.type && String(p.type).toLowerCase() === 'wave') {
        const raw = p.volume !== undefined ? p.volume : (p.vol !== undefined ? p.vol : undefined);
        if (raw === undefined) {
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

  const includeStructured = structuredEnabled;

  const ast: AST = { pats, insts, seqs, channels, bpm: topBpm, chip: chipName, play: playNode, metadata };
  if (includeStructured) {
    ast.patternEvents = patternEvents;
    ast.sequenceItems = sequenceItems;
  }

  return ast;
}
