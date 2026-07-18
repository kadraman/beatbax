// BeatBax PEGGY grammar
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
  / ScaleStmt
  / SongMetaStmt
  / ImportStmt
  / InstStmt
  / EffectStmt
  / SubPatStmt
  / PatStmt
  / SeqStmt
  / PatShorthandStmt
  / ChannelStmt
  / PlayStmt
  / ExportStmt
  / ErrorStmt


ErrorStmt
  = raw:$([^\r\n]+) {
      return { nodeType: "ErrorStmt", raw: raw.trim(), loc: loc(location()) };
    }

// -----------------------------
// Top-level directives
// -----------------------------

ChipStmt
  = s:$("chip" !IdentChar) __ name:Identifier region:(__ Identifier)? {
      return {
        nodeType: "ChipStmt",
        chip: name,
        region: region ? region[1] : undefined,
        loc: loc(location())
      };
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

ScaleStmt
  = $("scale" !IdentChar) __ root:$([A-Ga-g] [#b]?) __ mode:Identifier enforcement:(__ ScaleEnforcement)? {
      return {
        nodeType: "ScaleStmt",
        root,
        mode,
        enforcement: enforcement ? enforcement[1] : undefined,
        loc: loc(location())
      };
    }

SongMetaStmt
  = $("song" !IdentChar) __ key:Identifier __ value:MetaString {
      return { nodeType: "SongMetaStmt", key, value, loc: loc(location()) };
    }

ImportStmt
  = $("import" !IdentChar) __ path:MetaString {
      return { nodeType: "ImportStmt", source: path, loc: loc(location()) };
    }

PlayStmt
  = "play" !IdentChar ws:_? rest:RestOfLine? {
      const args = rest ? rest.trim() : "";
      return { nodeType: "PlayStmt", args: args, loc: loc(location()) };
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

// Instrument subpattern (hUGE-style tick rows). Rows may be space/comma
// separated on one line, or placed on following lines.
SubPatStmt
  = $("subpat" !IdentChar) __ name:Identifier _ "=" WS0 (Comment? Newline _)* rows:SubPatRowList {
      return { nodeType: "SubPatStmt", name, rows, loc: loc(location()) };
    }

SubPatRowList
  = head:SubPatRow tail:(SubPatRowSep SubPatRow)* {
      return [head, ...tail.map(t => t[1])];
    }

SubPatRowSep
  = WS0 "," WS0
  / (Comment? Newline _)+
  / WS1 _

SubPatRow
  = "halt" !IdentChar {
      return { empty: false, halt: true };
    }
  / "." {
      return { empty: true };
    }
  / offset:SignedOffset props:SubPatProp* {
      const row = { empty: false, offset };
      for (const p of props) Object.assign(row, p);
      return row;
    }
  / props:SubPatProp+ {
      const row = { empty: false, offset: null };
      for (const p of props) Object.assign(row, p);
      return row;
    }

SignedOffset
  = s:$([+\-][0-9]+) { return parseInt(s, 10); }
  / n:Int { return n; }

SubPatProp
  = WS0 "vol:" n:Int { return { vol: n }; }
  / WS0 "jump:" n:Int { return { jump: n }; }
  / WS0 "timbre:" n:Int { return { timbre: n }; }
  / WS0 "halt" !IdentChar { return { halt: true }; }
  / WS0 "fx:" code:FxNum "," param:FxNum { return { fx: { code, param } }; }

FxNum
  = s:$([0-9A-Fa-f]+) {
      // Prefer hex when letters present or length > 1 with leading style like 0F
      if (/[A-Fa-f]/.test(s)) return parseInt(s, 16);
      return parseInt(s, 10);
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
  = id:Identifier "(" body:BalancedArgContent ")" { return id + '(' + body + ')'; }

// Captures argument content allowing one level of nested parentheses,
// so modifiers like every(2,oct(+1)) parse correctly. Deeper nesting
// (e.g. every(2,foo(a(b)))) is not supported — inner groups may not
// contain '(' and unmatched ')' ends the modifier argument list.
BalancedArgContent
  = $(BalancedArgPart*)

BalancedArgPart
  = InnerBalancedParen
  / BalancedArgChar

BalancedArgChar
  = !("(" / ")" / Newline) .

InnerBalancedParen
  = "(" InnerBalancedParenBody* ")"

InnerBalancedParenBody
  = !("(" / ")" / Newline) .

// -----------------------------
// Lexical helpers
// -----------------------------

RestOfLine
  = s:$(RestOfLinePart*) { return s.trim(); }

// A single unit within a rest-of-line: either a quoted string (treated as
// opaque so '//' inside quotes is never mistaken for a comment) or any
// character that is not a newline or the start of an unquoted comment.
RestOfLinePart
  = '"' DoubleChar* '"'
  / "'" SingleChar* "'"
  / !(Newline / Comment) .

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
  / $("scale" !IdentChar)
  / $("time" !IdentChar)
  / $("stepsPerBar" !IdentChar)
  / $("ticksPerStep" !IdentChar)
  / $("song" !IdentChar)
  / $("inst" !IdentChar)
  / $("subpat" !IdentChar)
  / $("pat" !IdentChar)
  / $("seq" !IdentChar)
  / $("channel" !IdentChar)
  / $("effect" !IdentChar)
  / $("play" !IdentChar)
  / $("export" !IdentChar)

ScaleEnforcement
  = $("warn" !IdentChar)
  / $("error" !IdentChar)
  / $("off" !IdentChar)

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
