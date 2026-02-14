/**
 * BeatBax language definition for Monaco Editor
 * Provides syntax highlighting, autocomplete, and language features
 */

import * as monaco from 'monaco-editor';

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
        arp: 'Arpeggio effect. Example: `pat:arp(0,3,7)`',
      };

      const doc = hoverDocs[word.word];
      if (doc) {
        return {
          contents: [{ value: doc }],
        };
      }

      return null;
    },
  });

  // Define custom theme that styles our sequence modifiers
  monaco.editor.defineTheme('beatbax-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
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
}
