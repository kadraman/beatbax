/**
 * ChatPanel — BeatBax Copilot AI assistant panel.
 *
 * Uses any OpenAI-compatible REST API endpoint: OpenAI, Groq, Mistral,
 * Ollama (local), LM Studio, llama.cpp, etc.
 *
 * Connection settings (endpoint URL, API key, model) are persisted to
 * localStorage. Quick presets make switching providers one click.
 *
 * Code blocks fenced in ```bax ... ``` in assistant responses are given
 * action buttons: "Insert at cursor" and "Replace selection".
 */

import type { EventBus } from '../utils/event-bus';
import type { Diagnostic } from '../editor/diagnostics';
import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const STYLE_ID = 'bb-chat-panel-styles';
const STORAGE_KEY = 'bb-ai-settings';
const MAX_SELF_CORRECTION_ATTEMPTS = 4;
const MODE_KEY = 'bb-ai-mode';
const MAX_EDITOR_CHARS = 3000;

// ─── Presets ──────────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  endpoint: string;
  model: string;
  apiKeyPlaceholder: string;
}

const PRESETS: Preset[] = [
  {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyPlaceholder: 'sk-…',
  },
  {
    label: 'Groq (free, fast)',
    endpoint: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    apiKeyPlaceholder: 'gsk_…',
  },
  {
    label: 'Ollama (local)',
    endpoint: 'http://localhost:11434/v1',
    model: 'llama3.2',
    apiKeyPlaceholder: 'not required',
  },
  {
    label: 'LM Studio (local)',
    endpoint: 'http://localhost:1234/v1',
    model: 'local-model',
    apiKeyPlaceholder: 'not required',
  },
];

// ─── Settings ─────────────────────────────────────────────────────────────────

interface AISettings {
  endpoint: string;
  apiKey: string;
  model: string;
}

function defaultSettings(): AISettings {
  return { endpoint: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' };
}

function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultSettings();
}

