import { warn as diagWarn } from '../util/diag.js';
import { expandAllSequences } from '../sequences/expand.js';
import { applyInstrumentToEvent } from '../instruments/instrumentState.js';
import { materializeSequenceItems, patternEventsToTokens, } from '../parser/structured.js';
import { expandRefToTokens } from '../expand/refExpander.js';
import { resolveImports, resolveImportsSync } from './importResolver.js';
import { isRemoteImport } from '../import/urlUtils.js';
import { createLogger } from '../util/logger.js';
const log = createLogger('resolver');
// Helpers for parsing inline effects and pan specifications
function parsePanSpec(val, ns) {
    if (val === undefined || val === null)
        return undefined;
    const s = String(val).trim();
    const up = s.toUpperCase();
    if (up === 'L' || up === 'R' || up === 'C') {
        return { enum: up, sourceNamespace: ns };
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
export function isPanEmpty(pan) {
    if (pan === undefined || pan === null)
        return true;
    if (typeof pan === 'object') {
        const hasEnum = Object.prototype.hasOwnProperty.call(pan, 'enum');
        const hasValue = Object.prototype.hasOwnProperty.call(pan, 'value');
        return !(hasEnum || hasValue);
    }
    // strings or numbers are considered non-empty pan specifications
    return false;
}
export function parseEffectParams(paramsStr) {
    if (!paramsStr || !paramsStr.length)
        return [];
    return paramsStr
        .split(',')
        .map(s => s.trim())
        .filter(s => s !== '')
        .map(s => (isNaN(Number(s)) ? s : Number(s)));
}
export function parseEffectsInline(str) {
    // Keep empty parts so positional empty parameters are preserved (e.g. "vib:3,6,,8")
    const rawParts = str.split(',').map(s => s.trim());
    const effects = [];
    let pan = undefined;
    // Group parts so that effect parameters following a `type:...` are attached
    // to that effect until the next part that contains a colon (start of next effect).
    let currentEffect = null;
    for (const p of rawParts) {
        // Detect namespaced pan tokens first: gb:pan:L, pan:L, pan=-0.5
        const panMatch = p.match(/^(?:(gb):)?pan[:=](-?\d*\.?\d+|L|R|C)$/i);
        if (panMatch) {
            const [, ns, val] = panMatch;
            const up = String(val).toUpperCase();
            if (up === 'L' || up === 'R' || up === 'C') {
                pan = { enum: up, sourceNamespace: ns || undefined };
            }
            else {
                const num = Number(val);
                if (!Number.isNaN(num))
                    pan = { value: Math.max(-1, Math.min(1, num)), sourceNamespace: ns || undefined };
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
        }
        else if (currentEffect) {
            // This part is an additional parameter for the current effect
            currentEffect.paramsStr = (currentEffect.paramsStr ? (currentEffect.paramsStr + ',' + p) : p);
        }
        else {
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
export function resolveSong(ast, opts) {
    // Check for remote imports
    if (ast.imports && ast.imports.some(imp => isRemoteImport(imp.source))) {
        throw new Error('Remote imports (http://, https://, github:) are not supported in synchronous mode. ' +
            'Use resolveSongAsync() instead.');
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
export async function resolveSongAsync(ast, opts) {
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
 * For a named sequence, build a per-token array of source pattern base names.
 * seqItems: the raw item strings for the sequence (e.g. ["mel_a", "mel_b:slow"])
 * totalTokens: actual count of expanded tokens produced for this item invocation
 * pats: raw pattern token arrays (used to get token counts per pattern)
 */
function getLeafPats(seqItem, seqs, pats, visited = new Set()) {
    let realItem = seqItem.trim();
    let repeat = 1;
    const mRep = realItem.match(/^(.+?)\s*\*\s*(\d+)$/);
    if (mRep) {
        realItem = mRep[1].trim();
        repeat = parseInt(mRep[2], 10);
    }
    const parts = realItem.split(':');
    const base = parts[0].trim();
    const mods = parts.slice(1);
    let mult = 1;
    for (const mod of mods) {
        const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
        if (mSlow) {
            mult *= mSlow[1] ? parseInt(mSlow[1], 10) : 2;
            continue;
        }
        const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
        if (mFast) {
            mult /= (mFast[1] ? parseInt(mFast[1], 10) : 2);
            continue;
        }
    }
    let children = [];
    if (visited.has(base)) {
        return [];
    }
    if (pats[base]) {
        children = [{ patBase: base, count: pats[base].length }];
    }
    else if (seqs[base]) {
        visited.add(base);
        const rawSeqDef = seqs[base];
        const innerItems = !rawSeqDef
            ? []
            : Array.isArray(rawSeqDef) && rawSeqDef.length > 0 && typeof rawSeqDef[0] !== 'string'
                ? materializeSequenceItems(rawSeqDef)
                : rawSeqDef;
        for (const inner of innerItems) {
            if (!inner || inner.trim() === '')
                continue;
            children.push(...getLeafPats(inner, seqs, pats, visited));
        }
        visited.delete(base);
    }
    else {
        children = [{ patBase: base, count: 1 }]; // fallback
    }
    const out = [];
    for (let r = 0; r < repeat; r++) {
        for (const c of children) {
            out.push({ patBase: c.patBase, count: Math.max(1, Math.round(c.count * mult)) });
        }
    }
    return out;
}
function buildTokenPatternMeta(seqItems, totalTokens, pats, seqs) {
    if (seqItems.length === 0 || totalTokens === 0)
        return [];
    const leaves = [];
    for (const item of seqItems) {
        leaves.push(...getLeafPats(item, seqs, pats));
    }
    let rawTotal = 0;
    for (const leaf of leaves)
        rawTotal += leaf.count;
    if (rawTotal === 0)
        return Array(totalTokens).fill('');
    const result = [];
    for (let i = 0; i < leaves.length; i++) {
        const isLast = i === leaves.length - 1;
        const scaledCount = isLast
            ? (totalTokens - result.length)
            : Math.round((leaves[i].count / rawTotal) * totalTokens);
        for (let j = 0; j < scaledCount; j++)
            result.push(leaves[i].patBase);
    }
    // Safety: trim/pad to totalTokens
    while (result.length < totalTokens)
        result.push(result[result.length - 1] || '');
    return result.slice(0, totalTokens);
}
/**
 * Internal implementation shared by resolveSong and resolveSongAsync.
 * Assumes imports have already been resolved.
 */
function resolveSongInternal(ast, opts) {
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
    let seqs = { ...(ast.seqs || {}) };
    let bpm = ast.bpm;
    if (ast.patternEvents) {
        const materialized = {};
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
    const expandedSeqs = expandAllSequences(seqs, pats, insts, ast.effects);
    log.debug('Sequences expanded', { count: Object.keys(expandedSeqs).length });
    // Helper: expand inline effect presets found inside `<...>` by looking up
    // named presets from `ast.effects`. If an inline effect is a bare name
    // that matches a preset and has no explicit params, replace it with the
    // preset's parsed effects (but do not override other explicit inline
    // effects of the same type — explicit inline params take precedence).
    const expandInlinePresets = (effectsArr) => {
        if (!effectsArr || !ast.effects)
            return effectsArr || [];
        const presets = ast.effects;
        // Collect types that were explicitly provided with params in the inline list
        const explicitTypes = new Set();
        for (const e of effectsArr) {
            if (e.params && e.params.length > 0)
                explicitTypes.add(e.type);
        }
        const out = [];
        for (const e of effectsArr) {
            // If this effect name matches a preset and has no params, expand it
            if (presets[e.type] && (!e.params || e.params.length === 0)) {
                const presetParsed = parseEffectsInline(presets[e.type]);
                for (const pe of presetParsed.effects) {
                    if (!explicitTypes.has(pe.type))
                        out.push(pe);
                }
            }
            else {
                out.push(e);
            }
        }
        return out;
    };
    // Helper: normalize effect durations (especially vibrato/tremolo rows-to-seconds conversion)
    const normalizeEffectDurations = (effects, bpm, ticksPerStep = 16) => {
        if (!effects || !effects.length)
            return effects;
        return effects.map(effect => {
            // Both vibrato and tremolo support durationRows as params[3] and delayRows as params[4]
            if (effect.type === 'vib' || effect.type === 'trem') {
                if (effect.params && effect.params.length >= 4) {
                    try {
                        const stepsPerRow = ticksPerStep / 4; // assuming 4/4 time
                        const beatsPerSecond = bpm / 60;
                        const durationRows = Number(effect.params[3]);
                        const hasDuration = !Number.isNaN(durationRows) && durationRows > 0;
                        const durationSec = hasDuration ? (durationRows / stepsPerRow) / beatsPerSecond : undefined;
                        // Preserve params[4] (delay rows) so UGE writer can read raw rows;
                        // also convert to delaySec for the WebAudio engine (injected via tryApplyEffects).
                        const newParams = [...effect.params.slice(0, 3), effect.params[3]];
                        let delaySec;
                        if (effect.params.length > 4) {
                            newParams.push(effect.params[4]);
                            const delayRows = Number(effect.params[4]);
                            if (!Number.isNaN(delayRows) && delayRows > 0) {
                                delaySec = (delayRows / stepsPerRow) / beatsPerSecond;
                            }
                        }
                        if (hasDuration || delaySec !== undefined) {
                            return {
                                ...effect,
                                params: newParams,
                                ...(durationSec !== undefined ? { durationSec } : {}),
                                ...(delaySec !== undefined ? { delaySec } : {}),
                            };
                        }
                    }
                    catch (e) {
                        // If conversion fails, keep original params
                    }
                }
            }
            return effect;
        });
    };
    // Helper to consistently emit resolver warnings via opts.onWarn if it's a
    // function, otherwise fall back to the diagnostic helper.
    const emitResolverWarn = (message, loc) => {
        const meta = { file: opts && opts.filename ? opts.filename : undefined, loc };
        if (opts && typeof opts.onWarn === 'function') {
            opts.onWarn({ component: 'resolver', message, file: meta.file, loc: meta.loc });
        }
        else {
            diagWarn('resolver', message, meta);
        }
    };
    const channels = [];
    // use shared expander
    // Support `arrange` AST: if present prefer it over channel mappings.
    const channelSources = (() => {
        if (ast.arranges && Object.keys(ast.arranges).length > 0) {
            if (ast.channels && ast.channels.length > 0) {
                emitResolverWarn('Both `arrange` and `channel` mappings present; using `arrange` and ignoring `channel` mappings.', undefined);
            }
            // choose 'main' arrange if present, otherwise first arrange
            const keys = Object.keys(ast.arranges);
            const selected = keys.includes('main') ? 'main' : keys[0];
            const arr = ast.arranges[selected];
            // If the arrange supplies a bpm default, prefer it for this resolved song
            if (arr.defaults && arr.defaults.bpm != null) {
                const nb = Number(arr.defaults.bpm);
                if (!Number.isNaN(nb))
                    bpm = nb;
            }
            const rows = arr.arrangements || [];
            // support per-column instrument defaults encoded as a '|' separated string
            let arrangeInstList = null;
            if (arr.defaults && arr.defaults.inst && typeof arr.defaults.inst === 'string' && arr.defaults.inst.indexOf('|') >= 0) {
                arrangeInstList = String(arr.defaults.inst).split('|').map(s => s.trim());
            }
            const maxSlots = rows.reduce((m, r) => Math.max(m, r.length), 0);
            const channelNodes = [];
            for (let i = 0; i < maxSlots; i++) {
                const concatenated = [];
                for (const row of rows) {
                    const slot = row[i];
                    if (!slot)
                        continue;
                    // do not insert inline `inst(...)` tokens here; per-column defaults are applied
                    // via the synthesized channel's `inst` property (handled below)
                    // expand the referenced sequence into tokens (if available), supporting transforms
                    const toks = expandRefToTokens(slot, expandedSeqs, pats, ast.effects);
                    const base = String(slot).split(':')[0];
                    // If expansion produced a single raw token equal to the slot and the base
                    // name doesn't exist as a sequence or pattern, emit a warning.
                    if (toks.length === 1 && toks[0] === slot && !expandedSeqs[base] && !pats[base]) {
                        emitResolverWarn(`arrange: sequence '${slot}' not found while expanding arrange '${selected}'.`, arr.loc);
                        continue;
                    }
                    concatenated.push(slot); // Push the unresolved item reference string
                }
                const instForCol = arrangeInstList ? (arrangeInstList[i] || undefined) : (arr.defaults && arr.defaults.inst ? arr.defaults.inst : undefined);
                const speedForCol = arr.defaults && arr.defaults.speed ? arr.defaults.speed : undefined;
                channelNodes.push({ id: i + 1, pat: 'arrange-synth', seqSpecTokens: concatenated, inst: instForCol, speed: speedForCol });
            }
            return channelNodes;
        }
        return ast.channels || [];
    })();
    for (const ch of channelSources) {
        log.debug(`Processing channel ${ch.id}, ch.pat type: ${typeof ch.pat}, value:`, ch.pat);
        const chModel = { id: ch.id, speed: ch.speed, events: [], defaultInstrument: ch.inst };
        // Per-token source metadata — built during the items expansion loop below.
        // tokenSeqNames[i] = name of the named sequence this token came from (or '' for direct pat refs)
        // tokenPatNames[i] = name of the source pattern (within seq, or the direct pat name)
        const tokenSeqNames = [];
        const tokenPatNames = [];
        if (typeof ch.pat !== 'string') {
            log.debug(`Channel ${ch.id}: ch.pat is not a string (type: ${typeof ch.pat})`);
        }
        // Determine source tokens: channel may reference a pattern name, sequence name, or already have token array
        let tokens = [];
        if (Array.isArray(ch.pat)) {
            tokens = ch.pat.slice();
        }
        else if (typeof ch.pat === 'string') {
            const ref = ch.pat;
            // A channel `seq` spec may contain multiple sequence names separated by
            // commas and repetition syntax like `name * 2`. We support two forms:
            //  - comma-separated: "lead,lead2"
            //  - repetition: "lead * 2" or "lead*2"
            let items;
            if (ch.seqSpecTokens) {
                const raw = ch.seqSpecTokens;
                const joined = raw.join(' ');
                // split on commas first, then split whitespace-only groups into multiple items
                items = [];
                for (const group of joined.split(',')) {
                    const g = group.trim();
                    if (!g)
                        continue;
                    if (g.indexOf('*') >= 0) {
                        // keep repetition syntax intact (e.g. "lead * 2" or "lead*2")
                        items.push(g);
                    }
                    else {
                        // split whitespace-separated names (e.g. "lead lead2")
                        const parts = g.split(/\s+/).map(s => s.trim()).filter(Boolean);
                        items.push(...parts);
                    }
                }
            }
            else {
                items = ref.indexOf(',') >= 0 ? ref.split(',').map((s) => s.trim()).filter(Boolean) : [ref.trim()];
            }
            const outTokens = [];
            for (const item of items) {
                // check repetition like "name * 2" or "name*2"
                const mRep = item.match(/^(.+?)\s*\*\s*(\d+)$/);
                const repeat = mRep ? parseInt(mRep[2], 10) : 1;
                const itemRef = mRep ? mRep[1].trim() : item;
                for (let r = 0; r < repeat; r++) {
                    const toks = expandRefToTokens(itemRef, expandedSeqs, pats, ast.effects, ch.loc);
                    outTokens.push(...toks);
                    // Build per-token source metadata for this batch of tokens
                    const itemBase = itemRef.split(':')[0].trim();
                    if (expandedSeqs[itemBase]) {
                        // Named sequence — tag with seq name and infer per-token pattern names
                        const rawSeqDef = seqs[itemBase];
                        const seqItemStrings = !rawSeqDef
                            ? []
                            : Array.isArray(rawSeqDef) && rawSeqDef.length > 0 && typeof rawSeqDef[0] !== 'string'
                                ? materializeSequenceItems(rawSeqDef)
                                : rawSeqDef;
                        const patMeta = buildTokenPatternMeta(seqItemStrings, toks.length, pats, seqs);
                        for (let mi = 0; mi < toks.length; mi++) {
                            tokenSeqNames.push(itemBase);
                            tokenPatNames.push(patMeta[mi] || '');
                        }
                    }
                    else if (pats[itemBase]) {
                        // Direct pattern reference
                        for (let mi = 0; mi < toks.length; mi++) {
                            tokenSeqNames.push('');
                            tokenPatNames.push(itemBase);
                        }
                    }
                    else {
                        // Unknown ref — no metadata
                        for (let mi = 0; mi < toks.length; mi++) {
                            tokenSeqNames.push('');
                            tokenPatNames.push('');
                        }
                    }
                }
            }
            tokens = outTokens;
        }
        // Instrument state
        let currentInstName = ch.inst;
        let tempInstName = undefined;
        let tempRemaining = 0;
        // Sequence-level pan override (applies until reset via pan() token)
        let sequencePanOverride = undefined;
        // Helper to calculate bar number from token index.
        // Reads stepsPerBar from the AST so songs that use `time` or `stepsPerBar`
        // directives get correct bar numbers (e.g. 3/4, 6/8, etc.).
        const calculateBarNumber = (tokenIndex) => {
            const stepsPerBar = ast.stepsPerBar ?? ast.time ?? 4;
            return Math.floor(tokenIndex / stepsPerBar);
        };
        // Helper to attach position metadata to events
        const attachMetadata = (event, tokenIndex) => {
            // Attach source metadata to ALL event types so that sustain/rest steps
            // (which make up most events in songs using :N duration syntax) maintain
            // their glyph position during playback.
            const seqName = tokenSeqNames[tokenIndex];
            const patName = tokenPatNames[tokenIndex];
            if (seqName)
                event.sourceSequence = seqName;
            if (patName)
                event.sourcePattern = patName;
            if (event.type === 'note' || event.type === 'named') {
                event.barNumber = calculateBarNumber(tokenIndex);
            }
            return event;
        };
        function resolveInstName(name) {
            if (!name)
                return undefined;
            return name in insts ? name : name; // keep string name; consumer can map to insts
        }
        for (let ti = 0; ti < tokens.length; ti++) {
            const token = tokens[ti];
            if (ti === 0) {
                log.debug(`Channel ${ch.id} token loop START, total tokens: ${tokens.length}, first token:`, token);
            }
            // inst name  (space-separated, from inline-inst AST nodes serialised by patternEventsToTokens)
            const mInstSpace = typeof token === 'string' && token.match(/^inst\s+(\S+)$/i);
            if (mInstSpace) {
                currentInstName = resolveInstName(mInstSpace[1]);
                continue;
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
                        if (!fut)
                            continue;
                        if (typeof fut === 'string' && /^inst\(/i.test(fut))
                            continue;
                        if (typeof fut === 'string' && fut === '.')
                            continue;
                        // any other token is assumed to produce an event
                        hasFutureEvent = true;
                        break;
                    }
                    if (!hasFutureEvent) {
                        // Emit `count` immediate named hits on successive ticks
                        for (let k = 0; k < count; k++) {
                            const ev = { type: 'named', token: name, instrument: name };
                            const evWithProps = applyInstrumentToEvent(insts, ev);
                            if (insts[name]?.note)
                                evWithProps.defaultNote = insts[name].note;
                            chModel.events.push(attachMetadata(evWithProps, ti));
                        }
                        continue;
                    }
                    // Otherwise behave as temporary override
                    tempInstName = resolveInstName(name);
                    tempRemaining = count;
                }
                else {
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
                    if (mNs)
                        sequencePanOverride = parsePanSpec(mNs[2], mNs[1]);
                    else
                        sequencePanOverride = parsePanSpec(specRaw);
                }
                else {
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
                    const ev = { type: 'named', token: name, instrument: name };
                    const evWithProps = applyInstrumentToEvent(insts, ev);
                    if (insts[name]?.note)
                        evWithProps.defaultNote = insts[name].note;
                    chModel.events.push(attachMetadata(evWithProps, ti));
                }
                continue;
            }
            if (token === '.' || token === 'rest' || token === 'R') {
                chModel.events.push(attachMetadata({ type: 'rest' }, ti));
                continue;
            }
            if (token === '_' || token === '-' || token === 'sustain') {
                chModel.events.push(attachMetadata({ type: 'sustain' }, ti));
                continue;
            }
            // named instrument token (e.g. 'snare') — if it matches an inst name
            if (typeof token === 'string' && insts[token]) {
                const inst = insts[token];
                let ev = { type: 'named', token, instrument: token };
                ev = applyInstrumentToEvent(insts, ev);
                // Pass instrument's default note if specified (after applyInstrumentToEvent)
                if (inst.note) {
                    ev.defaultNote = inst.note;
                }
                chModel.events.push(attachMetadata(ev, ti));
                // Named instrument tokens are one-shot hits (like hit(name)) and must NOT
                // update currentInstName. Doing so would cause every note following a percussion
                // hit (e.g. wavekick in a bass pattern) to inherit that instrument instead of
                // the channel default. Use inst(name) for an explicit persistent change.
                // decrement temp only for non-rest
                if (tempRemaining > 0) {
                    tempRemaining -= 1;
                    if (tempRemaining <= 0) {
                        tempInstName = undefined;
                        tempRemaining = 0;
                    }
                }
                continue;
            }
            // assume token is a note like C4 or a note with inline effects: C4<pan:-0.5,vib:4>
            if (typeof token === 'string') {
                // Extract inline effect block if present
                const inlineMatch = token.match(/^([^<]+)<(.+)>$/);
                let baseToken = token;
                let parsedPan = undefined;
                let parsedEffects = [];
                if (inlineMatch) {
                    baseToken = inlineMatch[1];
                    const inner = inlineMatch[2];
                    const parsed = parseEffectsInline(inner);
                    parsedPan = parsed.pan;
                    parsedEffects = expandInlinePresets(parsed.effects || []);
                }
                const useInst = tempInstName || currentInstName;
                let ev = { type: 'note', token: baseToken, instrument: useInst };
                // attach parsed inline pan/effects to event object
                if (parsedPan)
                    ev.pan = parsedPan;
                if (parsedEffects && parsedEffects.length) {
                    ev.effects = normalizeEffectDurations(parsedEffects, bpm || 120, 16);
                    // Set legato=true if note has portamento effect (prevents envelope retrigger)
                    const hasPortamento = ev.effects.some((fx) => fx && (fx.type === 'port' || (typeof fx === 'string' && fx.toLowerCase() === 'port')));
                    if (hasPortamento) {
                        ev.legato = true;
                    }
                }
                ev = applyInstrumentToEvent(insts, ev);
                // Sequence-level pan override (from :pan() modifier on seq items)
                if (isPanEmpty(ev.pan) && sequencePanOverride) {
                    ev.pan = sequencePanOverride;
                }
                // If no inline/sequence pan, but instrument has a pan property, use it as default
                if (isPanEmpty(ev.pan) && ev.instProps) {
                    const ip = ev.instProps;
                    if (ip['gb:pan']) {
                        ev.pan = parsePanSpec(ip['gb:pan'], 'gb');
                    }
                    else if (ip['pan']) {
                        ev.pan = parsePanSpec(ip['pan']);
                    }
                }
                chModel.events.push(attachMetadata(ev, ti));
                if (tempRemaining > 0) {
                    tempRemaining -= 1;
                    if (tempRemaining <= 0) {
                        tempInstName = undefined;
                        tempRemaining = 0;
                    }
                }
                continue;
            }
        }
        channels.push(chModel);
    }
    // Also populate `pat` on each channel with the resolved event list for
    // backward-compatible playback (Player expects `ch.pat` to hold tokens
    // or event objects). This keeps both `events` and `pat` available.
    const channelsOut = channels.map(c => ({ id: c.id, events: c.events, defaultInstrument: c.defaultInstrument, pat: c.events }));
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
    };
}
export default { resolveSong };
//# sourceMappingURL=resolver.js.map