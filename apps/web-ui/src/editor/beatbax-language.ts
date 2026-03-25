/**
 * BeatBax language definition for Monaco Editor
 * Provides syntax highlighting, autocomplete, and language features
 */

import * as monaco from 'monaco-editor';
import { parse } from '@beatbax/engine/parser';
import { eventBus } from '../utils/event-bus';

let latestAST: any = null;
eventBus.on('parse:success', ({ ast }) => {
  latestAST = ast;
});

/** Cached semantic-token result. Invalidated whenever the model version changes. */
let tokenCache: { versionId: number; data: Uint32Array } | null = null;

/**
 * Register BeatBax language with Monaco
 */
export function registerBeatBaxLanguage(): void {
  // Register the language
  monaco.languages.register({ id: 'beatbax' });

  // Set language configuration
  monaco.languages.setLanguageConfiguration('beatbax', {
    comments: {
      lineComment: '#',
    },
    brackets: [
      ['[', ']'],
      ['(', ')'],
      ['{', '}'],
    ],
    autoClosingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '{', close: '}' },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '{', close: '}' },
      { open: '"', close: '"' },
    ],
  });

  // Set syntax highlighting (Monarch tokenizer)
  monaco.languages.setMonarchTokensProvider('beatbax', {
    keywords: [
      'chip',
      'bpm',
      'time',
      'stepsPerBar',
      'ticksPerStep',
      'inst',
      'pat',
      'seq',
      'channel',
      'play',
      'export',
      'import',
      'from',
      'volume',
      'title',
      'artist',
      'author',
      'comment',
    ],

    // Instrument types
    instrumentTypes: ['pulse1', 'pulse2', 'wave', 'noise'],

    // Transform names (sequence modifiers)
    transforms: ['oct', 'inst', 'rev', 'slow', 'fast', 'transpose'],

    // Inline effects (inside <...>)
    inlineEffects: ['vib', 'port', 'arp', 'volSlide', 'trem', 'pan', 'echo', 'retrig', 'sweep'],

    // Export formats
    exportFormats: ['json', 'midi', 'uge', 'wav'],

    // Chip types
    chipTypes: ['gameboy', 'gb', 'dmg'],

    // Note names (C0-B8)
    notes: /[A-G][#b]?[0-8]/,

    tokenizer: {
      root: [
        // Comments - BeatBax uses # syntax
        [/#.*$/, 'comment'],

        // Sequence modifiers - MUST be first before keywords catch pattern names
        [/:oct\b/, 'entity.name.function'],
        [/:inst\b/, 'entity.name.function'],
        [/:rev\b/, 'entity.name.function'],
        [/:slow\b/, 'entity.name.function'],
        [/:fast\b/, 'entity.name.function'],
        [/:transpose\b/, 'entity.name.function'],
        // User-defined effect preset modifiers (e.g., :ambient, :slapback)
        [/:[a-zA-Z_]\w*\b/, 'entity.name.function'],

        // Namespaced properties (e.g., gb:width) - MUST come before single properties
        [/\b(gb)(:)(width|lfsr)(?=\s*=)/, ['type', 'operator', 'attribute']],

        // Arrangement properties (appear after 'arrange' or in defaults())
        [/\b(defaults)\b(?=\s*\()/, 'attribute'],

        // Instrument/Effect property names (MUST come before keywords since 'volume' and 'wave' conflict)
        [/\b(type|duty|env|wave|sweep|volume|gm|length|lfsr|speed|depth|mode|delay|feedback|mix|interval|volumeDelta|waveform|note|width|inst)\b(?=\s*=)/, 'attribute'],

        // Song metadata properties (appear after 'song' directive)
        [/\b(name|artist|author|description|tags)\b(?=\s+")/, 'attribute'],

        // Top-level directives
        [
          /\b(song|chip|bpm|time|stepsPerBar|ticksPerStep|volume|title|artist|author|comment)\b/,
          'keyword',
        ],

        // Definitions - use state to capture definition names
        [/\b(inst|pat|seq|effect|arrange)\b/, { token: 'keyword', next: '@definitionName' }],
        [/\bimport\b/, { token: 'keyword', next: '@importStatement' }],
        [/\b(channel|from)\b/, 'keyword'],

        // Commands
        [/\b(play|export)\b/, 'keyword.control'],

        // Play modifiers
        [/\b(auto|repeat)\b/, 'keyword'],

        // Effect names (both inline and in effect definitions) - must come before identifiers
        [/\b(vib|port|arp|volSlide|trem|pan|echo|retrig|sweep)\b/, 'function'],

        // Inline effects inside angle brackets: <vib:3,6> <port:8> <arp:3,7>
        // MUST come before generic operators
        [/</, { token: 'delimiter.angle', next: '@inlineEffect' }],

        // Instrument types
        [/\b(pulse1|pulse2|wave|noise)\b/, 'type'],

        // Export formats (teal/cyan like constants)
        [/\b(json|midi|uge|wav)\b/, 'constant.language'],

        // Chip types
        [/\b(gameboy|gb|dmg)\b/, 'type'],

        // Notes (C0-B8)
        [/[A-G][#b]?[0-8]\b/, 'number.note'],

        // Rest token
        [/\./, 'number.rest'],

        // Numbers
        [/\d+/, 'number'],
        [/-?\d+/, 'number'],

        // Operators
        [/=>/, 'operator'],
        [/:/, 'operator'],
        // Equals followed by open brace - JSON object value
        [/=\{/, { token: 'operator', next: '@jsonObject' }],
        [/[=]/, 'operator'],
        [/[*+\-()]/, 'operator'],

        // Strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-terminated string
        [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],

        // Identifiers
        [/[a-zA-Z_]\w*/, 'identifier'],

        // Delimiters
        [/[,]/, 'delimiter'],
        [/[\[\]]/, '@brackets'],
      ],

      inlineEffect: [
        // Effect names: vib, port, arp, volSlide, trem, pan, echo, retrig, sweep
        [/\b(vib|port|arp|volSlide|trem|pan|echo|retrig|sweep)\b/, 'function'],
        // Colon separator
        [/:/, 'operator'],
        // Parameters (numbers, including signed)
        [/[+-]?\d+(\.\d+)?/, 'number'],
        [/,/, 'delimiter'],
        // Waveform names (for vib/trem) - must come before generic identifiers
        [/\b(sine|sin|tri|triangle|square|sqr|saw|sawtooth|ramp|noise|random|pulse|none|sawUp|sawDown|stepped|gated|gatedSlow)\b/, 'type'],
        // Panning values - must come before generic identifiers
        [/\b[LCR]\b/, 'constant'],
        // User-defined effect preset names (e.g., arpMinor, ambient, slapback)
        [/[a-zA-Z_]\w*/, 'function'],
        // Close angle bracket - return to root
        [/>/, { token: 'delimiter.angle', next: '@pop' }],
        // Whitespace
        [/\s+/, ''],
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],

      definitionName: [
        // Whitespace
        [/\s+/, ''],
        // Capture the definition name and color it yellow (variable name)
        [/[a-zA-Z_]\w*/, { token: 'variable.name', next: '@pop' }],
        // If we hit anything else, go back to root
        [/./, { token: '@rematch', next: '@pop' }],
      ],

      importStatement: [
        // Whitespace
        [/\s+/, ''],
        // Import string with URI scheme - tokenize scheme separately
        [/"/, { token: 'string.quote', bracket: '@open', next: '@importString' }],
        // If we hit anything else, go back to root
        [/./, { token: '@rematch', next: '@pop' }],
      ],

      importString: [
        // URI schemes - color as constant (teal/cyan)
        [/\b(local|github|https?|file)(?=:)/, 'constant.language'],
        // Colon after scheme
        [/:/, 'operator'],
        // Rest of string content
        [/[^\\"]+/, 'string'],
        // Escape sequences
        [/\\./, 'string.escape'],
        // Close quote - pop back to importStatement (which will then pop to root)
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],

      jsonObject: [
        // Whitespace
        [/\s+/, ''],
        // Close brace - return to root (MUST come before generic brackets)
        [/\}/, { token: 'delimiter.bracket', next: '@pop' }],
        // Property names (quoted strings followed by colon) - light blue
        [/"([^"\\]|\\.)*"(?=\s*:)/, 'attribute'],
        // String values (quoted strings NOT followed by colon) - orange
        [/"([^"\\]|\\.)*"/, 'string'],
        // Numbers (including negative and decimals)
        [/-?\d+(\.\d+)?/, 'number'],
        // Booleans and null
        [/\b(true|false|null)\b/, 'keyword'],
        // Nested objects/arrays - stay in JSON state
        [/\{/, 'delimiter.bracket'],
        [/\[/, 'delimiter.bracket'],
        [/\]/, 'delimiter.bracket'],
        // Structural characters
        [/:/, 'delimiter'],
        [/,/, 'delimiter'],
      ],
    },
  });

  // Register autocomplete provider
  monaco.languages.registerCompletionItemProvider('beatbax', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: monaco.languages.CompletionItem[] = [];

      // Top-level directives
      const directives = [
        { label: 'chip', detail: 'Set target chip', insertText: 'chip gameboy' },
        { label: 'bpm', detail: 'Set tempo', insertText: 'bpm 120' },
        { label: 'time', detail: 'Set time signature', insertText: 'time 4' },
        {
          label: 'stepsPerBar',
          detail: 'Set steps per bar',
          insertText: 'stepsPerBar 4',
        },
        {
          label: 'ticksPerStep',
          detail: 'Set ticks per step',
          insertText: 'ticksPerStep 16',
        },
        { label: 'volume', detail: 'Set global volume', insertText: 'volume 0.8' },
        { label: 'title', detail: 'Set song title', insertText: 'title "My Song"' },
        { label: 'artist', detail: 'Set artist name', insertText: 'artist "Artist"' },
      ];

      // Definitions
      const definitions = [
        {
          label: 'inst (pulse1)',
          detail: 'Define pulse1 instrument',
          insertText: 'inst ${1:name} type=pulse1 duty=50 env=12,down',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        },
        {
          label: 'inst (pulse2)',
          detail: 'Define pulse2 instrument',
          insertText: 'inst ${1:name} type=pulse2 duty=25 env=10,down',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        },
        {
          label: 'inst (wave)',
          detail: 'Define wave instrument',
          insertText: 'inst ${1:name} type=wave wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        },
        {
          label: 'inst (noise)',
          detail: 'Define noise instrument',
          insertText: 'inst ${1:name} type=noise env=12,down',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        },
        {
          label: 'pat',
          detail: 'Define pattern',
          insertText: 'pat ${1:name} = ${2:C4 E4 G4 C5}',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        },
        {
          label: 'seq',
          detail: 'Define sequence',
          insertText: 'seq ${1:name} = ${2:pattern1 pattern2}',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        },
        {
          label: 'channel',
          detail: 'Define channel mapping',
          insertText: 'channel ${1:1} => inst ${2:lead} seq ${3:main}',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        },
        {
          label: 'import',
          detail: 'Import instruments from file',
          insertText: 'import * from "${1:lib/instruments.bax}"',
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        },
      ];

      // Commands
      const commands = [
        { label: 'play', detail: 'Start playback', insertText: 'play' },
        {
          label: 'export json',
          detail: 'Export to JSON',
          insertText: 'export json "song.json"',
        },
        {
          label: 'export midi',
          detail: 'Export to MIDI',
          insertText: 'export midi "song.mid"',
        },
        {
          label: 'export uge',
          detail: 'Export to UGE',
          insertText: 'export uge "song.uge"',
        },
        {
          label: 'export wav',
          detail: 'Export to WAV',
          insertText: 'export wav "song.wav"',
        },
      ];

      // Note names
      const notes = [];
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      for (let octave = 0; octave <= 8; octave++) {
        for (const note of noteNames) {
          notes.push({
            label: `${note}${octave}`,
            detail: 'Note',
            insertText: `${note}${octave}`,
            kind: monaco.languages.CompletionItemKind.Value,
          });
        }
      }

      // Combine all suggestions
      const allSuggestions = [
        ...directives.map((s) => ({
          ...s,
          kind: monaco.languages.CompletionItemKind.Keyword,
          range,
        })),
        ...definitions.map((s) => ({
          ...s,
          kind: monaco.languages.CompletionItemKind.Snippet,
          range,
        })),
        ...commands.map((s) => ({
          ...s,
          kind: monaco.languages.CompletionItemKind.Function,
          range,
        })),
        ...notes.map((s) => ({ ...s, range })),
      ];

      return { suggestions: allSuggestions };
    },
  });

  // Register hover provider
  monaco.languages.registerHoverProvider('beatbax', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const hoverDocs: Record<string, string> = {
        chip: 'Sets the target audio chip. Example: `chip gameboy`',
        bpm: 'Sets the tempo in beats per minute. Example: `bpm 120`',
        time: 'Sets beats per bar (time signature numerator). Example: `time 4`',
        stepsPerBar: 'Alternative to `time`. Sets steps per bar.',
        ticksPerStep: 'Sets tick resolution per step. Example: `ticksPerStep 16`',
        inst: 'Defines an instrument. Example: `inst lead type=pulse1 duty=50 env=12,down`',
        pat: 'Defines a pattern. Example: `pat melody = C4 E4 G4 C5`',
        seq: 'Defines a sequence. Example: `seq main = melody bass`',
        channel: 'Maps a sequence to a channel. Example: `channel 1 => inst lead seq main`',
        play: 'Starts playback',
        export: 'Exports song to format. Example: `export midi "song.mid"`',
        import: 'Imports instruments from file. Example: `import * from "lib/instruments.bax"`',
        volume: 'Sets global volume (0.0-1.0). Example: `volume 0.8`',
        pulse1: 'Game Boy pulse channel 1 with sweep capability',
        pulse2: 'Game Boy pulse channel 2',
        wave: 'Game Boy wave channel (16×4-bit wavetable)',
        noise: 'Game Boy noise channel (LFSR-based)',
        oct: 'Octave shift transform. Example: `pat:oct(+1)`',
        rev: 'Reverse pattern. Example: `pat:rev`',
        slow: 'Slow down pattern (double duration). Example: `pat:slow`',
        fast: 'Speed up pattern (half duration). Example: `pat:fast`',
        transpose: 'Transpose pattern. Example: `pat:transpose(+2)`',
        effect: 'Defines a named effect preset. Example: `effect shimmer = vib:3,6`\nUse inline as `C4<shimmer>` in a pattern.',
        // Built-in inline effects
        arp: 'Arpeggio — cycles through semitone offsets per tick. Example: `C4<arp:0,4,7>` plays C-E-G arpeggio.',
        vib: 'Vibrato — oscillates pitch up/down. Example: `C4<vib:3,6>` (depth, speed). Waveform optional: `C4<vib:3,6,sine>`.',
        port: 'Portamento — slides pitch from previous note. Example: `E4<port:8>` (slide speed 0–15).',
        volSlide: 'Volume slide — ramps volume up or down over the note. Example: `C4<volSlide:-2>` (delta per tick).',
        trem: 'Tremolo — oscillates volume. Example: `C4<trem:4,8>` (depth, speed).',
        pan: 'Panning — sets stereo position. Example: `C4<pan:L>`, `C4<pan:R>`, `C4<pan:C>`.',
        echo: 'Echo/delay — repeats the note. Example: `C4<echo:3>` (delay ticks).',
        retrig: 'Retrigger — re-triggers the note rapidly. Example: `C4<retrig:2>` (interval ticks).',
        sweep: 'Frequency sweep (pulse1 only) — glides frequency up or down. Example: `C4<sweep:4,up,2>` (time, dir, shift).',
      };

      const doc = hoverDocs[word.word];
      if (doc) {
        return {
          contents: [{ value: doc }],
        };
      }

      if (latestAST?.insts && latestAST.insts[word.word]) {
        const inst = latestAST.insts[word.word];
        const props: string[] = [];

        if (inst.type) props.push(`type=${inst.type}`);
        if (inst.duty !== undefined) props.push(`duty=${inst.duty}`);
        if (inst.env !== undefined) {
          const envStr = typeof inst.env === 'string' ? inst.env : JSON.stringify(inst.env);
          props.push(`env=${envStr}`);
        }
        if (inst.wave !== undefined) {
          const waveStr = Array.isArray(inst.wave) ? `[${inst.wave.join(',')}]` : inst.wave;
          props.push(`wave=${waveStr}`);
        }
        if (inst.sweep !== undefined) {
          const sweepStr = typeof inst.sweep === 'string' ? inst.sweep : JSON.stringify(inst.sweep);
          props.push(`sweep=${sweepStr}`);
        }
        if (inst.noise !== undefined) {
          const noiseStr = typeof inst.noise === 'string' ? inst.noise : JSON.stringify(inst.noise);
          props.push(`noise=${noiseStr}`);
        }

        return {
          contents: [
            { value: `**Instrument**: \`${word.word}\`` },
            { value: "```beatbax\n" + props.join(' ') + "\n```" }
          ]
        };
      }

      if (latestAST?.effects && latestAST.effects[word.word]) {
        const effectVal = latestAST.effects[word.word];
        return {
          contents: [
            { value: `**Named Effect**: \`${word.word}\`` },
            { value: "```beatbax\neffect " + word.word + " = " + effectVal + "\n```" }
          ]
        };
      }

      return null;
    },
  });

  // Register document highlight provider.
  // Returns empty highlights for note tokens (C4, Bb3, G5 etc.) so that
  // clicking a note does not light up every other note in the file.
  // For all other identifiers (pattern/sequence/instrument names) every
  // whole-word occurrence is highlighted as normal.
  monaco.languages.registerDocumentHighlightProvider('beatbax', {
    provideDocumentHighlights: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      // Note tokens: natural (C3) or flat (Bb4, Ab3).
      // Sharp notes (C#4) are split by '#' so getWordAtPosition returns just
      // 'C' or '4' — neither matches, so they're left to the fallback below.
      if (/^[A-G]b?[0-8]$/.test(word.word)) {
        return [];
      }

      // For identifiers, highlight every whole-word occurrence in the document.
      const escaped = word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = model.findMatches(
        `\\b${escaped}\\b`,
        false, // searchOnlyEditableRange
        true,  // isRegex
        true,  // matchCase
        null,  // wordSeparators
        false, // captureMatches
      );

      return matches.map((match) => ({
        range: match.range,
        kind: monaco.languages.DocumentHighlightKind.Text,
      }));
    },
  });

  // Register document semantic tokens provider for colorizing parsed entities
  const semanticTokenTypes = ['instrument', 'pattern', 'sequence'];
  monaco.languages.registerDocumentSemanticTokensProvider('beatbax', {
    getLegend: function () {
      return {
        tokenTypes: semanticTokenTypes,
        tokenModifiers: [],
      };
    },
    provideDocumentSemanticTokens: function (model, lastResultId, token) {
      const versionId = model.getVersionId();

      // Fast path: same model version → return cached tokens without re-parsing
      if (tokenCache && tokenCache.versionId === versionId) {
        return { data: tokenCache.data, resultId: undefined };
      }

      // Use the AST already produced by the editor's parse:success subscriber to
      // avoid a redundant parse on the hot typing path.  Fall back to a fresh
      // parse only when no cached AST is available (e.g. on first load).
      let ast = latestAST;
      if (!ast) {
        const code = model.getValue();
        try {
          ast = parse(code);
        } catch (e) {
          // Return empty if parse fails, keeping old colors or falling back to Monarch
          return null;
        }
      }

      const instruments = new Set(Object.keys(ast.insts || {}));
      const patterns = new Set(Object.keys(ast.pats || {}));
      const sequences = new Set(Object.keys(ast.seqs || {}));

      const lines = model.getLinesContent();
      const tokens: number[] = [];
      let prevLine = 0;
      let prevChar = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comments early
        const commentIdx = line.indexOf('#');
        const textToSearch = commentIdx !== -1 ? line.substring(0, commentIdx) : line;

        const regex = /[a-zA-Z_]\w*/g;
        let match;
        while ((match = regex.exec(textToSearch)) !== null) {
          const word = match[0];

          let typeIdx = -1;
          if (instruments.has(word)) typeIdx = 0;
          else if (patterns.has(word)) typeIdx = 1;
          else if (sequences.has(word)) typeIdx = 2;

          if (typeIdx !== -1) {
            const startChar = match.index;
            const length = word.length;

            const deltaLine = i - prevLine;
            const deltaChar = deltaLine === 0 ? startChar - prevChar : startChar;

            tokens.push(deltaLine, deltaChar, length, typeIdx, 0);

            prevLine = i;
            prevChar = startChar;
          }
        }
      }

      const result = new Uint32Array(tokens);
      tokenCache = { versionId, data: result };
      return {
        data: result,
        resultId: undefined,
      };
    },
    releaseDocumentSemanticTokens: function (resultId) {},
  });

  // Define custom theme that styles our sequence modifiers
  monaco.editor.defineTheme('beatbax-dark', {
    base: 'vs-dark',
    inherit: true,
    // @ts-expect-error - Some monaco versions are missing this in types
    semanticHighlighting: true,
    rules: [
      { token: 'instrument', foreground: 'FFB86C' }, // Distinct Orange for semantic instruments
      { token: 'pattern', foreground: '8BE9FD' }, // Cyan for semantic patterns
      { token: 'sequence', foreground: '50FA7B' }, // Green for semantic sequences
      { token: 'function', foreground: 'C678DD' }, // Bright magenta/purple - inline effects
      { token: 'entity.name.function', foreground: 'C678DD' }, // Bright magenta/purple - sequence modifiers and effect presets
      { token: 'variable.name', foreground: 'DCDCAA' }, // Yellow - definition names (lead, melody, main, ambient)
      { token: 'attribute', foreground: '9CDCFE' }, // Light blue - property names (type, duty, env) and JSON keys
      { token: 'string', foreground: 'CE9178' }, // Orange - string values
      { token: 'number', foreground: 'CE9178' }, // Orange - numbers and values
      { token: 'number.note', foreground: '4EC9B0' }, // Cyan/teal - notes (stands out)
      { token: 'number.rest', foreground: '6A6A6A' }, // Dark gray - rests
      { token: 'constant.language', foreground: '4EC9B0' }, // Cyan/teal - URI schemes (local, https)
      { token: 'type', foreground: 'CE9178' }, // Orange - instrument types, export formats
      { token: 'identifier', foreground: 'DCDCAA' }, // Yellow - identifiers (instrument/pattern/seq references)
      { token: 'operator', foreground: 'D4D4D4' }, // White/gray - operators
      { token: 'delimiter', foreground: '808080' }, // Gray - delimiters
      { token: 'keyword', foreground: '569CD6' }, // Blue - keywords like pat, seq, inst
      { token: 'keyword.control', foreground: 'C586C0' }, // Purple - play, export
      { token: 'comment', foreground: '6A9955' }, // Typical green - comments
    ],
    colors: {},
  });

  // Define light theme
  monaco.editor.defineTheme('beatbax-light', {
    base: 'vs',
    inherit: true,
    // @ts-expect-error - Some monaco versions are missing this in types
    semanticHighlighting: true,
    rules: [
      { token: 'instrument', foreground: 'D97706' }, // Darker orange
      { token: 'pattern', foreground: '0284C7' }, // Blue/Cyan
      { token: 'sequence', foreground: '16A34A' }, // Green
      { token: 'function', foreground: '9333EA' }, // Purple
      { token: 'entity.name.function', foreground: '9333EA' }, // Bright magenta/purple
      { token: 'variable.name', foreground: '795E26' }, // Yellow - definition names
      { token: 'attribute', foreground: '001080' }, // Light blue - property names
      { token: 'string', foreground: 'A31515' }, // Orange - string values
      { token: 'number', foreground: '098658' }, // Orange - numbers
      { token: 'number.note', foreground: '007ACC' }, // Cyan - notes
      { token: 'number.rest', foreground: '808080' }, // Gray - rests
      { token: 'constant.language', foreground: '007ACC' }, // Cyan - URIs
      { token: 'type', foreground: '267F99' }, // Orange - types
      { token: 'identifier', foreground: '001080' }, // Yellow - identifiers
      { token: 'operator', foreground: '000000' }, // White/gray - operators
      { token: 'delimiter', foreground: '000000' }, // Gray - delimiters
      { token: 'keyword', foreground: '0000FF' }, // Blue - keywords
      { token: 'keyword.control', foreground: 'AF00DB' }, // Purple - keywords
      { token: 'comment', foreground: '008000' }, // Green - comments
    ],
    colors: {},
  });
}

// ─── Note transposition helpers ──────────────────────────────────────────────

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B',
};

interface NoteToken {
  note: string;
  range: monaco.IRange;
}

/**
 * Detect the note token (C4, Bb4, C#4, …) at `position`.
 * Sharp notes straddle a word boundary because `#` is a word separator, so we
 * inspect the character immediately after the word when needed.
 */
function getNoteAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
): NoteToken | null {
  const word = model.getWordAtPosition(position);
  if (!word) return null;

  // Natural / flat note: e.g. C4, Bb4, Ab3
  if (/^[A-G]b?[0-8]$/.test(word.word)) {
    return {
      note: word.word,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      },
    };
  }

  // Sharp note: word is just the letter (e.g. "C"), next chars should be "#<digit>"
  // word.endColumn is 1-based exclusive → string index is word.endColumn - 1
  if (/^[A-G]$/.test(word.word)) {
    const lineContent = model.getLineContent(position.lineNumber);
    const afterWord = lineContent.substring(word.endColumn - 1);
    const sharpMatch = afterWord.match(/^#([0-8])/);
    if (sharpMatch) {
      return {
        note: word.word + '#' + sharpMatch[1],
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn + 2, // '#' + octave digit
        },
      };
    }
  }

  return null;
}

