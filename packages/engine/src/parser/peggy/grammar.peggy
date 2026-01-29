// BeatBax PEGGY grammar (phase 2)
// Parses pattern/sequence RHS into structured token arrays.

{
  function loc(location) {
    return {
      start: { offset: location.start.offset, line: location.start.line, column: location.start.column },
      end:   { offset: location.end.offset,   line: location.end.line,   column: location.end.column }
    };
  }

  function repeat(items, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(...items.map(cloneEvent));
    return out;
  }

  function cloneEvent(ev) {
    if (!ev || typeof ev !== 'object') return ev;
    const c = { ...ev };
    if (ev.loc) {
      c.loc = {
        start: { ...ev.loc.start },
        end: { ...ev.loc.end },
      };
    }
    return c;
  }

  function withDuration(evts, dur) {
    if (!evts || evts.length === 0) return evts;
    const d = Math.max(1, dur || 1);
    const copy = evts.map(cloneEvent);
    copy[0] = { ...copy[0], duration: d };
    return copy;
  }
}

Program
  = BlankLines stmts:StatementList? BlankLines WS0 {
      return { nodeType: "Program", body: stmts ?? [] };
    }

StatementList
  = head:IndentedStatement tail:(BlankLines IndentedStatement)* {
      const out = [head];
      for (const t of tail) out.push(t[1]);
      return out;
    }

IndentedStatement
  = _ stmt:Statement { return stmt; }

Statement
  = ChipStmt
  / BpmStmt
  / VolumeStmt
  / TimeStmt
  / StepsPerBarStmt
  / TicksPerStepStmt
  / SongMetaStmt
  / InstStmt
  / EffectStmt
  / PatStmt
  / SeqStmt
  / ArrangeStmt
  / PatShorthandStmt
  / ChannelStmt
  / PlayStmt
  / ExportStmt

// -----------------------------
// Top-level directives
// -----------------------------

ChipStmt
  = s:$("chip" !IdentChar) __ name:Identifier {
      return { nodeType: "ChipStmt", chip: name, loc: loc(location()) };
    }

BpmStmt
  = $("bpm" !IdentChar) __ value:Int {
      return { nodeType: "BpmStmt", bpm: value, loc: loc(location()) };
    }

VolumeStmt
  = $("volume" !IdentChar) __ value:Float {
      return { nodeType: "VolumeStmt", volume: value, loc: loc(location()) };
    }

TimeStmt
  = $("time" !IdentChar) __ value:Int {
      return { nodeType: "TimeStmt", time: value, loc: loc(location()) };
    }

StepsPerBarStmt
  = $("stepsPerBar" !IdentChar) __ value:Int {
      return { nodeType: "StepsPerBarStmt", stepsPerBar: value, loc: loc(location()) };
    }

TicksPerStepStmt
  = $("ticksPerStep" !IdentChar) __ value:Int {
      return { nodeType: "TicksPerStepStmt", ticksPerStep: value, loc: loc(location()) };
    }

SongMetaStmt
  = $("song" !IdentChar) __ key:Identifier __ value:MetaString {
      return { nodeType: "SongMetaStmt", key, value, loc: loc(location()) };
    }

PlayStmt
  = $("play" !IdentChar) args:(_ RestOfLine)? {
      return { nodeType: "PlayStmt", args: args ? args[1] : "", loc: loc(location()) };
    }

ExportStmt
  = $("export" !IdentChar) __ fmt:Identifier __ path:MetaString {
      return { nodeType: "ExportStmt", format: fmt, path, loc: loc(location()) };
    }

// -----------------------------
// Definitions
// -----------------------------

InstStmt
  = $("inst" !IdentChar) __ name:Identifier __ rhs:RestOfLine {
      return { nodeType: "InstStmt", name, rhs, loc: loc(location()) };
    }

EffectStmt
  = $("effect" !IdentChar) __ name:Identifier _ "=" _ rhs:RestOfLine {
      return { nodeType: "EffectStmt", name, rhs, loc: loc(location()) };
    }

PatStmt
  = $("pat" !IdentChar) __ name:PatName _ "=" _ rhs:PatternRhs {
      return { nodeType: "PatStmt", name, rhsEvents: rhs, loc: loc(location()) };
    }

PatShorthandStmt
  = !ReservedWord name:Identifier _ "=" _ rhs:PatternRhs {
      return { nodeType: "PatStmt", name, rhsEvents: rhs, loc: loc(location()) };
    }

SeqStmt
  = $("seq" !IdentChar) __ name:Identifier _ "=" _ rhs:SeqRhs {
      return { nodeType: "SeqStmt", name, rhsItems: rhs, loc: loc(location()) };
    }

