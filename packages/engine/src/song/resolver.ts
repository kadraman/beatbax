import { AST, SequenceItem } from '../parser/ast.js';
import { warn as diagWarn } from '../util/diag.js';
import { expandAllSequences } from '../sequences/expand.js';
import { transposePattern } from '../patterns/expand.js';
import { SongModel, ChannelModel, ChannelEvent, NamedInstrumentEvent } from './songModel.js';
import { applyInstrumentToEvent } from '../instruments/instrumentState.js';
import {
  materializeSequenceItems,
  patternEventsToTokens,
} from '../parser/structured.js';
import { expandRefToTokens } from '../expand/refExpander.js';
import { resolveImports, resolveImportsSync } from './importResolver.js';
import { isRemoteImport } from '../import/urlUtils.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('resolver');

// Helpers for parsing inline effects and pan specifications
function parsePanSpec(val: any, ns?: string) {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim();
  const up = s.toUpperCase();
  if (up === 'L' || up === 'R' || up === 'C') {
    return { enum: up as 'L' | 'R' | 'C', sourceNamespace: ns };
  }
  // Numeric value
  const n = Number(s);
  if (!Number.isNaN(n)) {
    return { value: Math.max(-1, Math.min(1, n)), sourceNamespace: ns };
  }
  return undefined;
}

// Helper: determine whether a parsed pan value is effectively empty.
// We only consider an object "non-empty" if it has its own `enum` or `value` property.
export function isPanEmpty(pan: any): boolean {
  if (pan === undefined || pan === null) return true;
  if (typeof pan === 'object') {
    const hasEnum = Object.prototype.hasOwnProperty.call(pan, 'enum');
    const hasValue = Object.prototype.hasOwnProperty.call(pan, 'value');
    return !(hasEnum || hasValue);
  }
  // strings or numbers are considered non-empty pan specifications
  return false;
}

export function parseEffectParams(paramsStr: string | undefined): Array<string | number> {
  if (!paramsStr || !paramsStr.length) return [];
  return paramsStr
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '')
    .map(s => (isNaN(Number(s)) ? s : Number(s)));
}

export function parseEffectsInline(str: string) {
  // Keep empty parts so positional empty parameters are preserved (e.g. "vib:3,6,,8")
  const rawParts = str.split(',').map(s => s.trim());
  const effects: Array<{ type: string; params: Array<string | number>; paramsStr?: string }> = [];
  let pan: any = undefined;

  // Group parts so that effect parameters following a `type:...` are attached
  // to that effect until the next part that contains a colon (start of next effect).
  let currentEffect: { type: string; paramsStr?: string } | null = null;
  for (const p of rawParts) {
    // Detect namespaced pan tokens first: gb:pan:L, pan:L, pan=-0.5
    const panMatch = p.match(/^(?:(gb):)?pan[:=](-?\d*\.?\d+|L|R|C)$/i);
    if (panMatch) {
      const [, ns, val] = panMatch;
      const up = String(val).toUpperCase();
      if (up === 'L' || up === 'R' || up === 'C') {
        pan = { enum: up as 'L'|'R'|'C', sourceNamespace: ns || undefined };
      } else {
        const num = Number(val);
        if (!Number.isNaN(num)) pan = { value: Math.max(-1, Math.min(1, num)), sourceNamespace: ns || undefined };
      }
      // finalize any pending effect before continuing
      if (currentEffect) {
        effects.push({ type: currentEffect.type, params: parseEffectParams(currentEffect.paramsStr) });
        currentEffect = null;
      }
      continue;
    }

    // Check if this part starts a new effect (contains a colon)
    const m = p.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):(.*)$/);
    if (m && m[1]) {
      // This part has a colon, so it's a new effect type:params
      if (currentEffect) {
        effects.push({ type: currentEffect.type, params: parseEffectParams(currentEffect.paramsStr), paramsStr: currentEffect.paramsStr });
      }
      currentEffect = { type: m[1], paramsStr: m[2] };
    } else if (currentEffect) {
      // This part is an additional parameter for the current effect
      currentEffect.paramsStr = (currentEffect.paramsStr ? (currentEffect.paramsStr + ',' + p) : p);
    } else {
      // Bare identifier with no colon - treat as an effect type with no params (preset name)
      const bareMatch = p.match(/^[a-zA-Z_][a-zA-Z0-9_-]*$/);
      if (bareMatch) {
        currentEffect = { type: p, paramsStr: '' };
      }
    }
    // Otherwise orphaned - ignore it
  }
  if (currentEffect) {
    effects.push({ type: currentEffect.type, params: parseEffectParams(currentEffect.paramsStr), paramsStr: currentEffect.paramsStr });
  }
  return { effects, pan };
}