/**
 * Transpose `note` by `semitones` half-steps.
 * Returns the new note string, or `null` if the result falls outside C0–B8.
 * Flat input notes are output as their sharp equivalent (Bb → A#).
 */
function transposeNote(note: string, semitones: number): string | null {
  const match = note.match(/^([A-G][#b]?)([0-8])$/);
  if (!match) return null;

  let pitchClass = match[1];
  const octave = parseInt(match[2], 10);

  if (FLAT_TO_SHARP[pitchClass]) pitchClass = FLAT_TO_SHARP[pitchClass];

  const idx = CHROMATIC_SCALE.indexOf(pitchClass);
  if (idx === -1) return null;

  const midiStep = octave * 12 + idx + semitones;
  const newOctave = Math.floor(midiStep / 12);
  const newIdx = ((midiStep % 12) + 12) % 12;

  if (newOctave < 0 || newOctave > 8) return null; // out of C0–B8 range

  return CHROMATIC_SCALE[newIdx] + newOctave;
}

/**
 * Apply a transposition to the note under the cursor.
 * Silently no-ops if the cursor is not on a note or the result is out of range.
 */
export function transposeCurrentNote(
  editor: monaco.editor.IStandaloneCodeEditor,
  semitones: number,
): void {
  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || !position) return;

  const token = getNoteAtPosition(model, position);
  if (!token) return;

  const newNote = transposeNote(token.note, semitones);
  if (!newNote) return;

  editor.executeEdits('note-transpose', [{ range: token.range, text: newNote }]);

  // Restore cursor inside the replacement token at the same relative offset
  const offset = Math.min(position.column - token.range.startColumn, newNote.length - 1);
  editor.setPosition({ lineNumber: position.lineNumber, column: token.range.startColumn + offset });
}

/**
 * Register note-transposition key commands on a Monaco editor instance.
 *
 * | Shortcut      | Action        |
 * | ------------- | ------------- |
 * | Alt+.         | Semitone up   |
 * | Alt+,         | Semitone down |
 * | Alt+Shift+.   | Octave up     |
 * | Alt+Shift+,   | Octave down   |
 *
 * Commands are editor-scoped and only fire when the editor has focus.
 */
export function registerNoteEditCommands(
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  const { KeyMod, KeyCode } = monaco;

  editor.addCommand(KeyMod.Alt | KeyCode.Period,                       () => transposeCurrentNote(editor,  1));
  editor.addCommand(KeyMod.Alt | KeyCode.Comma,                        () => transposeCurrentNote(editor, -1));
  editor.addCommand(KeyMod.Alt | KeyMod.Shift | KeyCode.Period,        () => transposeCurrentNote(editor,  12));
  editor.addCommand(KeyMod.Alt | KeyMod.Shift | KeyCode.Comma,         () => transposeCurrentNote(editor, -12));
}