function saveSettings(s: AISettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ─── BeatBax language reference injected into the system prompt ───────────────

/** Extract the chip name from song source (defaults to 'gameboy' if absent).
 *  Normalises the aliases "gb" and "dmg" to "gameboy". */
function detectChip(source: string): string {
  const m = source.match(/^\s*chip\s+(\w+)/m);
  const raw = m ? m[1].toLowerCase() : 'gameboy';
  return (raw === 'gb' || raw === 'dmg') ? 'gameboy' : raw;
}

const HARDWARE_GAMEBOY = `
══ GAME BOY HARDWARE — READ FIRST ══
Exactly 4 channels. Each channel number (1–4) must appear AT MOST ONCE per song.
Channel-to-type mapping is FIXED — you cannot swap these:
  channel 1 → type=pulse1   (melodic) — typically: lead melody
  channel 2 → type=pulse2   (melodic) — typically: harmony, counter-melody, or bass
  channel 3 → type=wave     (wavetable, no envelope volume) — typically: bass or accompaniment
  channel 4 → type=noise    (drums/percussion) — typically: kick, snare, hi-hat
NEVER write two "channel <number> =>" lines. NEVER define instruments inside pat bodies.

INSTRUMENTS  (inst <name> <fields>)
  type=pulse1|pulse2    duty=<12|25|50|75>   env=<0-15>,<up|down|flat>
  type=wave             wave=[<16 values 0-15>]  (no env)
  type=noise            env=<0-15>,<up|down|flat>
  Extended GB envelope: env=gb:<vol>,<dir>,<period>  e.g. env=gb:12,down,1
  sweep effect is only valid on channel 1 (pulse1).
  For percussion, define NAMED noise instruments (e.g. kick, snare, hihat) with
  different envelopes to distinguish timbres. You can have multiple noise instruments.`.trim();

function buildLanguageRef(chip: string): string {
  const hardwareSection = chip === 'gameboy'
    ? HARDWARE_GAMEBOY
    : `══ CHIP: ${chip.toUpperCase()} ══\nOnly "gameboy" is fully documented. Use standard directives and define instruments appropriate to this chip.`;

  return `BeatBax Language Reference (chip: ${chip}):

${hardwareSection}

TOP-LEVEL DIRECTIVES
  chip <name>           — audio backend (detected: ${chip})
  bpm <n>               — tempo in BPM (default 120)
  volume <v>            — master volume 0.0–1.0 (default 1.0)
  time <n>              — beats per bar (default 4)
  ticksPerStep <n>      — tick resolution per step (default 16)
  OMIT any directive whose value equals the default — only write it if you are
  changing it. Never write: volume 1.0  time 4  ticksPerStep 16

INSTRUMENT NAMES
  All inst names are user-defined. Use the SAME name everywhere (inst, seq transforms, channel).
  EVERY name used in a pat, seq, or channel MUST have a matching definition earlier in the file.

PATTERNS  (pat <name> = <events>)
  Events: notes (C3–B8), rests (.), instrument names (as hits), effects on notes, inst switches.
  Sharps: C#4, F#5. Flats not supported — use enharmonic sharp.
  Note with effect (effect BEFORE duration):  C4<vib:3,6>:8
    WRONG: C4:8<vib:3,6>  RIGHT: C4<vib:3,6>:8
  Multiple effects:  C4<vib:3,6><pan:L>:8
  Inline inst switch:   inst <name>    — changes instrument from here onward
  Temporary override:   inst(<name>,<n>) — next n notes use that inst, then reverts
  PERCUSSION PATTERNS: use the instrument name as a hit token, not a note with <cut>.
    Define named noise instruments, then use them directly in patterns:
      inst kick  type=noise env=gb:15,down,1
      inst snare type=noise env=gb:10,down,2
      inst hihat type=noise env=gb:6,down,1
      pat beat = kick . snare . kick kick snare .
    DO NOT write:  pat beat = C4<cut:4>:8 C4<cut:4>:8  (this is incorrect for percussion)

EFFECTS  (inline: note<effect:params>, multiple: note<eff1:p><eff2:p>)
  pan       pan:L / pan:R / pan:C  or  pan:-1.0..1.0  — stereo panning
  vib       vib:<depth>,<rate>     e.g. C4<vib:3,6>   — vibrato LFO on pitch
  trem      trem:<depth>,<rate>    e.g. C4<trem:4,8>  — tremolo (volume LFO)
  port      port:<speed>           e.g. E4<port:8>    — portamento/glide from prev note
  arp       arp:<s1>,<s2>          e.g. C4<arp:4,7>   — arpeggio (semitone offsets)
  volSlide  volSlide:+<n> or volSlide:-<n>             — volume slide per tick
  cut       cut:<ticks>            e.g. C4<cut:4>:8   — gate note off after N ticks
  bend      bend:<semitones>                            — smooth pitch bend
  sweep     sweep:<time>,<dir>,<shift>                 — hardware sweep (ch1 only on gameboy)
  retrig    retrig:<interval>                           — retrigger (WebAudio only)
  echo      echo:<time>,<feedback>                      — echo/delay (WebAudio only)

NAMED EFFECT PRESETS  (effect <name> = <effectType>:<params>)
  effect wobble  = vib:8,4
  effect arpMaj  = arp:4,7
  pat melody = C4<wobble>:4 E4<arpMaj>:4   — apply presets by name

SEQUENCES  (seq <name> = <pat1> <pat2> ... )
  A sequence is an ORDERED LIST of pattern names, space-separated.
  EVERY pattern name listed MUST be defined with 'pat' earlier in the file.
  Example: seq main = intro verse chorus verse outro
  Per-item transforms (colon-separated after each name):
    seq main = intro melody:oct(-1) chorus:rev
  Available transforms: oct(+/-N)  inst(name)  rev  slow  fast
  Chain transforms:  melody:oct(-1):rev
  slow / fast: halve or double the playback speed of that pattern. Use ONLY when you
    deliberately want a tempo change — do NOT apply slow/fast to every pattern by default.

CHANNELS   (channel <1-4> => inst <name> seq <seq1> [<seq2> ...])
  A channel plays its sequences IN ORDER, one after another.
  List multiple sequence names space-separated after 'seq'.
  RULE: Each channel number (1–4) used EXACTLY ONCE. inst must match the channel type.

  SECTION-BASED SONG STRUCTURE (recommended for longer songs):
  Organise your song into named sections (intro, verse, chorus, bridge, outro, etc.).
  For each section, define exactly 4 sequences — one per channel.
  Then the channel lines list every section's sequence in song order.

  Example (3 sections, 4 channels each):
    # --- Section 1: Intro ---
    seq intro_mel  = intro_a intro_b         # ch1 patterns
    seq intro_harm = harm_i harm_ii          # ch2 patterns
    seq intro_bass = bass_root bass_walk     # ch3 patterns
    seq intro_perc = drums_sparse drums_sparse  # ch4 patterns

    # --- Section 2: Verse ---
    seq verse_mel  = riff_a riff_b riff_a riff_b
    seq verse_harm = harm_i harm_iv harm_vi harm_v
    seq verse_bass = bass_walk bass_root bass_vi_v bass_walk
    seq verse_perc = drums_main drums_sync drums_main drums_sync

    # --- Section 3: Chorus ---
    seq chorus_mel  = chorus_a chorus_b
    seq chorus_harm = harm_I harm_IV
    seq chorus_bass = bass_chorus_a bass_chorus_b
    seq chorus_perc = drums_full drums_fill

    # --- Channels: list all section sequences in song order ---
    channel 1 => inst lead  seq intro_mel  verse_mel  chorus_mel
    channel 2 => inst harm  seq intro_harm verse_harm chorus_harm
    channel 3 => inst wave1 seq intro_bass verse_bass chorus_bass
    channel 4 => inst kick  seq intro_perc verse_perc chorus_perc

  This pattern scales to any number of sections — just add more sequences and
  append them to the channel lines. Always maintain 4-way symmetry: every section
  contributes exactly one sequence to each channel.

PLAY  (play)            — starts deterministic playback

GAME BOY CHIPTUNE STYLE GUIDE (recommendations, not rules)
  The following techniques are characteristic of authentic GB chiptune and should
  be used liberally to create convincing, expressive 8-bit music:

  1. ARPEGGIO — the most important GB effect. Because the GB only has 4 channels,
     arpeggios simulate chords on a single channel by cycling through note offsets
     very quickly. Use on harmony (ch2) and bass (ch3) for chord texture.
     Define named presets and reuse them:
       effect majorArp = arp:4,7       # major triad  — root → +4 → +7 semitones
       effect minorArp = arp:3,7       # minor triad
       effect dom7Arp  = arp:4,7,10    # dominant 7th
     Apply on held notes:  F3<majorArp>:8  G3<minorArp>:8

  2. VIBRATO on sustained melody notes — adds expressiveness to peaks and long holds.
     Vary depth/speed to differentiate song sections:
       effect wobble  = vib:3,5,sine,3  # gentle wobble on melody peaks
       effect deepVib = vib:5,2,sine,6  # slow atmospheric vibrato for bridges
       effect fastVib = vib:2,8,sine,2  # rapid shimmer on climax notes

  3. TREMOLO for shimmer/sparkle effects on climactic notes:
       effect shimmer = trem:5,8,sine   # fast amplitude flicker — triumphant peaks
       effect horror  = trem:3,8,square # choppy square-wave tremolo — tense sections

  4. PORTAMENTO / slides for melodic runs and legato bass lines:
       effect slide     = port:10  # snappy slide — ascending scalar runs
       effect slowSlide = port:4   # smooth legato — walking bass lines
     Use on ascending runs:  C4:2 E4<slide>:2 G4<slide>:2 C5<slide>:2

  5. DUTY-CYCLE MODULATION (DCM) — define multiple pulse instruments with different
     duty values and switch between them inline within a pattern for timbral variety:
       inst lead_thin  type=pulse1 duty=12 env=gb:13,down,2  # hollow, nasal
       inst lead_bright type=pulse1 duty=50 env=gb:12,down,3  # balanced, bold
       inst lead_warm  type=pulse1 duty=75 env=gb:11,down,4  # warm, full
       pat riff = inst lead_thin C5:2 E5:2 inst lead_bright G5:4 inst lead_warm C6:4

  6. FAST 16th-NOTE MELODIES — GB music is characterised by energetic, rapid note
     sequences. Use short durations (:2 to :4) for melodic runs and fills.
     Avoid overly long notes unless intentionally atmospheric.

  7. SHORT, PUNCHY ENVELOPES — fast-decay envelopes give the characteristic bright
     GB attack. Prefer env=gb:<vol>,down,1 or env=gb:<vol>,down,2 for lead/bass.
     Slower periods (3–6) for pads and atmospheric sustained notes.

  8. NAMED PRESETS for all recurring effects — define effect presets at the top of
     the song, before any patterns, and reference them by name throughout.
     This is idiomatic BeatBax style:
       effect wobble   = vib:3,5,sine,3
       effect majorArp = arp:4,7
       effect slide    = port:10`.trim();
}

const EDIT_SYSTEM_SUFFIX = `
You are in EDIT mode. When the user asks you to make changes:
1. Output the entire updated song in a single \`\`\`bax fenced code block.
2. After the block write 1-3 sentences describing ONLY the changes made.
   Do NOT repeat, quote, or list the song code in the description.
3. The code block will be automatically applied to the editor — do not ask
   the user to copy or paste anything.

CREATING A NEW SONG:
If the user asks you to "create", "write", "make", "compose" or "generate" a song
(even if there is existing content in the editor), output a COMPLETE new song from
scratch. Do NOT preserve or modify any of the existing editor content.

EDITING AN EXISTING SONG:
When adding new sections (bridge, chorus, outro, etc.) you MUST:
- Define separate patterns PER CHANNEL for every new section.
  Example for a "bridge" section across 4 channels:
    pat bridge_mel  = ...  # channel 1 melody notes
    pat bridge_harm = ...  # channel 2 harmony notes
    pat bridge_bass = ...  # channel 3 bass notes
    pat bridge_perc = ...  # channel 4 drum pattern
- Define ONE sequence PER CHANNEL for every new section:
    seq bridge_mel_seq  = bridge_mel
    seq bridge_harm_seq = bridge_harm
    seq bridge_bass_seq = bridge_bass
    seq bridge_perc_seq = bridge_perc
- NEVER mix patterns from different channels into a single sequence.
  A sequence is always consumed by ONE channel.
- Always APPEND the new section sequences to the end of each channel line:
    BEFORE: channel 1 => inst lead seq intro_mel verse_mel
    AFTER:  channel 1 => inst lead seq intro_mel verse_mel bridge_mel_seq
  Do this for all 4 channels so every channel advances to the new section together.

LONGER SONGS — SECTION-BASED STRUCTURE:
For songs with many sections, organise sequences in named groups, one group per section,
four sequences per group (one per channel). This is idiomatic BeatBax style:
  # --- Intro (Bars 1–2) ---
  seq intro_mel  = pat_a pat_b       # ch1
  seq intro_harm = harm_a harm_b     # ch2
  seq intro_bass = bass_a bass_a     # ch3
  seq intro_perc = perc_a perc_a     # ch4

  # --- Verse (Bars 3–6) ---
  seq verse_mel  = riff_a riff_b riff_a riff_b   # ch1
  seq verse_harm = harm_i harm_iv harm_vi harm_v  # ch2
  seq verse_bass = bass_w bass_r bass_v bass_w    # ch3
  seq verse_perc = drm_f drm_s drm_f drm_s       # ch4

  # --- Channels list ALL section sequences in song order ---
  channel 1 => inst lead  seq intro_mel  verse_mel  chorus_mel  bridge_mel  coda_mel
  channel 2 => inst harm  seq intro_harm verse_harm chorus_harm bridge_harm coda_harm
  channel 3 => inst wave1 seq intro_bass verse_bass chorus_bass bridge_bass coda_bass
  channel 4 => inst kick  seq intro_perc verse_perc chorus_perc bridge_perc coda_perc

COMMENTS:
Add brief inline comments (# ...) throughout the song explaining:
- What each instrument is for (e.g. # bright lead for main melody)
- What each pattern achieves musically (e.g. # descending bridge phrase)
- What each named effect does (e.g. # gentle wobble on sustained notes)
- Any notable structural decisions (e.g. # bridge: minor key contrast)
`.trim();

const ASK_SYSTEM_SUFFIX = `
You are in ASK mode. Answer questions and explain concepts. If you provide
sample BeatBax code, wrap it in a \`\`\`bax fenced block, but do not modify
the user's song unless they explicitly ask you to.
`.trim();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatPanelOptions {
  container: HTMLElement;
  eventBus: EventBus;
  /** Returns current editor source for context injection. */
  getEditorContent: () => string;
  /** Returns current diagnostics for context injection. */
  getDiagnostics: () => Diagnostic[];
  /** Called with snippet text when user clicks "Insert at cursor". */
  onInsertSnippet: (text: string) => void;
  /** Called with snippet text when user clicks "Replace selection". */
  onReplaceSelection: (text: string) => void;
  /** Called with snippet text when user clicks "Replace editor" — replaces entire editor content. */
  onReplaceEditor: (text: string) => void;
  /** Called after an auto-apply; provides changed line numbers and the previous content for undo. */
  onHighlightChanges?: (addedLineNums: number[], previousContent: string) => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

function computeDiffLines(oldText: string, newText: string): DiffLine[] {
  // Normalize line endings — Monaco uses LF internally; AI responses often use CRLF
  const a = oldText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const b = newText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const m = a.length, n = b.length;
  // LCS table — songs are small so O(m*n) is fine
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      result.unshift({ type: 'unchanged', text: a[i-1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      result.unshift({ type: 'added', text: b[j-1] });
      j--;
    } else {
      result.unshift({ type: 'removed', text: a[i-1] });
      i--;
    }
  }
  return result;
}

function addedLineNumbers(diff: DiffLine[]): number[] {
  const lines: number[] = [];
  let lineNum = 1;
  for (const d of diff) {
    if (d.type !== 'removed') {
      if (d.type === 'added') lines.push(lineNum);
      lineNum++;
    }
  }
  return lines;
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export class ChatPanel {
  private el: HTMLElement;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private typingEl: HTMLElement | null = null;  // animated "thinking" indicator (created dynamically)
  private settingsEl!: HTMLElement;
  private settingsOpen = false;

  // Settings form fields (populated in buildSettingsPanel)
  private endpointInput!: HTMLInputElement;
  private apiKeyInput!: HTMLInputElement;
  private modelInput!: HTMLInputElement;

  private messages: Message[] = [];
  private settings: AISettings;
  private mode: 'ask' | 'edit';
  private isLoading = false;
  private visible = false;
  private abortController: AbortController | null = null;

  constructor(private opts: ChatPanelOptions) {
    this.settings = loadSettings();
    this.mode = (localStorage.getItem(MODE_KEY) as 'ask' | 'edit') === 'ask' ? 'ask' : 'edit';
    this.el = document.createElement('div');
    this.el.className = 'bb-chat-panel';
    this.injectStyles();
    this.render();
    opts.container.appendChild(this.el);
    this.el.style.display = 'none';
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  show(): void {
    this.visible = true;
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.visible = false;
    this.el.style.display = 'none';
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.abortController?.abort();
    this.el.remove();
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  private render(): void {
    this.el.innerHTML = '';
    this.el.style.cssText = [
      'flex-direction: column',
      'height: 100%',
      'overflow: hidden',
      'background: var(--panel-bg, #1e1e1e)',
      'color: var(--text-color, #d4d4d4)',
      'font-family: var(--font-family, "Segoe UI", sans-serif)',
      'font-size: 13px',
    ].join('; ');

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'bb-chat-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'bb-chat-title-row';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'bb-chat-title';
    titleSpan.textContent = '🤖 BeatBax Copilot';
    const settingsToggleBtn = document.createElement('button');
    settingsToggleBtn.className = 'bb-chat-settings-btn';
    settingsToggleBtn.title = 'Configure AI provider';
    settingsToggleBtn.textContent = '⚙';
    settingsToggleBtn.addEventListener('click', () => this.toggleSettings());
    titleRow.appendChild(titleSpan);
    titleRow.appendChild(settingsToggleBtn);
    header.appendChild(titleRow);

    const subtitle = document.createElement('span');
    subtitle.className = 'bb-chat-subtitle';
    subtitle.textContent = this.getSubtitle();
    header.appendChild(subtitle);

    this.el.appendChild(header);

    // ── Settings panel (collapsed) ────────────────────────────────────────────
    this.settingsEl = this.buildSettingsPanel();
    this.settingsEl.style.display = 'none';
    this.el.appendChild(this.settingsEl);

    // ── Status bar ────────────────────────────────────────────────────────────
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'bb-chat-status';
    this.el.appendChild(this.statusEl);

    // ── Messages area ─────────────────────────────────────────────────────────
    this.messagesEl = document.createElement('div');
    this.messagesEl.className = 'bb-chat-messages';
    this.el.appendChild(this.messagesEl);

    // ── Mode toggle ───────────────────────────────────────────────────────────
    const modeBar = document.createElement('div');
    modeBar.className = 'bb-chat-mode-bar';

    const mkModeBtn = (label: string, value: 'ask' | 'edit', title: string) => {
      const btn = document.createElement('button');
      btn.className = 'bb-chat-mode-btn' + (this.mode === value ? ' bb-chat-mode-btn--active' : '');
      btn.textContent = label;
      btn.title = title;
      btn.addEventListener('click', () => {
        this.mode = value;
        try { localStorage.setItem(MODE_KEY, value); } catch { /* ignore */ }
        modeBar.querySelectorAll('.bb-chat-mode-btn').forEach(b => b.classList.remove('bb-chat-mode-btn--active'));
        btn.classList.add('bb-chat-mode-btn--active');
        this.inputEl.placeholder = value === 'edit'
          ? 'Describe a change… (Shift+Enter for newline)'
          : 'Ask a question… (Shift+Enter for newline)';
      });
      return btn;
    };
    modeBar.appendChild(mkModeBtn('Ask', 'ask', 'Get answers and explanations — no automatic edits'));
    modeBar.appendChild(mkModeBtn('Edit', 'edit', 'Apply changes directly to the editor'));
    this.el.appendChild(modeBar);

    // ── Input row ─────────────────────────────────────────────────────────────
    const inputRow = document.createElement('div');
    inputRow.className = 'bb-chat-input-row';

    this.inputEl = document.createElement('textarea');
    this.inputEl.className = 'bb-chat-input';
    this.inputEl.placeholder = this.mode === 'edit'
      ? 'Describe a change… (Shift+Enter for newline)'
      : 'Ask a question… (Shift+Enter for newline)';
    this.inputEl.rows = 2;
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.sendBtn = document.createElement('button');
    this.sendBtn.className = 'bb-chat-send-btn';
    this.sendBtn.textContent = '▶ Send';
    this.sendBtn.addEventListener('click', () => {
      if (this.isLoading) {
        this.abortController?.abort();
      } else {
        this.sendMessage();
      }
    });

    inputRow.appendChild(this.inputEl);
    inputRow.appendChild(this.sendBtn);
    this.el.appendChild(inputRow);

    // ── Footer ────────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'bb-chat-footer';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'bb-chat-clear-btn';
    clearBtn.textContent = 'Clear chat';
    clearBtn.addEventListener('click', () => this.clearChat());
    footer.appendChild(clearBtn);

    const modelLabel = document.createElement('span');
    modelLabel.className = 'bb-chat-model-label';
    modelLabel.textContent = this.settings.model;
    footer.appendChild(modelLabel);

    this.el.appendChild(footer);

    // Show config warning if no key set for a remote endpoint
    this.checkConfig();
  }

  // ─── Settings panel ──────────────────────────────────────────────────────────

  private getSubtitle(): string {
    const preset = PRESETS.find(p =>
      this.settings.endpoint.startsWith(p.endpoint.replace(/\/v1$/, ''))
    );
    return preset ? `via ${preset.label}` : this.settings.endpoint;
  }

  private buildSettingsPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'bb-chat-settings-panel';

    // Preset selector
    const presetsRow = document.createElement('div');
    presetsRow.className = 'bb-chat-settings-row';
    const presetsLabel = document.createElement('label');
    presetsLabel.textContent = 'Preset:';
    const presetsSelect = document.createElement('select');
    presetsSelect.className = 'bb-chat-select';
    const blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = '— choose preset —';
    presetsSelect.appendChild(blankOpt);
    for (const p of PRESETS) {
      const opt = document.createElement('option');
      opt.value = p.label;
      opt.textContent = p.label;
      presetsSelect.appendChild(opt);
    }
    presetsSelect.addEventListener('change', () => {
      const preset = PRESETS.find(p => p.label === presetsSelect.value);
      if (preset) {
        this.endpointInput.value = preset.endpoint;
        this.modelInput.value = preset.model;
        this.apiKeyInput.placeholder = preset.apiKeyPlaceholder;
      }
      presetsSelect.value = '';
    });
    presetsRow.appendChild(presetsLabel);
    presetsRow.appendChild(presetsSelect);
    panel.appendChild(presetsRow);

    // Endpoint
    const endpointRow = document.createElement('div');
    endpointRow.className = 'bb-chat-settings-row';
    const endpointLabel = document.createElement('label');
    endpointLabel.textContent = 'Endpoint:';
    this.endpointInput = document.createElement('input');
    this.endpointInput.type = 'text';
    this.endpointInput.className = 'bb-chat-input-field';
    this.endpointInput.value = this.settings.endpoint;
    this.endpointInput.placeholder = 'https://api.openai.com/v1';
    endpointRow.appendChild(endpointLabel);
    endpointRow.appendChild(this.endpointInput);
    panel.appendChild(endpointRow);

    // API Key
    const keyRow = document.createElement('div');
    keyRow.className = 'bb-chat-settings-row';
    const keyLabel = document.createElement('label');
    keyLabel.textContent = 'API Key:';
    this.apiKeyInput = document.createElement('input');
    this.apiKeyInput.type = 'password';
    this.apiKeyInput.className = 'bb-chat-input-field';
    this.apiKeyInput.value = this.settings.apiKey;
    this.apiKeyInput.placeholder = 'sk-… (leave blank for Ollama / local)';
    keyRow.appendChild(keyLabel);
    keyRow.appendChild(this.apiKeyInput);
    panel.appendChild(keyRow);

    // Model
    const modelRow = document.createElement('div');
    modelRow.className = 'bb-chat-settings-row';
    const modelLabel = document.createElement('label');
    modelLabel.textContent = 'Model:';
    this.modelInput = document.createElement('input');
    this.modelInput.type = 'text';
    this.modelInput.className = 'bb-chat-input-field';
    this.modelInput.value = this.settings.model;
    this.modelInput.placeholder = 'gpt-4o-mini';
    modelRow.appendChild(modelLabel);
    modelRow.appendChild(this.modelInput);
    panel.appendChild(modelRow);

    // Save button
    const saveRow = document.createElement('div');
    saveRow.className = 'bb-chat-settings-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'bb-chat-action-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => this.saveSettingsFromUI());
    saveRow.appendChild(saveBtn);
    panel.appendChild(saveRow);

    return panel;
  }

  private toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    this.settingsEl.style.display = this.settingsOpen ? 'block' : 'none';
  }

  private saveSettingsFromUI(): void {
    this.settings = {
      endpoint: this.endpointInput.value.trim().replace(/\/$/, '') || 'https://api.openai.com/v1',
      apiKey: this.apiKeyInput.value.trim(),
      model: this.modelInput.value.trim() || 'gpt-4o-mini',
    };
    saveSettings(this.settings);
    this.toggleSettings();
    this.checkConfig();
    const subtitle = this.el.querySelector('.bb-chat-subtitle') as HTMLElement | null;
    if (subtitle) subtitle.textContent = this.getSubtitle();
    const modelLabel = this.el.querySelector('.bb-chat-model-label') as HTMLElement | null;
    if (modelLabel) modelLabel.textContent = this.settings.model;
    this.setStatus('Settings saved.');
    setTimeout(() => this.checkConfig(), 2000);
  }

  private checkConfig(): void {
    const isLocal = this.settings.endpoint.includes('localhost') ||
                    this.settings.endpoint.includes('127.0.0.1');
    if (!isLocal && !this.settings.apiKey) {
      this.setStatus('⚠ No API key set. Click ⚙ to configure.');
    } else {
      this.setStatus('');
    }
  }

  // ─── Context assembly ────────────────────────────────────────────────────────

  assembleContext(): string {
    const editorContent = this.opts.getEditorContent();
    const truncated = editorContent.length > MAX_EDITOR_CHARS
      ? editorContent.slice(0, MAX_EDITOR_CHARS) + '\n…[truncated]'
      : editorContent;

    const diagnostics = this.opts.getDiagnostics();
    const diagBlock = diagnostics.length > 0
      ? diagnostics
          .map(d => `  ${d.severity.padEnd(7)} line ${d.startLine}, col ${d.startColumn}: ${d.message}`)
          .join('\n')
      : '  No current errors or warnings.';

    const modeSuffix = this.mode === 'edit' ? EDIT_SYSTEM_SUFFIX : ASK_SYSTEM_SUFFIX;
    const langRef = buildLanguageRef(detectChip(editorContent));
    return (
      `You are BeatBax Copilot, an assistant for the BeatBax live-coding chiptune language.\n${langRef}\n\n${modeSuffix}\n\n` +
      `[EDITOR CONTENT]\n\`\`\`bax\n${truncated}\n\`\`\`\n\n` +
      `[DIAGNOSTICS]\n${diagBlock}`
    );
  }

  // ─── Messaging ───────────────────────────────────────────────────────────────

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isLoading) return;

    if (!this.settings.endpoint) {
      this.setStatus('⚠ No endpoint configured. Click ⚙ to set one.');
      return;
    }

    this.inputEl.value = '';
    this.addMessage('user', text);
    this.setLoading(true);

    try {
      let response = await this.generate(text);
      if (this.mode === 'edit') {
        // Edit mode: auto-apply code, with self-correction retry on parse errors
        let baxCode = this.extractBaxCode(response);

        if (baxCode !== null) {
          let appendMessages: Array<{ role: string; content: string }> = [];
          for (let attempt = 0; attempt < MAX_SELF_CORRECTION_ATTEMPTS; attempt++) {
            const errs = this.validateBax(baxCode!);
            if (errs === null) break;
            this.setStatus(`⚠ Parse errors — self-correcting (${attempt + 1}/${MAX_SELF_CORRECTION_ATTEMPTS})…`);
            appendMessages = [
              ...appendMessages,
              { role: 'assistant', content: response },
              { role: 'user', content: `The BeatBax code you generated has parse errors. Fix them and output the corrected complete song in a \`\`\`bax block.\n\nParse errors:\n${errs}` },
            ];
            response = await this.generate(text, appendMessages);
            baxCode = this.extractBaxCode(response);
            if (baxCode === null) break;
          }
        }

        let previousContent: string | null = null;
        if (baxCode !== null) {
          previousContent = this.opts.getEditorContent();
          this.opts.onReplaceEditor(baxCode);
          // Only highlight diffs when editing an existing song — skip for fresh creation
          if (this.opts.onHighlightChanges && previousContent.trim().length > 0) {
            const diff = computeDiffLines(previousContent, baxCode);
            const added = addedLineNumbers(diff);
            if (added.length > 0) this.opts.onHighlightChanges(added, previousContent);
          }
        }
        // Strip the code block — only the description goes into the chat bubble
        const description = response.replace(/```bax[\s\S]*?```/g, '').trim();
        this.addMessage('assistant', description || '_(no description)_', baxCode !== null, previousContent);
      } else {
        // Ask mode: show the full response, no auto-apply
        this.addMessage('assistant', response, false, null);
      }
    } catch (err: any) {
      if ((err as Error).name === 'AbortError') {
        this.addMessage('assistant', '_(cancelled)_');
      } else {
        this.addMessage('assistant', `⚠ Error: ${err?.message ?? String(err)}`);
      }
    } finally {
      this.setLoading(false);
    }
  }

  /** Parse and resolve baxCode; returns formatted error string or null if valid. */
  private validateBax(code: string): string | null {
    try {
      const ast = parse(code);
      resolveSong(ast);

      // resolveSong silently accepts undefined instrument names (both branches of
      // resolveInstName return the name regardless of existence). Catch missing
      // instrument definitions explicitly here.
      const defined = new Set(Object.keys(ast.insts || {}));
      const errors: string[] = [];

      // 1. Channel-level inst references
      for (const ch of (ast.channels || [])) {
        if (ch.inst && !defined.has(ch.inst)) {
          errors.push(`instrument "${ch.inst}" (channel ${ch.id}) is not defined — add: inst ${ch.inst} type=pulse1 ...`);
        }
      }

      // 2. Inline inst tokens in patterns (structured form)
      if (ast.patternEvents) {
        for (const [patName, events] of Object.entries(ast.patternEvents)) {
          for (const ev of events) {
            if ((ev.kind === 'inline-inst' || ev.kind === 'temp-inst') && ev.name && !defined.has(ev.name)) {
              errors.push(`instrument "${ev.name}" (pattern "${patName}") is not defined`);
            }
          }
        }
      }

      // 3. Inline inst tokens in patterns (string token form, e.g. "inst lead")
      for (const [patName, tokens] of Object.entries(ast.pats || {})) {
        for (const tok of tokens) {
          const m = typeof tok === 'string' && tok.match(/^inst\s+(\S+)$/i);
          if (m && !defined.has(m[1])) {
            errors.push(`instrument "${m[1]}" (pattern "${patName}") is not defined`);
          }
        }
      }

      // 4. Sequence-level inst transforms (e.g. A:inst(bass))
      if (ast.sequenceItems) {
        for (const [seqName, items] of Object.entries(ast.sequenceItems)) {
          for (const item of items) {
            for (const tr of (item.transforms || [])) {
              if (tr.kind === 'inst' && tr.value && typeof tr.value === 'string' && !defined.has(tr.value)) {
                errors.push(`instrument "${tr.value}" (sequence "${seqName}") is not defined`);
              }
            }
          }
        }
      }

      if (errors.length > 0) return errors.join('\n');
      return null;
    } catch (e: any) {
      let msg: string = e?.message ?? String(e);
      if (e?.location?.start) {
        msg = `line ${e.location.start.line}, col ${e.location.start.column}: ${msg}`;
      }
      return msg;
    }
  }

  private async generate(
    userText: string,
    appendMessages: Array<{ role: string; content: string }> = [],
  ): Promise<string> {
    this.abortController = new AbortController();

    const systemContext = this.assembleContext();
    const history = this.messages.slice(-10);
    const messages = [
      { role: 'system', content: systemContext },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userText },
      ...appendMessages,
    ];

    const url = `${this.settings.endpoint}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.settings.apiKey) {
      headers['Authorization'] = `Bearer ${this.settings.apiKey}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.settings.model,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
        stream: false,
      }),
      signal: this.abortController.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let detail = body;
      try {
        const json = JSON.parse(body);
        detail = json?.error?.message ?? body;
      } catch { /* ignore */ }
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '(no response)';
  }

  // ─── Message rendering ───────────────────────────────────────────────────────

  /** Extract the first ```bax fenced block from a response, or null if none. */
  private extractBaxCode(content: string): string | null {
    const m = content.match(/```bax\s*\n([\s\S]*?)```/);
    return m ? m[1].replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim() : null;
  }

  private addMessage(role: 'user' | 'assistant', content: string, autoApplied = false, previousContent: string | null = null): void {
    this.messages.push({ role, content });
    const el = this.renderMessage(role, content, autoApplied, previousContent);
    this.messagesEl.appendChild(el);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private renderMessage(role: 'user' | 'assistant', content: string, autoApplied = false, previousContent: string | null = null): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = `bb-chat-msg bb-chat-msg--${role}`;

    const label = document.createElement('span');
    label.className = 'bb-chat-msg-label';
    label.textContent = role === 'user' ? 'You' : '🤖 Copilot';
    wrap.appendChild(label);

    if (role === 'user') {
      const p = document.createElement('p');
      p.className = 'bb-chat-msg-text';
      p.textContent = content;
      wrap.appendChild(p);
    } else {
      wrap.appendChild(this.renderMarkdown(content, autoApplied, previousContent));
    }

    return wrap;
  }

  /**
   * Render markdown and add action buttons below every code block.
   */
  private renderMarkdown(content: string, autoApplied = false, previousContent: string | null = null): HTMLElement {
    const container = document.createElement('div');
    container.className = 'bb-chat-markdown';

    const rawHtml = marked.parse(content) as string;
    const safeHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'p','br','strong','em','code','pre','ul','ol','li','blockquote',
        'h1','h2','h3','h4','h5','h6','a','table','thead','tbody','tr','th','td','hr','span',
      ],
      ALLOWED_ATTR: ['href', 'title', 'class'],
    });
    container.innerHTML = safeHtml;

    // Wrap each <pre> in a .bb-chat-code-block and append action buttons
    const pres = Array.from(container.querySelectorAll('pre'));
    let isFirst = true;
    for (const pre of pres) {
      const codeEl = pre.querySelector('code');
      const lang = codeEl?.className ?? '';
      const codeText = codeEl?.textContent ?? pre.textContent ?? '';
      const isBax = lang.includes('bax') || (isFirst && autoApplied);
      const wrapper = document.createElement('div');
      wrapper.className = 'bb-chat-code-block';
      pre.parentNode!.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      if (isBax && autoApplied && isFirst) {
        // Show an "applied" badge with an undo button
        const badge = document.createElement('div');
        badge.className = 'bb-chat-code-actions bb-chat-applied-badge';
        const appliedSpan = document.createElement('span');
        appliedSpan.textContent = '✓ Applied to editor';
        badge.appendChild(appliedSpan);
        if (previousContent !== null) {
          const undoBtn = document.createElement('button');
          undoBtn.className = 'bb-chat-action-btn bb-chat-undo-btn';
          undoBtn.textContent = '↩ Undo';
          undoBtn.title = 'Restore the previous editor content';
          const snapshot = previousContent;
          undoBtn.addEventListener('click', () => {
            this.opts.onReplaceEditor(snapshot);
            undoBtn.disabled = true;
            undoBtn.textContent = '✓ Restored';
          });
          badge.appendChild(undoBtn);
        }
        wrapper.appendChild(badge);
      } else {
        const actions = document.createElement('div');
        actions.className = 'bb-chat-code-actions';

        if (this.mode === 'ask') {
          // Ask mode: copy to clipboard only — no editor edits
          const copyBtn = document.createElement('button');
          copyBtn.className = 'bb-chat-action-btn';
          copyBtn.textContent = '⧉ Copy';
          copyBtn.title = 'Copy code to clipboard';
          copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(codeText).then(() => {
              copyBtn.textContent = '✓ Copied';
              setTimeout(() => { copyBtn.textContent = '⧉ Copy'; }, 1500);
            }).catch(() => {
              copyBtn.textContent = '⚠ Failed';
              setTimeout(() => { copyBtn.textContent = '⧉ Copy'; }, 1500);
            });
          });
          actions.appendChild(copyBtn);
        } else {
          // Edit mode: full editor action buttons
          const replaceEditorBtn = document.createElement('button');
          replaceEditorBtn.className = 'bb-chat-action-btn bb-chat-action-btn--primary';
          replaceEditorBtn.textContent = '↺ Replace editor';
          replaceEditorBtn.title = 'Replace entire editor content with this code';
          replaceEditorBtn.addEventListener('click', () => this.opts.onReplaceEditor(codeText));

          const insertBtn = document.createElement('button');
          insertBtn.className = 'bb-chat-action-btn';
          insertBtn.textContent = 'Insert at cursor';
          insertBtn.addEventListener('click', () => this.opts.onInsertSnippet(codeText));

          const replaceSelBtn = document.createElement('button');
          replaceSelBtn.className = 'bb-chat-action-btn';
          replaceSelBtn.textContent = 'Replace selection';
          replaceSelBtn.addEventListener('click', () => this.opts.onReplaceSelection(codeText));

          actions.append(replaceEditorBtn, insertBtn, replaceSelBtn);
        }
        wrapper.appendChild(actions);
      }
      isFirst = false;
    }

    return container;
  }

  private clearChat(): void {
    this.messages = [];
    this.messagesEl.innerHTML = '';
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.sendBtn.disabled = false; // always clickable — acts as Stop when loading
    this.inputEl.disabled = loading;
    this.sendBtn.textContent = loading ? '⏹ Stop' : '▶ Send';
    this.sendBtn.title = loading ? 'Cancel request' : '';
    if (loading) {
      const el = document.createElement('div');
      el.className = 'bb-chat-typing';
      el.innerHTML = '<span class="bb-chat-typing-dot"></span><span class="bb-chat-typing-dot"></span><span class="bb-chat-typing-dot"></span>';
      this.messagesEl.appendChild(el);
      this.typingEl = el;
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    } else {
      this.typingEl?.remove();
      this.typingEl = null;
    }
  }

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
    this.statusEl.style.display = text ? 'block' : 'none';
  }

  // ─── Styles ──────────────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .bb-chat-panel {
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--panel-bg, #1e1e1e);
        color: var(--text-color, #d4d4d4);
        font-size: 13px;
      }
      .bb-chat-header {
        display: flex;
        flex-direction: column;
        padding: 8px 12px 6px;
        border-bottom: 1px solid var(--border-color, #3c3c3c);
        flex-shrink: 0;
      }
      .bb-chat-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .bb-chat-title {
        font-weight: 700;
        font-size: 13px;
        color: var(--text-color, #d4d4d4);
      }
      .bb-chat-settings-btn {
        background: none;
        border: none;
        color: var(--text-muted, #888);
        cursor: pointer;
        font-size: 14px;
        padding: 2px 4px;
        border-radius: 3px;
        line-height: 1;
        transition: color 0.1s, background 0.1s;
      }
      .bb-chat-settings-btn:hover { color: var(--text-color, #d4d4d4); background: var(--button-hover-bg, #2a2d2e); }
      .bb-chat-subtitle {
        font-size: 11px;
        color: var(--text-muted, #888);
        margin-top: 2px;
      }
      .bb-chat-settings-panel {
        background: var(--header-bg, #252526);
        border-bottom: 1px solid var(--border-color, #3c3c3c);
        padding: 8px 12px;
        flex-shrink: 0;
      }
      .bb-chat-settings-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
      }
      .bb-chat-settings-row label {
        font-size: 11px;
        color: var(--text-muted, #888);
        white-space: nowrap;
        width: 60px;
        flex-shrink: 0;
      }
      .bb-chat-input-field,
      .bb-chat-select {
        flex: 1;
        background: var(--input-bg, #3c3c3c);
        color: var(--text-color, #d4d4d4);
        border: 1px solid var(--border-color, #3c3c3c);
        border-radius: 3px;
        padding: 3px 6px;
        font-size: 11px;
        font-family: inherit;
      }
      .bb-chat-input-field:focus,
      .bb-chat-select:focus { outline: 1px solid #569cd6; border-color: #569cd6; }
      .bb-chat-settings-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 4px;
      }
      .bb-chat-status {
        display: none;
        padding: 6px 12px;
        font-size: 11px;
        color: #569cd6;
        background: var(--header-bg, #252526);
        border-bottom: 1px solid var(--border-color, #3c3c3c);
        flex-shrink: 0;
      }
      .bb-chat-messages {
        flex: 1 1 0;
        overflow-y: auto;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .bb-chat-msg {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .bb-chat-msg-label {
        font-size: 11px;
        font-weight: 700;
        color: var(--text-muted, #888);
        text-transform: uppercase;
      }
      .bb-chat-msg--user .bb-chat-msg-label { color: #569cd6; }
      .bb-chat-msg--assistant .bb-chat-msg-label { color: #4ec994; }
      .bb-chat-msg-text {
        margin: 0;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .bb-chat-code-block {
        background: #0d1117;
        border: 1px solid var(--border-color, #3c3c3c);
        border-radius: 4px;
        overflow: hidden;
      }
      .bb-chat-code-block pre {
        margin: 0;
        padding: 8px 10px;
        overflow-x: auto;
      }
      .bb-chat-code {
        font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
        font-size: 12px;
        color: #d4d4d4;
        white-space: pre;
      }
      .bb-chat-code-actions {
        display: flex;
        gap: 6px;
        padding: 5px 8px;
        border-top: 1px solid var(--border-color, #3c3c3c);
        background: var(--header-bg, #252526);
      }
      .bb-chat-action-btn {
        padding: 3px 8px;
        font-size: 11px;
        background: #0e639c;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.1s;
      }
      .bb-chat-action-btn:hover { background: #1177bb; }
      .bb-chat-applied-badge {
        justify-content: flex-start;
      }
      .bb-chat-applied-badge span {
        font-size: 11px;
        color: #4ec94e;
        padding: 3px 4px;
        font-style: italic;
      }
      .bb-chat-undo-btn {
        background: #7a4f00;
        margin-left: 4px;
      }
      .bb-chat-undo-btn:hover:not(:disabled) { background: #a06800; }
      .bb-chat-undo-btn:disabled { opacity: 0.5; cursor: not-allowed; background: #444 !important; }
      /* ── Mode toggle bar ── */
      .bb-chat-mode-bar {
        display: flex;
        padding: 5px 10px;
        gap: 4px;
        border-bottom: 1px solid var(--border-color, #3c3c3c);
        flex-shrink: 0;
        background: var(--header-bg, #252526);
      }
      .bb-chat-mode-btn {
        flex: 1;
        padding: 4px 0;
        font-size: 12px;
        background: none;
        color: var(--text-muted, #888);
        border: 1px solid var(--border-color, #3c3c3c);
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.1s, color 0.1s;
      }
      .bb-chat-mode-btn:hover { background: var(--button-hover-bg, #2a2d2e); color: var(--text-color, #d4d4d4); }
      .bb-chat-mode-btn--active {
        background: #0e639c;
        color: #fff;
        border-color: #0e639c;
      }
      .bb-chat-mode-btn--active:hover { background: #1177bb; }
      /* Monaco editor decorations — must be globally visible */
      .bb-changed-line-added   { background: rgba(78,201,78,0.15) !important; border-left: 3px solid #4ec94e !important; }
      .bb-changed-line-removed { background: rgba(220,80,80,0.12) !important; border-left: 3px solid #f48771 !important; }
      /* AI pending-changes banner inside the Monaco editor container */
      .bb-ai-change-banner {
        position: absolute;
        top: 8px;
        right: 18px;
        z-index: 50;
        display: flex;
        align-items: center;
        gap: 6px;
        background: #252526;
        border: 1px solid #3c3c3c;
        border-radius: 4px;
        padding: 5px 10px;
        font-size: 12px;
        font-family: 'Segoe UI', sans-serif;
        color: #d4d4d4;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        pointer-events: all;
      }
      .bb-ai-change-banner-dot { color: #4ec94e; font-size: 10px; }
      .bb-ai-banner-keep {
        padding: 3px 10px;
        font-size: 11px;
        background: #16825d;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
      }
      .bb-ai-banner-keep:hover { background: #1a9c70; }
      .bb-ai-banner-discard {
        padding: 3px 10px;
        font-size: 11px;
        background: #6e2020;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
      }
      .bb-ai-banner-discard:hover { background: #a02828; }
      .bb-chat-input-row {
        display: flex;
        gap: 6px;
        padding: 6px 10px;
        border-top: 1px solid var(--border-color, #3c3c3c);
        flex-shrink: 0;
        align-items: flex-end;
      }
      .bb-chat-input {
        flex: 1;
        resize: none;
        background: var(--input-bg, #3c3c3c);
        color: var(--text-color, #d4d4d4);
        border: 1px solid var(--border-color, #3c3c3c);
        border-radius: 4px;
        padding: 6px 8px;
        font-size: 12px;
        font-family: inherit;
        line-height: 1.5;
      }
      .bb-chat-input:focus { outline: 1px solid #569cd6; border-color: #569cd6; }
      .bb-chat-input:disabled { opacity: 0.5; }
      .bb-chat-send-btn {
        padding: 6px 12px;
        background: #0e639c;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
        transition: background 0.1s;
      }
      .bb-chat-send-btn:hover:not(:disabled) { background: #1177bb; }
      .bb-chat-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .bb-chat-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 10px;
        border-top: 1px solid var(--border-color, #3c3c3c);
        flex-shrink: 0;
      }
      .bb-chat-clear-btn {
        background: none;
        border: none;
        color: var(--text-muted, #888);
        cursor: pointer;
        font-size: 11px;
        padding: 2px 4px;
        border-radius: 3px;
        transition: color 0.1s, background 0.1s;
      }
      .bb-chat-clear-btn:hover { color: var(--text-color, #d4d4d4); background: var(--button-hover-bg, #2a2d2e); }
      .bb-chat-model-label {
        font-size: 10px;
        color: var(--text-muted, #888);
        opacity: 0.7;
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* ── Typing indicator ── */
      .bb-chat-typing {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        flex-shrink: 0;
      }
      .bb-chat-typing-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #569cd6;
        animation: bb-bounce 1.1s infinite ease-in-out both;
      }
      .bb-chat-typing-dot:nth-child(1) { animation-delay: -0.32s; }
      .bb-chat-typing-dot:nth-child(2) { animation-delay: -0.16s; }
      @keyframes bb-bounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40%            { transform: scale(1);   opacity: 1; }
      }
      /* ── Primary action button variant ── */
      .bb-chat-action-btn--primary {
        background: #16825d;
      }
      .bb-chat-action-btn--primary:hover { background: #1a9c70; }
      /* ── Markdown rendering ── */
      .bb-chat-markdown { line-height: 1.6; }
      .bb-chat-markdown p { margin: 0 0 6px; }
      .bb-chat-markdown p:last-child { margin-bottom: 0; }
      .bb-chat-markdown h1, .bb-chat-markdown h2, .bb-chat-markdown h3,
      .bb-chat-markdown h4, .bb-chat-markdown h5, .bb-chat-markdown h6 {
        margin: 8px 0 4px; font-weight: 700; line-height: 1.3;
      }
      .bb-chat-markdown h1 { font-size: 14px; }
      .bb-chat-markdown h2 { font-size: 13px; }
      .bb-chat-markdown h3 { font-size: 12px; }
      .bb-chat-markdown ul, .bb-chat-markdown ol {
        margin: 4px 0 6px; padding-left: 18px;
      }
      .bb-chat-markdown li { margin-bottom: 2px; }
      .bb-chat-markdown code {
        font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
        font-size: 11.5px;
        background: #0d1117;
        border: 1px solid var(--border-color, #3c3c3c);
        border-radius: 3px;
        padding: 1px 4px;
      }
      .bb-chat-markdown pre {
        margin: 0;
        padding: 8px 10px;
        overflow-x: auto;
        background: #0d1117;
      }
      .bb-chat-markdown pre code {
        background: none;
        border: none;
        padding: 0;
        font-size: 12px;
        white-space: pre;
        color: #d4d4d4;
      }
      .bb-chat-markdown blockquote {
        border-left: 3px solid #569cd6;
        margin: 4px 0;
        padding: 2px 10px;
        color: var(--text-muted, #888);
      }
      .bb-chat-markdown a { color: #569cd6; text-decoration: underline; }
      .bb-chat-markdown hr { border: none; border-top: 1px solid var(--border-color, #3c3c3c); margin: 8px 0; }
      .bb-chat-markdown table { border-collapse: collapse; font-size: 12px; margin: 6px 0; }
      .bb-chat-markdown th, .bb-chat-markdown td {
        border: 1px solid var(--border-color, #3c3c3c);
        padding: 3px 8px;
      }
      .bb-chat-markdown th { background: var(--header-bg, #252526); }
    `;
    document.head.appendChild(style);
  }
}
