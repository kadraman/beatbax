import type { Diagnostic } from '@beatbax/app-core/editor/diagnostics';
import type { AISettings, ChatMode } from '@beatbax/app-core/stores/chat.store';

const MAX_EDITOR_CHARS = 3000;

/** Built-in inline effect types (parametric forms like `<vib:3,5>` need no preset). */
const BUILTIN_INLINE_EFFECTS = [
  'pan', 'vib', 'port', 'arp', 'pitch_env', 'volslide', 'trem',
  'cut', 'retrig', 'bend', 'sweep', 'echo',
  'vol_env', 'arp_env', 'noise_rate_env',
] as const;

const EDIT_EXAMPLE_LINES = [
  'effect leadVib = vib:3,5',
  'pat melody_var = (C5 D5 E5 G5) (A5 G5 E5 D5)',
  'pat bass_var = (C2 E2 G2 C3) * 2 (F2 A2 C3 F3) * 2 (G2 B2 D3 G3) * 2',
  'pat melody_var_vib = C5<vib:3,5>:4 E5:4 D5<vib:3,5>:4 G5:4 A5<vib:3,5>:4 G5:4 E5:4 D5:4',
  'seq lead_seq = melody_pat melody_var melody_var_vib melody_pat',
  'seq bass_seq = bass_pat bass_var bass_pat bass_var',
  'channel 1 => inst leadA seq lead_seq lead_seq',
  'channel 2 => inst leadB seq bass_seq:oct(-1) bass_seq:oct(-1)',
  'play auto repeat',
] as const;

/** Extracts top-level instrument and effect names defined in the song source. */
function extractDefinedNames(content: string): { instruments: string[]; effects: string[] } {
  const instruments = new Set<string>();
  const effects = new Set<string>();
  const instRe = /^\s*inst\s+([A-Za-z_]\w*)\b/gm;
  const effectRe = /^\s*effect\s+([A-Za-z_]\w*)\s*=/gm;
  let m: RegExpExecArray | null;
  while ((m = instRe.exec(content)) !== null) instruments.add(m[1]);
  while ((m = effectRe.exec(content)) !== null) effects.add(m[1]);
  return { instruments: [...instruments], effects: [...effects] };
}

/** Collects effect heads referenced in `<name>` / `<name:args>` suffixes. */
function extractReferencedEffectNames(content: string): string[] {
  const names = new Set<string>();
  const re = /<([^>]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const head = (m[1].split(':')[0] || '').trim();
    if (head) names.add(head);
  }
  return [...names];
}

function findUndefinedEffectRefs(content: string, definedEffects: string[]): string[] {
  const defined = new Set(definedEffects.map((n) => n.toLowerCase()));
  const builtin = new Set(BUILTIN_INLINE_EFFECTS.map((n) => n.toLowerCase()));
  return extractReferencedEffectNames(content).filter((name) => {
    const lower = name.toLowerCase();
    return !defined.has(lower) && !builtin.has(lower);
  });
}