ArrangeStmt
  = $("arrange" !IdentChar) __ name:Identifier _ defaults:ArrangeDefaults? _ "=" _ rhs:ArrangeShortRhs {
      return { nodeType: "ArrangeStmt", name, arrangements: rhs, defaults: defaults ?? null, loc: loc(location()) };
    }
  / $("arrange" !IdentChar) __ name:Identifier _ defaults:ArrangeDefaults? _ ("=" WS0)? "{" WS0 inner:$( (!"}" .)* ) WS0 "}" {
      const raw = (inner || '').trim();
      const lines = raw
        .split(/[\r\n]+|,/) // split on newlines or commas
        .map(s => s.trim())
        .filter(Boolean);
      const rows = lines.map(l => {
        return l.split('|').map(s => {
          // Strip inline comments (# or //) from each slot
          let slotText = s;
          const commentIdx = Math.min(
            slotText.indexOf('#') >= 0 ? slotText.indexOf('#') : Infinity,
            slotText.indexOf('//') >= 0 ? slotText.indexOf('//') : Infinity
          );
          if (commentIdx < Infinity) {
            slotText = slotText.substring(0, commentIdx);
          }
          const t = slotText.trim();
          if (t === '.' || t === '-') return null;
          if ((t.startsWith('"') || t.startsWith("'")) && t.length >= 2) return t.slice(1, -1);
          return t;
        });
      });
      return { nodeType: "ArrangeStmt", name, arrangements: rows, defaults: defaults ?? null, loc: loc(location()) };
    }

ArrangeDefaults
  = "defaults" WS0 "(" WS0 body:$( (!")" .)* ) WS0 ")" { return body.trim(); }

ArrangeShortRhs
  = head:ArrangeSlot tail:(WS0 "|" WS0 ArrangeSlot)* {
      const row = [head];
      for (const t of tail) row.push(t[3]);
      return [row];
    }

// ArrangeRows/ArrangeRow handled via inner capture and JS post-processing above

ArrangeSlot
  = "." { return null; }
  / "-" { return null; }
  / s:QuotedString { return s; }
  / id:Identifier { return id; }

ChannelStmt
  = $("channel" !IdentChar) __ ch:Int __ "=>" __ rhs:RestOfLine {
      return { nodeType: "ChannelStmt", channel: ch, rhs, loc: loc(location()) };
    }

// -----------------------------
// Lexical rules
// -----------------------------

MetaString
  = TripleString / QuotedString

TripleString
  = '"""' chars:TripleChar* '"""' {
      return chars.join("");
    }

TripleChar
  = !'"""' c:. { return c; }

QuotedString
  = '"' chars:DoubleChar* '"' { return chars.join(""); }
  / "'" chars:SingleChar* "'" { return chars.join(""); }

DoubleChar
  = '\\' c:. { return c; }
  / !'"' c:. { return c; }

SingleChar
  = '\\' c:. { return c; }
  / !"'" c:. { return c; }

// -----------------------------
// Pattern RHS
// -----------------------------

PatternRhs
  = head:PatternItem tail:(PatternSep PatternItem)* {
      const out = [...head];
      for (const t of tail) out.push(...t[1]);
      return out;
    }

PatternSep
  = (WS1 / Comment)+ WS0

PatternItem
  = GroupRepeat
  / TokenRepeat

GroupRepeat
  = "(" WS0 inner:PatternRhs WS0 ")" rep:RepeatSuffix? {
      const base = inner;
      if (!rep) return base;
      return repeat(base, rep);
    }

TokenRepeat
  = tok:PatternToken rep:RepeatSuffix? {
      const base = tok;
      if (!rep) return base;
      return repeat(base, rep);
    }

RepeatSuffix
  = WS0 "*" WS0 n:Int { return n; }

PatternToken
  = base:PatternAtom dur:DurationSuffix? {
      const tok = Array.isArray(base) ? base.slice() : [base];
      if (dur && tok.length > 0) {
        return withDuration(tok, dur);
      }
      return tok;
    }

DurationSuffix
  = (":" / "/") WS0 n:Int { return n; }

PatternAtom
  = NoteWithEffects
  / IdentWithEffects
  / NoteToken
  / RestToken
  / TempInstToken
  / InlineInstToken
  / IdentWithCall
  / QuotedPatternTokens
  / Identifier { return { kind: 'token', value: text(), raw: text(), loc: loc(location()) }; }

NoteWithEffects
  = note:NoteToken effs:EffectSuffix+ { return { kind: 'note', value: note.value, effects: effs, raw: note.raw + effs.map(e => `<${e}>`).join(''), loc: loc(location()) }; }

