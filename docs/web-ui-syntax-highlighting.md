# Web UI Syntax Highlighting

## Overview

The BeatBax web-ui uses Monaco Editor with a custom language definition and theme (`beatbax-dark`) to provide comprehensive syntax highlighting for `.bax` files. This document describes all syntax elements that are color-coded and their default colors.

## Color Scheme

The `beatbax-dark` theme is based on VS Code's `vs-dark` theme with customizations for BeatBax-specific tokens.

### Token Types and Colors

| Element | Color | Hex Code | Token Type | Example |
|---------|-------|----------|------------|---------|
| **Keywords** | Blue | `#569CD6` | `keyword` | `song`, `chip`, `inst`, `pat`, `seq`, `effect`, `arrange`, `channel`, `from`, `auto`, `repeat` |
| **Control Keywords** | Purple/Pink | `#C586C0` | `keyword.control` | `play`, `export` |
| **Definition Names** | Yellow | `#DCDCAA` | `variable.name` | Instrument names, pattern names, sequence names, effect names |
| **Property Names** | Light Blue | `#9CDCFE` | `attribute` | `type`, `duty`, `env`, `wave`, `sweep`, `volume`, `gm`, `length`, `note`, `width`, `inst`, `defaults`, `name`, `artist`, `tags`, etc. |
| **Effect Functions** | Magenta | `#C678DD` | `function` | `vib`, `port`, `arp`, `volSlide`, `trem`, `pan`, `echo`, `retrig`, `sweep` |
| **Sequence Modifiers** | Magenta | `#C678DD` | `entity.name.function` | `:oct`, `:inst`, `:rev`, `:slow`, `:fast`, `:transpose`, user-defined presets |
| **Inline Effects** | Magenta | `#C678DD` | `function` | `<echo:0.5,30,20>`, `<vib:3,6>` |
| **String Values** | Orange | `#CE9178` | `string` | `"Sample Song"`, string parameters in JSON objects |
| **Numbers** | Orange | `#CE9178` | `number` | `120`, `12.5`, numeric parameters |
| **Notes** | Cyan/Teal | `#4EC9B0` | `number.note` | `C4`, `F#5`, `Bb3` |
| **Rests** | Dark Gray | `#6A6A6A` | `number.rest` | `.` (rest token) |
| **Identifiers** | Yellow | `#DCDCAA` | `identifier` | Instrument/pattern/sequence references in usage |
| **Constants** | Cyan/Teal | `#4EC9B0` | `constant.language` | `local`, `github`, `https`, `file` (URI schemes), `json`, `midi`, `uge`, `wav` (export formats) |
| **Types** | Orange | `#CE9178` | `type` | `pulse1`, `pulse2`, `wave`, `noise`, `gameboy`, `gb`, `dmg` |
| **Comments** | Green | `#6A9955` | `comment` | `# This is a comment` |
| **Operators** | White/Gray | `#D4D4D4` | `operator` | `=>`, `:`, `=`, `*`, `+`, `-` |
| **Delimiters** | Gray | `#808080` | `delimiter` | `(`, `)`, `[`, `]`, `{`, `}`, `,` |

## Syntax Elements

### Metadata Directives

```beatbax
song name "Sample Song"
song artist "kadraman"
song description """Multi-line description"""
song tags "example,demo"
```

- `song` → Blue (keyword)
- `name`, `artist`, `description`, `tags` → Light Blue (property)
- String values → Orange

### Top-Level Directives

```beatbax
chip gameboy
bpm 120
time 4
volume 80
```

- Directive names (`chip`, `bpm`, `time`, `volume`) → Blue (keyword)
- Values → Orange (numbers) or Orange (type for `gameboy`)

### Instrument Definitions

```beatbax
inst leadA type=pulse1 duty=60 env={"level":12,"direction":"down","period":1,"format":"gb"} gm=81
inst wave1 type=wave wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3] gm=82
inst snare type=noise gb:width=7 env={"level":12,"direction":"down"} note=C5
```

- `inst` → Blue (keyword)
- `leadA`, `wave1`, `snare` → Yellow (definition name)
- `type`, `duty`, `env`, `wave`, `gm`, `note`, `width` → Light Blue (property)
- `pulse1`, `pulse2`, `wave`, `noise` → Orange (type)
- `gb` in `gb:width` → Orange (namespace)
- JSON property names (`"level"`, `"direction"`) → Light Blue
- JSON string values (`"down"`, `"gb"`) → Orange
- Numbers → Orange

### Pattern Definitions

```beatbax
pat melody_pat = C5 E5 G5 C6 . F5 E5 D5
pat drums_pat = (snare . . .) (snare . hihat .)
```

- `pat` → Blue (keyword)
- `melody_pat`, `drums_pat` → Yellow (definition name)
- Notes (`C5`, `E5`, `G5`) → Cyan/Teal
- Rests (`.`) → Dark Gray
- Instrument references (`snare`, `hihat`) → Yellow (identifier)

### Sequence Definitions

```beatbax
seq lead_seq = melody_pat melody_alt_pat fill_pat
seq bass_seq = bass_pat:inst(bass_deep) bass_pat:oct(-1)
```

- `seq` → Blue (keyword)
- `lead_seq`, `bass_seq` → Yellow (definition name)
- Pattern references (`melody_pat`, `bass_pat`) → Yellow (identifier)
- Modifiers (`:inst`, `:oct`) → Magenta
- Modifier parameters → varies (identifiers in yellow, numbers in orange)