function clipLine(line: string, max = 88): string {
  const trimmed = line.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * Compact outline of the open song for Ask-mode explanations — names and roles,
 * not full pattern bodies (those live in [EDITOR CONTENT]).
 */
export function buildSongStructureSummary(content: string): string {
  const lines: string[] = [];
  const patternNames: string[] = [];
  const sequenceLines: string[] = [];
  const channelLines: string[] = [];
  let chip = '';
  let bpm = '';
  let play = '';

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    let m: RegExpMatchArray | null;
    if (!chip && (m = line.match(/^chip\s+(\S+)/))) chip = m[1];
    else if (!bpm && (m = line.match(/^bpm\s+(\S+)/))) bpm = m[1];
    else if ((m = line.match(/^pat\s+([A-Za-z_]\w*)\s*=/))) patternNames.push(m[1]);
    else if ((m = line.match(/^seq\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) {
      sequenceLines.push(`${m[1]} → ${clipLine(m[2], 72)}`);
    } else if ((m = line.match(/^channel\s+(\d+)\s*=>\s*(.*)$/))) {
      channelLines.push(`channel ${m[1]} → ${clipLine(m[2], 72)}`);
    } else if (/^play\b/.test(line)) play = clipLine(line, 72);
  }

  if (chip) lines.push(`Chip: ${chip}`);
  if (bpm) lines.push(`BPM: ${bpm}`);
  if (patternNames.length > 0) lines.push(`Patterns (${patternNames.length}): ${patternNames.join(', ')}`);
  if (sequenceLines.length > 0) {
    lines.push('Sequences:');
    for (const seq of sequenceLines) lines.push(`  - ${seq}`);
  }
  if (channelLines.length > 0) {
    lines.push('Channels:');
    for (const ch of channelLines) lines.push(`  - ${ch}`);
  }
  if (play) lines.push(`Playback: ${play}`);
  if (lines.length === 0) lines.push('(no top-level definitions detected)');
  return lines.join('\n');
}

function buildSyntaxGuide(mode: ChatMode): string {
  const rules = [
    'BeatBax syntax constraints:',
    '- Define note material with `pat name = tokens` (no separate per-note `length` field line); durations are encoded as `:N` or `/N` suffixes.',
    '- Pattern tokens are whitespace-separated notes/rests/identifiers, e.g. `pat melody = C5:4 D5:4 E5:4 .`.',
    '- If a token has inline effects, put duration AFTER the effects: `NOTE<effect:args>:N` (e.g. `C4<vib:3,5>:4`).',
    '- NEVER use bar separators `|` or commas between pattern tokens — they are invalid. Chain groups with spaces: `pat bass = (C2 E2) * 2 (F2 A2) * 2 (G2 B2) * 2`.',
    '- Use grouping/repeats like `(C5 E5 G5 C6) * 4`.',
    '- Define sequences with `seq name = pat_name other_pat`, not comma-separated note lists.',
    '- Map playback with `channel N => inst instrumentName seq sequenceName` or `channel N => inst instrumentName pat patternName`.',
    '- Effects are top-level presets or inline note suffixes: `effect leadVib = vib:3,5` and `pat p = C5<leadVib> D5<vib:3,5>`.',
    '- A named inline effect like `NOTE<leadVib>` ONLY works if a matching top-level `effect leadVib = ...` definition exists.',
    '- Never reference an instrument or effect name that is not defined in the song (see [DEFINED NAMES]).',
  ];

  if (mode !== 'edit') return rules.join('\n');

  return [
    ...rules,
    '- Bass patterns use low notes (C2–G3 range typical); keep `channel 2` on `inst leadB` with `:oct(-1)` when the song already uses it.',
    '- Use `play`, `play auto`, or existing `play auto repeat`; do not invent `play a, b, c` arrangements.',
    '- If you introduce a new named effect, you MUST add its `effect name = ...` definition line. Otherwise use inline `NOTE<vib:3,5>`.',
    '- Existing transforms such as `:oct(-1)` apply to sequence/channel items, e.g. `seq bass_seq:oct(-1)`.',
    '- For the sample song, make melody variations by adding/modifying `pat ... = ...`, then reference them from `seq lead_seq = ...` while leaving bass/wave/drums channels valid.',
    '',
    'Valid edit example:',
    '```bax',
    ...EDIT_EXAMPLE_LINES,
    '```',
  ].join('\n');
}

function buildAskModeHint(): string {
  return [
    'You are in ASK mode. Explain, analyse, and answer questions — you cannot modify the user\'s song in this mode.',
    'The user already has the full song in the editor. Your job is to explain it in plain language, not to repeat it.',
    'Use [SONG STRUCTURE] as your outline. When explaining how the song works, structure the reply with short sections',
    'such as ## Overview, ## Instruments, ## Patterns, ## Sequences, ## Channels, and ## Playback.',
    'Describe each named item in prose. Cite at most ONE short inline line per bullet (e.g. `pat melody_pat = C5:4 D5:4`).',
    'Do NOT paste multiple definition lines together. Do NOT add sections titled "Example Code" or similar.',
    'Do NOT reproduce the syntax-reference edit example or bulk-quote [EDITOR CONTENT].',
    'Never output more than 3 consecutive lines that look like BeatBax source (pat/seq/channel/inst/effect/play).',
    'If the user asks you to make or apply a change, briefly describe it, show at most a few NEW lines in a short ```bax',
    'block if helpful, then tell them to switch to Edit mode (Ask/Edit toggle above the input).',
    'When suggesting effects, prefer built-in parametric syntax such as `C5<vib:3,5>` or show a short `effect preset = ...`',
    'definition together with `C5<preset>`; never use `<preset>` without its definition.',
    'Format prose with Markdown: short paragraphs, `##` headings, **bold** key terms, `-` bullet lists, and tables when comparing channels.',
  ].join(' ');
}

/** Assembles the system prompt injected before each Copilot request. */
export function buildCopilotContext(
  settings: AISettings,
  mode: ChatMode,
  getEditorContent: () => string,
  getDiagnostics: () => Diagnostic[],
): string {
  const editorContent = getEditorContent();
  const maxChars = settings.maxContextChars || MAX_EDITOR_CHARS;
  // In edit mode the model must rewrite the whole song, so never truncate —
  // a partial song produces unsafe/valid edits. Ask mode keeps the limit.
  const shouldTruncate = mode !== 'edit' && editorContent.length > maxChars;
  const truncated = shouldTruncate
    ? `${editorContent.slice(0, maxChars)}\n...[truncated]`
    : editorContent;
  const diagnostics = getDiagnostics();
  const diagBlock = diagnostics.length > 0
    ? diagnostics.map((diag) => `  ${diag.severity.padEnd(7)} line ${diag.startLine}, col ${diag.startColumn}: ${diag.message}`).join('\n')
    : '  No current errors or warnings.';
  const modeHint = mode === 'edit'
    ? [
        'You are in EDIT mode. Return ONLY the full updated song as a single fenced code block.',
        'Begin your reply with ```bax on its own line and end with ``` on its own line, with nothing before or after it.',
        'Do NOT use Markdown headings, prose, or explanation — output only the song source.',
        'NEVER return only the changed `pat` or `seq` line — always return the entire song from chip through play.',
        'The returned song must parse as valid BeatBax. If diagnostics are present, fix them instead of adding new features.',
        'Invalid syntax (e.g. `|` bar separators in patterns) is rejected before apply; you may be asked to repair parse errors automatically.',
        'If diagnostics warn that an effect is not defined, add `effect name = type:params` before using `<name>`, or replace `<name>` with a built-in parametric form such as `<vib:3,5>`.',
        'Prefer minimal edits to the current song; preserve comments, metadata, instruments, channel structure, and play directives unless the user asks otherwise.',
      ].join(' ')
    : buildAskModeHint();

  const { instruments, effects } = extractDefinedNames(editorContent);
  const undefinedEffects = findUndefinedEffectRefs(editorContent, effects);
  const effectGuidance = [
    `Built-in inline effects (use as NOTE<type:args> with no preset): ${BUILTIN_INLINE_EFFECTS.join(', ')}.`,
    'Common examples: vibrato `C5<vib:3,5>`, arpeggio `C5<arp:0,4,7>`, portamento `C5<port:16>`.',
    'Named presets: define `effect myVib = vib:3,5` once, then use `C5<myVib>` on any note.',
    'A bare `<myVib>` without a matching `effect myVib = ...` line is silently ignored at playback.',
  ].join('\n');
  const definedNames = [
    `Instruments defined in this song: ${instruments.length > 0 ? instruments.join(', ') : '(none)'}`,
    `Effects defined in this song: ${effects.length > 0 ? effects.join(', ') : '(none)'}`,
    undefinedEffects.length > 0
      ? `Undefined effect references in this song (will be ignored): ${undefinedEffects.join(', ')} — add an effect definition or switch to a built-in form.`
      : 'No undefined effect references detected in pattern tokens.',
    'Only reference instrument/effect names listed above. To use a new named effect, add its `effect name = ...` definition first.',
  ].join('\n');

  const sections = [
    '[SYSTEM]',
    'You are BeatBax Copilot, an assistant for the BeatBax live-coding chiptune language.',
    modeHint,
    '',
  ];

  if (mode === 'ask') {
    sections.push(
      '[SONG STRUCTURE]',
      buildSongStructureSummary(editorContent),
      '',
    );
  }

  sections.push(
    '[BEATBAX SYNTAX REFERENCE]',
    buildSyntaxGuide(mode),
    '',
    '[EFFECT GUIDANCE]',
    effectGuidance,
    '',
    '[DEFINED NAMES]',
    definedNames,
    '',
    '[EDITOR CONTENT]',
    '```bax',
    truncated,
    '```',
    '',
    '[DIAGNOSTICS]',
    diagBlock,
  );

  return sections.join('\n');
}