IdentWithEffects
  = id:Identifier effs:EffectSuffix+ { return { kind: 'token', value: id + effs.map(e => `<${e}>`).join(''), raw: id + effs.map(e => `<${e}>`).join(''), loc: loc(location()) }; }

EffectSuffix
  = "<" body:$( (!">" .)* ) ">" { return body; }

NoteToken
  = val:$([A-Ga-g] [#b]? "-"? [0-9]+) { return { kind: 'note', value: val, raw: val, loc: loc(location()) }; }

RestToken
  = "." { return { kind: 'rest', value: '.', raw: '.', loc: loc(location()) }; }
  / "_" { return { kind: 'rest', value: '_', raw: '_', loc: loc(location()) }; }
  / "-" { return { kind: 'rest', value: '-', raw: '-', loc: loc(location()) }; }

TempInstToken
  = "inst(" WS0 name:Identifier WS0 "," WS0 dur:Int WS0 ")" {
      return { kind: 'temp-inst', name, duration: dur, raw: `inst(${name},${dur})`, loc: loc(location()) };
    }
  / "inst(" WS0 name:Identifier WS0 ")" {
      return { kind: 'temp-inst', name, raw: `inst(${name})`, loc: loc(location()) };
    }

InlineInstToken
  = "inst" WS1 name:Identifier {
      return { kind: 'inline-inst', name, raw: `inst ${name}`, loc: loc(location()) };
    }

IdentWithCall
  = id:Identifier "(" body:$( (!")" .)* )")" { return { kind: 'token', value: `${id}(${body})`, raw: `${id}(${body})`, loc: loc(location()) }; }

QuotedPatternTokens
  = s:QuotedString {
      return s
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(t => ({ kind: 'token', value: t, raw: t }));
    }

// -----------------------------
// Sequence RHS
// -----------------------------

SeqRhs
  = head:SeqItem tail:(SeqSep SeqItem)* {
      const out = [...head];
      for (const t of tail) out.push(...t[1]);
      return out;
    }

SeqSep
  = ("," WS0) / (WS1) / (Comment WS0)

SeqItem
  = SeqGroupRepeat
  / SeqTokenRepeat

SeqGroupRepeat
  = "(" WS0 inner:SeqRhs WS0 ")" rep:RepeatSuffix? {
      const base = inner;
      if (!rep) return base;
      return repeat(base, rep);
    }

SeqTokenRepeat
  = tok:SeqToken rep:RepeatSuffix? {
      const base = tok;
      if (!rep) return base;
      return repeat(base, rep);
    }

SeqToken
  = base:Identifier mods:SeqModifier* {
      return [{ name: base, modifiers: mods, raw: base + (mods.length ? mods.map(m => ':' + m.raw).join('') : ''), loc: loc(location()) }];
    }

SeqModifier
  = ":" body:SeqModBody {
      return { raw: body, loc: loc(location()) };
    }

SeqModBody
  = $(IdentifierWithArgs / Identifier)

IdentifierWithArgs
  = id:Identifier "(" body:$( (!")" .)* )")" { return id + '(' + body + ')'; }

// -----------------------------
// Lexical helpers
// -----------------------------

RestOfLine
  = s:$( (!(Newline / Comment) .)* ) { return s.trim(); }

Identifier
  = $([A-Za-z_][A-Za-z0-9_\-]*)

PatName
  = base:Identifier mods:PatNameMod* {
      return base + mods.join('');
    }

PatNameMod
  = ":" mod:$(PatMod+) { return ':' + mod; }

PatMod
  = !(WS1 / '=' / Newline) c:. { return c; }

IdentChar
  = [A-Za-z0-9_\-]

ReservedWord
  = $("chip" !IdentChar)
  / $("bpm" !IdentChar)
  / $("time" !IdentChar)
  / $("stepsPerBar" !IdentChar)
  / $("ticksPerStep" !IdentChar)
  / $("song" !IdentChar)
  / $("inst" !IdentChar)
  / $("pat" !IdentChar)
  / $("seq" !IdentChar)
  / $("channel" !IdentChar)
  / $("effect" !IdentChar)
  / $("play" !IdentChar)
  / $("export" !IdentChar)

Int
  = digits:$([0-9]+) { return parseInt(digits, 10); }

Float
  = digits:$(([0-9]+ "." [0-9]*) / ("." [0-9]+) / [0-9]+) { return parseFloat(digits); }

Newline
  = "\r\n" / "\n" / "\r"

BlankLines
  = (_? Newline)*

WS0 = [ \t]*
WS1 = [ \t]+

_  = (WS1 / Comment)* WS0
__ = (WS1 / Comment)+ WS0

Comment
  = "#" (!Newline .)*
  / "//" (!Newline .)*
