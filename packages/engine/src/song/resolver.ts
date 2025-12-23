import { AST } from '../parser/ast.js';
import { expandAllSequences } from '../sequences/expand.js';
import { transposePattern } from '../patterns/expand.js';
import { SongModel, ChannelModel, ChannelEvent } from './songModel.js';
import { applyInstrumentToEvent } from '../instruments/instrumentState.js';

/**
 * Resolve an AST into a SongModel (ISM), expanding sequences and resolving
 * instrument overrides according to the language expansion pipeline.
 */
export function resolveSong(ast: AST): SongModel {
  const pats = ast.pats || {};
  const insts = ast.insts || {};
  const seqs = ast.seqs || {};
  const bpm = ast.bpm;

  // Expand all sequences into flattened token arrays
  const expandedSeqs = expandAllSequences(seqs, pats, insts);

  const channels: ChannelModel[] = [];

  for (const ch of ast.channels || []) {
    const chModel: ChannelModel = { id: ch.id, speed: ch.speed, events: [], defaultInstrument: ch.inst };

    // Determine source tokens: channel may reference a pattern name, sequence name, or already have token array
    let tokens: string[] = [];
    if (Array.isArray(ch.pat)) {
      tokens = ch.pat.slice();
    } else if (typeof ch.pat === 'string') {
      const ref = ch.pat;
      // A channel `seq` spec may contain multiple sequence names separated by
      // commas and repetition syntax like `name * 2`. We support two forms:
      //  - comma-separated: "lead,lead2"
      //  - repetition: "lead * 2" or "lead*2"
      let items: string[];
      if ((ch as any).seqSpecTokens) {
        const raw = (ch as any).seqSpecTokens as string[];
        const joined = raw.join(' ');
        // split on commas first, then split whitespace-only groups into multiple items
        items = [];
        for (const group of joined.split(',')) {
          const g = group.trim();
          if (!g) continue;
          if (g.indexOf('*') >= 0) {
            // keep repetition syntax intact (e.g. "lead * 2" or "lead*2")
            items.push(g);
          } else {
            // split whitespace-separated names (e.g. "lead lead2")
            const parts = g.split(/\s+/).map(s => s.trim()).filter(Boolean);
            items.push(...parts);
          }
        }
      } else {
        items = ref.indexOf(',') >= 0 ? ref.split(',').map(s => s.trim()).filter(Boolean) : [ref.trim()];
      }
      const outTokens: string[] = [];

      const expandRefToTokens = (itemRef: string): string[] => {
        // itemRef may include modifiers after `:` (e.g. name:oct(-1):inst(bass))
        const parts = itemRef.split(':');
        const base = parts[0];
        const mods = parts.slice(1);

        if (expandedSeqs[base]) {
          let tks = expandedSeqs[base].slice();
          // apply modifiers (same rules as for single refs)
          let semitones = 0;
          let octaves = 0;
          let instOverride: string | null = null;
          for (const mod of mods) {
            const mOct = mod.match(/^oct\((-?\d+)\)$/i);
            if (mOct) { octaves += parseInt(mOct[1], 10); continue; }
            if (/^rev$/i.test(mod)) { tks = tks.slice().reverse(); continue; }
            const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
            if (mSlow) {
              const factor = mSlow[1] ? parseInt(mSlow[1], 10) : 2;
              const outArr: string[] = [];
              for (const tt of tks) for (let r = 0; r < factor; r++) outArr.push(tt);
              tks = outArr;
              continue;
            }
            const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
            if (mFast) {
              const factor = mFast[1] ? parseInt(mFast[1], 10) : 2;
              tks = tks.filter((_, idx) => idx % factor === 0);
              continue;
            }
            const mInst = mod.match(/^inst\(([^)]+)\)$/i);
            if (mInst) { instOverride = mInst[1]; continue; }
            const mTrans = mod.match(/^([+-]?\d+)$/);
            if (mTrans) { semitones += parseInt(mTrans[1], 10); continue; }
            const mSem = mod.match(/^semitone\((-?\d+)\)$/i) || mod.match(/^st\((-?\d+)\)$/i) || mod.match(/^trans\((-?\d+)\)$/i);
            if (mSem) { semitones += parseInt(mSem[1], 10); continue; }
          }
          if (semitones !== 0 || octaves !== 0) {
            tks = transposePattern(tks, { semitones, octaves });
          }
          if (instOverride) {
            tks.unshift(`inst(${instOverride})`);
          }
          return tks;
        }

        if (pats[base]) {
          let tks = pats[base].slice();
          let semitones = 0;
          let octaves = 0;
          let instOverride: string | null = null;
          for (const mod of mods) {
            const mOct = mod.match(/^oct\((-?\d+)\)$/i);
            if (mOct) { octaves += parseInt(mOct[1], 10); continue; }
            if (/^rev$/i.test(mod)) { tks = tks.slice().reverse(); continue; }
            const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
            if (mSlow) {
              const factor = mSlow[1] ? parseInt(mSlow[1], 10) : 2;
              const outArr: string[] = [];
              for (const tt of tks) for (let r = 0; r < factor; r++) outArr.push(tt);
              tks = outArr;
              continue;
            }
            const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
            if (mFast) {
              const factor = mFast[1] ? parseInt(mFast[1], 10) : 2;
              tks = tks.filter((_, idx) => idx % factor === 0);
              continue;
            }
            const mInst = mod.match(/^inst\(([^)]+)\)$/i);
            if (mInst) { instOverride = mInst[1]; continue; }
            const mTrans = mod.match(/^([+-]?\d+)$/);
            if (mTrans) { semitones += parseInt(mTrans[1], 10); continue; }
            const mSem = mod.match(/^semitone\((-?\d+)\)$/i) || mod.match(/^st\((-?\d+)\)$/i) || mod.match(/^trans\((-?\d+)\)$/i);
            if (mSem) { semitones += parseInt(mSem[1], 10); continue; }
          }
          if (semitones !== 0 || octaves !== 0) {
            tks = transposePattern(tks, { semitones, octaves });
          }
          if (instOverride) tks.unshift(`inst(${instOverride})`);
          return tks;
        }

        // fallback: return the raw token so downstream logic can handle it
        return [itemRef];
      };

      for (const item of items) {
        // check repetition like "name * 2" or "name*2"
        const mRep = item.match(/^(.+?)\s*\*\s*(\d+)$/);
        const repeat = mRep ? parseInt(mRep[2], 10) : 1;
        const itemRef = mRep ? mRep[1].trim() : item;
        for (let r = 0; r < repeat; r++) {
          const toks = expandRefToTokens(itemRef);
          outTokens.push(...toks);
        }
      }

      tokens = outTokens;
    }

    // Instrument state
    let currentInstName: string | undefined = ch.inst;
    let tempInstName: string | undefined = undefined;
    let tempRemaining = 0;

    function resolveInstName(name: string | undefined) {
      if (!name) return undefined;
      return name in insts ? name : name; // keep string name; consumer can map to insts
    }

    for (let ti = 0; ti < tokens.length; ti++) {
      const token = tokens[ti];
      // inst(name) or inst(name,N)
      const mInstInline = typeof token === 'string' && token.match(/^inst\(([^,()\s]+)(?:,(\d+))?\)$/i);
      if (mInstInline) {
        const name = mInstInline[1];
        const count = mInstInline[2] ? parseInt(mInstInline[2], 10) : null;
        if (count && count > 0) {
          // Look ahead to determine if any future token will produce an event
          let hasFutureEvent = false;
          for (let j = ti + 1; j < tokens.length; j++) {
            const fut = tokens[j];
            if (!fut) continue;
            if (typeof fut === 'string' && /^inst\(/i.test(fut)) continue;
            if (typeof fut === 'string' && fut === '.') continue;
            // any other token is assumed to produce an event
            hasFutureEvent = true;
            break;
          }
          if (!hasFutureEvent) {
            // Emit `count` immediate named hits on successive ticks
            for (let k = 0; k < count; k++) {
              const ev: ChannelEvent = { type: 'named', token: name, instrument: name };
              const evWithProps = applyInstrumentToEvent(insts, ev) as ChannelEvent;
              chModel.events.push(evWithProps);
            }
            continue;
          }
          // Otherwise behave as temporary override
          tempInstName = resolveInstName(name);
          tempRemaining = count;
        } else {
          // permanent inline change
          currentInstName = resolveInstName(name);
        }
        continue;
      }

      // Immediate hit syntax: hit(name,N)
      const mHit = typeof token === 'string' && token.match(/^hit\(([^,()\s]+)(?:,(\d+))?\)$/i);
      if (mHit) {
        const name = mHit[1];
        const count = mHit[2] ? parseInt(mHit[2], 10) : 1;
        for (let k = 0; k < count; k++) {
          const ev: ChannelEvent = { type: 'named', token: name, instrument: name };
          const evWithProps = applyInstrumentToEvent(insts, ev) as ChannelEvent;
          chModel.events.push(evWithProps);
        }
        continue;
      }

      if (token === '.' || token === 'rest' || token === 'R') {
        chModel.events.push({ type: 'rest' } as ChannelEvent);
        continue;
      }

      if (token === '_' || token === '-' || token === 'sustain') {
        chModel.events.push({ type: 'sustain' } as ChannelEvent);
        continue;
      }

      // named instrument token (e.g. 'snare') — if it matches an inst name
      if (typeof token === 'string' && insts[token]) {
        let ev: ChannelEvent = { type: 'named', token, instrument: token };
        ev = applyInstrumentToEvent(insts, ev) as ChannelEvent;
        chModel.events.push(ev);
        // Update current instrument so subsequent notes use this instrument
        currentInstName = token;
        // decrement temp only for non-rest
        if (tempRemaining > 0) {
          tempRemaining -= 1;
          if (tempRemaining <= 0) { tempInstName = undefined; tempRemaining = 0; }
        }
        continue;
      }

      // assume token is a note like C4
      if (typeof token === 'string') {
        const useInst = tempInstName || currentInstName;
        let ev: ChannelEvent = { type: 'note', token, instrument: useInst };
        ev = applyInstrumentToEvent(insts, ev) as ChannelEvent;
        chModel.events.push(ev);
        if (tempRemaining > 0) {
          tempRemaining -= 1;
          if (tempRemaining <= 0) { tempInstName = undefined; tempRemaining = 0; }
        }
        continue;
      }
    }

    channels.push(chModel);
  }

  // Also populate `pat` on each channel with the resolved event list for
  // backward-compatible playback (Player expects `ch.pat` to hold tokens
  // or event objects). This keeps both `events` and `pat` available.
  const channelsOut = channels.map(c => ({ id: c.id, events: c.events, defaultInstrument: c.defaultInstrument, pat: c.events } as any));

  return { pats, insts, seqs: expandedSeqs, channels: channelsOut, bpm } as unknown as SongModel;
}

export default { resolveSong };