### Inline Effects

```beatbax
pat vib_pat = C5<vib:3,6> E5 G5<echo:0.5,30,20>
```

- Effect names (`vib`, `echo`) → Magenta
- Parameters → Orange (numbers)

### Arrangement Blocks

```beatbax
arrange main defaults(inst=leadA|leadB|wave1|perc) {
   lead_seq  | bass_seq | wave_seq | drums_seq
   lead2_seq | bass_seq | wave_seq:oct(-1) | drums_seq
}
```

- `arrange` → Blue (keyword)
- `main` → Yellow (arrangement name)
- `defaults` → Light Blue (property)
- `inst` → Light Blue (property)
- Instrument names → Yellow (identifiers)
- Sequence names → Yellow (identifiers)
- Modifiers → Magenta

### Channel Mappings

```beatbax
channel 1 => inst leadA seq lead_seq lead_seq
channel 2 => inst leadB seq bass_seq:oct(-1)
```

- `channel` → Blue (keyword)
- Channel number → Orange
- `inst`, `seq` → Light Blue (property)
- Instrument/sequence names → Yellow (identifiers)
- Modifiers → Magenta

### Import Statements

```beatbax
import "local:lib/gameboy-common.ins"
import "github:beatbax/instruments-gb/main/melodic.ins"
import "https://example.com/instruments.ins"
```

- `import` → Blue (keyword)
- URI schemes (`local`, `github`, `https`) → Cyan/Teal (constant)
- `:` → Gray (operator)
- Path → Orange (string)

### Playback Directives

```beatbax
play auto repeat
```

- `play` → Purple/Pink (control keyword)
- `auto`, `repeat` → Blue (keyword)

### Export Commands

```beatbax
export json "song.json"
export midi "song.mid"
export uge "song.uge"
export wav "song.wav"
```

- `export` → Purple/Pink (control keyword)
- Format names (`json`, `midi`, `uge`, `wav`) → Cyan/Teal (constant)
- File paths → Orange (string)

### Comments

```beatbax
# This is a single-line comment
## This is also a comment
```

- All comment text → Green

## Validation Highlighting

The editor provides real-time validation with error markers:

- **Syntax Errors**: Red squiggly underlines for parse errors
- **Undefined References**: Red squiggly underlines for:
  - Undefined instrument names in patterns
  - Undefined pattern names in sequences
  - Undefined sequence names in channels
  - Undefined instruments in `inst()` modifiers

Hover over any error marker to see the detailed error message.

## Customization

### Making Colors Configurable

Yes, the colors are fully customizable! The syntax highlighting system consists of two parts:

1. **Tokenizer** (`apps/web-ui/src/editor/beatbax-language.ts`): 
   - Defines which tokens get which token types
   - Token types are semantic labels (e.g., `keyword`, `function`, `attribute`)
   - Changing tokenizer rules requires code changes

2. **Theme** (`beatbax-dark` in same file):
   - Maps token types to colors
   - Can be easily customized by users
   - Multiple themes can be defined

### To Add Custom Themes

Users can define their own themes by:

1. Creating a new theme object in their code:
```typescript
monaco.editor.defineTheme('my-custom-theme', {
  base: 'vs-dark', // or 'vs-light'
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'YOUR_COLOR' },
    { token: 'function', foreground: 'YOUR_COLOR' },
    // ... more custom colors
  ],
  colors: {},
});
```

2. Setting the theme:
```typescript
monaco.editor.setTheme('my-custom-theme');
```

### Future Theme Configuration

Planned features for making themes user-configurable:

- **Settings Panel**: UI for customizing colors without code changes
- **Theme Presets**: Multiple built-in themes (light, dark, high-contrast)
- **Theme Export/Import**: Save and share custom themes as JSON
- **Per-User Preferences**: Persist theme choices in localStorage

The architecture is already theme-ready — adding UI controls is straightforward.

## Implementation Details

### File Locations

- **Language Definition**: `apps/web-ui/src/editor/beatbax-language.ts`
  - Monarch tokenizer rules
  - Theme definitions
  - Hover documentation

- **Monaco Setup**: `apps/web-ui/src/editor/monaco-setup.ts`
  - Editor creation
  - Global configuration

- **Validation**: `apps/web-ui/src/main-phase1.ts`
  - Real-time validation logic
  - Error marker generation

### Token Type Reference

Monaco uses a hierarchical token naming system. Here are the token types used by BeatBax:

- `keyword` - Language keywords
- `keyword.control` - Control flow keywords
- `variable.name` - Named definitions
- `attribute` - Property names and attributes
- `function` - Function/effect names
- `entity.name.function` - Special function references
- `string` - String literals
- `string.quote` - String delimiters
- `number` - Numeric literals
- `number.note` - Musical notes
- `number.rest` - Rest tokens
- `identifier` - Generic identifiers
- `constant.language` - Built-in constants
- `type` - Type names
- `comment` - Comments
- `operator` - Operators
- `delimiter` - Delimiters and brackets

## See Also

- [Web UI Migration Plan](features/web-ui-migration.md) - Architecture overview
- [Monaco Editor Documentation](https://microsoft.github.io/monaco-editor/)
- [Monarch Tokenizer Guide](https://microsoft.github.io/monaco-editor/monarch.html)