/**
 * Resolve an AST into a SongModel (ISM), expanding sequences and resolving
 * instrument overrides according to the language expansion pipeline.
 *
 * Note: This function does not support remote imports. For remote imports,
 * use resolveSongAsync() instead.
 */
export function resolveSong(ast: AST, opts?: { filename?: string; searchPaths?: string[]; strictInstruments?: boolean; onWarn?: (d: { component: string; message: string; file?: string; loc?: any }) => void }): SongModel {
  // Check for remote imports
  if (ast.imports && ast.imports.some(imp => isRemoteImport(imp.source))) {
    throw new Error(
      'Remote imports (http://, https://, github:) are not supported in synchronous mode. ' +
      'Use resolveSongAsync() instead.'
    );
  }

  // Resolve imports first if present
  if (ast.imports && ast.imports.length > 0) {
    ast = resolveImportsSync(ast, {
      baseFilePath: opts?.filename,
      searchPaths: opts?.searchPaths,
      strictMode: opts?.strictInstruments,
      onWarn: (message, loc) => {
        if (opts?.onWarn) {
          opts.onWarn({ component: 'import-resolver', message, file: opts.filename, loc });
        }
      },
    });
  }

  return resolveSongInternal(ast, opts);
}

/**
 * Async version of resolveSong that supports remote imports.
 * Use this when your AST may contain remote imports (http://, https://, github:).
 */
export async function resolveSongAsync(ast: AST, opts?: { filename?: string; searchPaths?: string[]; strictInstruments?: boolean; onWarn?: (d: { component: string; message: string; file?: string; loc?: any }) => void }): Promise<SongModel> {
  // Resolve imports first if present (supports both local and remote)
  if (ast.imports && ast.imports.length > 0) {
    ast = await resolveImports(ast, {
      baseFilePath: opts?.filename,
      searchPaths: opts?.searchPaths,
      strictMode: opts?.strictInstruments,
      onWarn: (message, loc) => {
        if (opts?.onWarn) {
          opts.onWarn({ component: 'import-resolver', message, file: opts.filename, loc });
        }
      },
    });
  }

  return resolveSongInternal(ast, opts);
}

/**
 * Internal implementation shared by resolveSong and resolveSongAsync.
 * Assumes imports have already been resolved.
 */
function resolveSongInternal(ast: AST, opts?: { filename?: string; searchPaths?: string[]; strictInstruments?: boolean; onWarn?: (d: { component: string; message: string; file?: string; loc?: any }) => void }): SongModel {
  log.debug('resolveSongInternal START - channels in AST:', ast.channels?.length);
  log.debug('Resolving song', {
    patterns: Object.keys(ast.pats || {}).length,
    sequences: Object.keys(ast.seqs || {}).length,
    instruments: Object.keys(ast.insts || {}).length,
    channels: (ast.channels || []).length,
    bpm: ast.bpm,
  });

  let pats = ast.pats || {};
  const insts = ast.insts || {};
  let seqs: Record<string, string[] | SequenceItem[]> = { ...(ast.seqs || {}) };
  let bpm = ast.bpm;

  if (ast.patternEvents) {
    const materialized: Record<string, string[]> = {};
    for (const [name, events] of Object.entries(ast.patternEvents)) {
      materialized[name] = patternEventsToTokens(events);
    }
    pats = { ...pats, ...materialized }; // structured takes precedence on key collision
  }

  // Prefer structured `sequenceItems` (if present) so downstream expanders
  // can handle structured transforms/tokens directly. We don't fully
  // materialize them here; expanders accept either string[] or
  // structured SequenceItem[] and will materialize as needed.
  if (ast.sequenceItems) {
    // `ast.sequenceItems` contains structured `SequenceItem[]` entries.
    // Merge into `seqs` while preserving the possibility that values
    // may be either `string[]` (expanded) or `SequenceItem[]` (structured).
    seqs = { ...seqs, ...ast.sequenceItems };
  }

  // Expand all sequences into flattened token arrays
  log.debug('Expanding sequences', { count: Object.keys(seqs).length });
  const expandedSeqs = expandAllSequences(seqs, pats, insts, ast.effects as any);
  log.debug('Sequences expanded', { count: Object.keys(expandedSeqs).length });

  // Helper: expand inline effect presets found inside `<...>` by looking up
  // named presets from `ast.effects`. If an inline effect is a bare name
  // that matches a preset and has no explicit params, replace it with the
  // preset's parsed effects (but do not override other explicit inline
  // effects of the same type — explicit inline params take precedence).
  const expandInlinePresets = (effectsArr: Array<{ type: string; params: any[]; paramsStr?: string }> | undefined) => {
    if (!effectsArr || !ast.effects) return effectsArr || [];
    const presets: Record<string, string> = ast.effects as any;
    // Collect types that were explicitly provided with params in the inline list
    const explicitTypes = new Set<string>();
    for (const e of effectsArr) {
      if (e.params && e.params.length > 0) explicitTypes.add(e.type);
    }

    const out: Array<{ type: string; params: any[]; paramsStr?: string }> = [];
    for (const e of effectsArr) {
      // If this effect name matches a preset and has no params, expand it
      if (presets[e.type] && (!e.params || e.params.length === 0)) {
        const presetParsed = parseEffectsInline(presets[e.type]);
        for (const pe of presetParsed.effects) {
          if (!explicitTypes.has(pe.type)) out.push(pe as any);
        }
      } else {
        out.push(e);
      }
    }
    return out;
  };

  // Helper: normalize effect durations (especially vibrato/tremolo rows-to-seconds conversion)
  const normalizeEffectDurations = (effects: any[], bpm: number, ticksPerStep: number = 16) => {
    if (!effects || !effects.length) return effects;

    return effects.map(effect => {
      // Both vibrato and tremolo support durationRows as params[3]
      if ((effect.type === 'vib' || effect.type === 'trem') && effect.params && effect.params.length >= 4) {
        try {
          const durationRows = Number(effect.params[3]);
          if (!Number.isNaN(durationRows) && durationRows > 0) {
            // Convert rows to seconds: (rows / stepsPerRow) / (bpm / 60)
            const stepsPerRow = ticksPerStep / 4; // assuming 4/4 time
            const beatsPerSecond = bpm / 60;
            const durationSec = (durationRows / stepsPerRow) / beatsPerSecond;

            return {
              ...effect,
              params: [...effect.params.slice(0, 3), effect.params[3]],
              durationSec
            };
          }
        } catch (e) {
          // If conversion fails, keep original params
        }
      }
      return effect;
    });
  };

  // Helper to consistently emit resolver warnings via opts.onWarn if it's a
  // function, otherwise fall back to the diagnostic helper.
  const emitResolverWarn = (message: string, loc?: any) => {
    const meta = { file: opts && opts.filename ? opts.filename : undefined, loc };
    if (opts && typeof opts.onWarn === 'function') {
      opts.onWarn({ component: 'resolver', message, file: meta.file, loc: meta.loc });
    } else {
      diagWarn('resolver', message, meta);
    }
  };

  const channels: ChannelModel[] = [];

  // use shared expander

  // Support `arrange` AST: if present prefer it over channel mappings.
  const channelSources = (() => {
    if (ast.arranges && Object.keys(ast.arranges).length > 0) {
      if (ast.channels && ast.channels.length > 0) {
        emitResolverWarn('Both `arrange` and `channel` mappings present; using `arrange` and ignoring `channel` mappings.', undefined);
      }
      // choose 'main' arrange if present, otherwise first arrange
      const keys = Object.keys(ast.arranges!);
      const selected = keys.includes('main') ? 'main' : keys[0];
      const arr = (ast.arranges as any)[selected];
      // If the arrange supplies a bpm default, prefer it for this resolved song
      if (arr.defaults && arr.defaults.bpm != null) {
        const nb = Number(arr.defaults.bpm);
        if (!Number.isNaN(nb)) bpm = nb;
      }
      const rows: (string | null)[][] = arr.arrangements || [];
      // support per-column instrument defaults encoded as a '|' separated string
      let arrangeInstList: string[] | null = null;
      if (arr.defaults && arr.defaults.inst && typeof arr.defaults.inst === 'string' && arr.defaults.inst.indexOf('|') >= 0) {
        arrangeInstList = String(arr.defaults.inst).split('|').map(s => s.trim());
      }
      const maxSlots = rows.reduce((m, r) => Math.max(m, r.length), 0);
      const channelNodes: any[] = [];
      for (let i = 0; i < maxSlots; i++) {
        const concatenated: string[] = [];
        for (const row of rows) {
          const slot = row[i];
          if (!slot) continue;
          // do not insert inline `inst(...)` tokens here; per-column defaults are applied
          // via the synthesized channel's `inst` property (handled below)
          // expand the referenced sequence into tokens (if available), supporting transforms
          const toks = expandRefToTokens(slot, expandedSeqs, pats, ast.effects as any);
          const base = String(slot).split(':')[0];
          // If expansion produced a single raw token equal to the slot and the base
          // name doesn't exist as a sequence or pattern, emit a warning.
          if (toks.length === 1 && toks[0] === slot && !expandedSeqs[base] && !pats[base]) {
            emitResolverWarn(`arrange: sequence '${slot}' not found while expanding arrange '${selected}'.`, arr.loc);
            continue;
          }
          concatenated.push(...toks);
        }
        const instForCol = arrangeInstList ? (arrangeInstList[i] || undefined) : (arr.defaults && arr.defaults.inst ? arr.defaults.inst : undefined);
        const speedForCol = arr.defaults && arr.defaults.speed ? arr.defaults.speed : undefined;
        channelNodes.push({ id: i + 1, pat: concatenated, inst: instForCol, speed: speedForCol });
      }
      return channelNodes;
    }
    return ast.channels || [];
  })();

  for (const ch of channelSources) {
    log.debug(`Processing channel ${ch.id}, ch.pat type: ${typeof ch.pat}, value:`, ch.pat);
    const chModel: ChannelModel = { id: ch.id, speed: ch.speed, events: [], defaultInstrument: ch.inst };

    // Phase 2.5: Track source sequence name(s) for metadata
    let sourceSequenceName: string | undefined = undefined;
    if (typeof ch.pat === 'string') {
      // Capture the first sequence/pattern name (before any transforms or repetitions)
      const firstRef = ch.pat.split(',')[0].trim().split('*')[0].trim().split(':')[0].trim();
      sourceSequenceName = firstRef;
      log.debug(`Channel ${ch.id}: sourceSequenceName set to '${sourceSequenceName}' from ch.pat='${ch.pat}'`);
    } else {
      log.debug(`Channel ${ch.id}: ch.pat is not a string (type: ${typeof ch.pat})`);
    }
    // End Phase 2.5

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
        items = ref.indexOf(',') >= 0 ? ref.split(',').map((s: string) => s.trim()).filter(Boolean) : [ref.trim()];
      }
      const outTokens: string[] = [];



      for (const item of items) {
        // check repetition like "name * 2" or "name*2"
        const mRep = item.match(/^(.+?)\s*\*\s*(\d+)$/);
        const repeat = mRep ? parseInt(mRep[2], 10) : 1;
        const itemRef = mRep ? mRep[1].trim() : item;
        for (let r = 0; r < repeat; r++) {
          const toks = expandRefToTokens(itemRef, expandedSeqs, pats, ast.effects as any, ch.loc);
          outTokens.push(...toks);
        }
      }

      tokens = outTokens;
    }

    // Instrument state
    let currentInstName: string | undefined = ch.inst;
    let tempInstName: string | undefined = undefined;
    let tempRemaining = 0;
    // Sequence-level pan override (applies until reset via pan() token)
    let sequencePanOverride: any = undefined;

    // Phase 2.5: Helper to calculate bar number from token index
    // Assumes 4/4 time and 16 ticks per step by default
    const calculateBarNumber = (tokenIndex: number): number => {
      const ticksPerStep = 16; // default ticks per step
      const stepsPerBar = 4; // default time signature (4/4)
      const tokensPerBar = stepsPerBar; // one token per step
      return Math.floor(tokenIndex / tokensPerBar);
    };

    // Helper to attach position metadata to events
    const attachMetadata = (event: ChannelEvent, tokenIndex: number): ChannelEvent => {
      const eventWithMeta = event as any;
      const barNum = calculateBarNumber(tokenIndex);
      // ALWAYS add debug fields to prove this function is called
      eventWithMeta._debug_attachMetadataCalled = true;
      eventWithMeta._debug_sourceSequenceNameValue = String(sourceSequenceName);
      eventWithMeta._debug_tokenIndex = tokenIndex;
      eventWithMeta._debug_barNum = barNum;

      if (event.type === 'note' || event.type === 'named') {
        if (sourceSequenceName) {
          eventWithMeta.sourceSequence = sourceSequenceName;
        }
        eventWithMeta.barNumber = barNum;
      }
      return eventWithMeta;
    };
    // End Phase 2.5

    function resolveInstName(name: string | undefined) {
      if (!name) return undefined;
      return name in insts ? name : name; // keep string name; consumer can map to insts
    }

    for (let ti = 0; ti < tokens.length; ti++) {
      const token = tokens[ti];
      if (ti === 0) {
        log.debug(`Channel ${ch.id} token loop START, total tokens: ${tokens.length}, first token:`, token);
      }
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
              chModel.events.push(attachMetadata(evWithProps, ti));
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

      // pan(spec) sets a sequence-level pan override for the following tokens in this occurrence
      const mPanInline = typeof token === 'string' && token.match(/^pan\(([^)]*)\)$/i);
      const mPanReset = typeof token === 'string' && token.match(/^pan\(\s*\)$/i);
      if (mPanReset) {
        sequencePanOverride = undefined;
        continue;
      }
      if (mPanInline) {
        const specRaw = (mPanInline[1] || '').trim();
        if (specRaw) {
          // support 'gb:R' or 'R' or numeric
          const mNs = specRaw.match(/^(gb)[:]?(.+)$/i);
          if (mNs) sequencePanOverride = parsePanSpec(mNs[2], mNs[1]);
          else sequencePanOverride = parsePanSpec(specRaw);
        } else {
          sequencePanOverride = undefined;
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
          chModel.events.push(attachMetadata(evWithProps, ti));
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
        const inst = insts[token];
        let ev: ChannelEvent = { type: 'named', token, instrument: token };
        ev = applyInstrumentToEvent(insts, ev) as ChannelEvent;
        // Pass instrument's default note if specified (after applyInstrumentToEvent)
        if (inst.note) {
          (ev as NamedInstrumentEvent).defaultNote = inst.note as string;
        }
        chModel.events.push(attachMetadata(ev, ti));
        // Update current instrument so subsequent notes use this instrument
        currentInstName = token;
        // decrement temp only for non-rest
        if (tempRemaining > 0) {
          tempRemaining -= 1;
          if (tempRemaining <= 0) { tempInstName = undefined; tempRemaining = 0; }
        }
        continue;
      }
      // assume token is a note like C4 or a note with inline effects: C4<pan:-0.5,vib:4>
      if (typeof token === 'string') {
        // Extract inline effect block if present
        const inlineMatch = token.match(/^([^<]+)<(.+)>$/);
        let baseToken = token;
        let parsedPan: any = undefined;
        let parsedEffects: any[] = [];
        if (inlineMatch) {
          baseToken = inlineMatch[1];
          const inner = inlineMatch[2];
          const parsed = parseEffectsInline(inner);
          parsedPan = parsed.pan;
          parsedEffects = expandInlinePresets(parsed.effects || []);
        }

        const useInst = tempInstName || currentInstName;
        let ev: any = { type: 'note', token: baseToken, instrument: useInst };
        // attach parsed inline pan/effects to event object
        if (parsedPan) ev.pan = parsedPan;
        if (parsedEffects && parsedEffects.length) {
          ev.effects = normalizeEffectDurations(parsedEffects, bpm || 120, 16);
          // Set legato=true if note has portamento effect (prevents envelope retrigger)
          const hasPortamento = ev.effects.some((fx: any) =>
            fx && (fx.type === 'port' || (typeof fx === 'string' && fx.toLowerCase() === 'port'))
          );
          if (hasPortamento) {
            ev.legato = true;
          }
        }

        ev = applyInstrumentToEvent(insts, ev) as any;

        // Sequence-level pan override (from :pan() modifier on seq items)
        if (isPanEmpty(ev.pan) && sequencePanOverride) {
          ev.pan = sequencePanOverride;
        }

        // If no inline/sequence pan, but instrument has a pan property, use it as default
        if (isPanEmpty(ev.pan) && ev.instProps) {
          const ip = ev.instProps as any;
          if (ip['gb:pan']) {
            ev.pan = parsePanSpec(ip['gb:pan'], 'gb');
          } else if (ip['pan']) {
            ev.pan = parsePanSpec(ip['pan']);
          }
        }

        chModel.events.push(attachMetadata(ev, ti));
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

  log.debug('Channel events sample:', channelsOut[0]?.events?.slice(0, 3));

  const totalEvents = channels.reduce((sum, c) => sum + c.events.length, 0);
  log.debug('Resolution complete', {
    channels: channels.length,
    totalEvents,
    bpm,
  });

  log.info(`Resolved successfully: ${channels.length} channels with ${totalEvents} total events`);

  // Preserve top-level playback directives and metadata so consumers can honor them.
  return {
    pats,
    insts,
    seqs: expandedSeqs,
    channels: channelsOut,
    bpm,
    chip: ast.chip,
    volume: ast.volume,
    play: ast.play,
    metadata: ast.metadata
  } as unknown as SongModel;
}

export default { resolveSong };
