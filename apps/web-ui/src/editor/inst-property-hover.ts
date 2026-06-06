/**
 * Hover helpers for instrument property assignments on `inst` lines
 * (e.g. `duty=50`, `vol=10`, `type=pulse1`, `noise_rate=2`).
 */

import type * as monaco from 'monaco-editor';
import { chipRegistry } from '@beatbax/engine/chips';
import {
  getChipInstrumentMeta,
  getInstPropertyCompletions,
  getInstPropertyNamesForChip,
} from './instrument-meta';

export interface ParsedInstProperty {
  property: string;
  value: string;
  range: monaco.IRange;
}

const ASSIGNMENT_VALUE_RE =
  /=\s*([A-Za-z][\w.-]*|\d+(?:\.\d+)?)/;

function resolveChip(chip: string): string {
  return chipRegistry.resolve(chip);
}

/** Property names that may show a keyword hover on `inst` lines. */
function getKeywordHoverProperties(chip: string): Set<string> {
  const canonical = resolveChip(chip);
  const names = new Set(getInstPropertyNamesForChip(canonical));
  const docs = chipRegistry.get(canonical)?.uiContributions?.hoverDocs ?? {};
  for (const key of Object.keys(docs)) {
    if (!key.includes(':')) names.add(key);
  }
  return names;
}

function getValueHoverProperties(chip: string): Set<string> {
  const canonical = resolveChip(chip);
  const names = getKeywordHoverProperties(chip);
  // Values are only rendered for a focused subset; macros use dedicated hovers.
  const valueProps = [
    'type', 'vol', 'duty', 'noise_mode', 'noise_rate', 'tone', 'tone_mix',
    'env_bass', 'env_shape', 'noise_frames', 'tone_frames', 'tone_vol', 'chipRegion',
  ];
  return new Set([...names].filter((key) => valueProps.includes(key)));
}

interface InstAssignmentMatch {
  property: string;
  propStart: number;
  propEnd: number;
  value: string;
  valueStart: number;
  tokenEnd: number;
}

function iterInstAssignments(
  line: string,
  allowedProperties: Set<string>,
): InstAssignmentMatch[] {
  const matches: InstAssignmentMatch[] = [];
  const re = /\b([a-z][a-z0-9_]*)\s*=/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    const property = match[1].toLowerCase();
    if (!allowedProperties.has(property)) continue;

    const propStart = match.index;
    const propEnd = propStart + match[1].length;
    const valueMatch = ASSIGNMENT_VALUE_RE.exec(line.slice(propEnd));
    if (!valueMatch) continue;

    const value = valueMatch[1];
    const assignStart = propEnd + valueMatch.index!;
    const valueStart = assignStart + valueMatch[0].indexOf(value);
    const tokenEnd = assignStart + valueMatch[0].length;

    matches.push({ property, propStart, propEnd, value, valueStart, tokenEnd });
  }

  return matches;
}

function parseAssignmentAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
  allowedProperties: Set<string>,
  onKeyword: boolean,
): ParsedInstProperty | null {
  const line = model.getLineContent(position.lineNumber);
  if (!/^\s*inst\s+/.test(line)) return null;

  const col0 = position.column - 1;

  for (const entry of iterInstAssignments(line, allowedProperties)) {
    const { property, propStart, propEnd, value, valueStart, tokenEnd } = entry;
    if (col0 < propStart || col0 >= tokenEnd) continue;

    const onPropName = col0 >= propStart && col0 < propEnd;
    const onValue = col0 >= valueStart && col0 < tokenEnd;
    if (onKeyword && !onPropName) continue;
    if (!onKeyword && !onValue) continue;

    return {
      property,
      value,
      range: onKeyword
        ? {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: propStart + 1,
          endColumn: propEnd + 1,
        }
        : {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: propStart + 1,
          endColumn: tokenEnd + 1,
        },
    };
  }

  return null;
}

const DUTY_LABELS: Record<string, string> = {
  '12': 'Thin, bright, cutting',
  '12.5': 'Thin, bright, cutting',
  '25': 'Classic hollow square',
  '50': 'Balanced, full-sounding',
  '75': 'Dark, thick (inverted 25%)',
};

function buildDutyValueMarkdown(value: string): string {
  const label = DUTY_LABELS[value] ?? DUTY_LABELS[String(parseFloat(value))];
  const lines = [
    `**Duty cycle ${value}%** — pulse channel pulse width.`,
  ];
  if (label) lines.push('', label);
  lines.push(
    '',
    'Valid values: `12` · `12.5` · `25` · `50` · `75`',
    '',
    'Example: `inst lead type=pulse1 duty=25 env=13,down`',
  );
  return lines.join('\n');
}

function buildVolValueMarkdown(value: string, chip: string, instType?: string): string {
  const level = Number.parseInt(value, 10);
  const canonical = resolveChip(chip);

  if (canonical === 'sms') {
    const lines = [
      `**Volume ${value}** — SN76489 attenuation **0–15** (**0 = loudest**, **15 = silent**).`,
    ];
    if (Number.isFinite(level)) {
      if (level === 0) {
        lines.push('', '**Maximum level** — no attenuation.');
      } else if (level === 15) {
        lines.push('', '**Mute** — full attenuation.');
      } else {
        const loudness = Math.round(((15 - level) / 15) * 100);
        lines.push('', `Approximately **${loudness}%** of maximum SMS level.`);
      }
    }
    lines.push(
      '',
      'Use `vol_env=[…]` for decay and dynamics; static `vol` is overridden by an active macro.',
      '',
      'Example: `inst lead type=tone1 vol=10`',
    );
    return lines.join('\n');
  }

  const lines = [
    `**Volume ${value}** — constant amplitude **0–15**.`,
  ];

  if (Number.isFinite(level)) {
    if (level === 0) {
      lines.push('', '**Mute** — silences the channel.');
    } else {
      const pct = Math.round((level / 15) * 100);
      lines.push('', `Approximately **${pct}%** of maximum channel level.`);
    }
  }

  if (canonical === 'spectrum-128') {
    lines.push(
      '',
      '**0 = silent** · **15 = loudest**. Use `vol_env` for hardware envelope (global, one at a time).',
      'For independent drum decay, combine fixed `vol` with `volSlide` on pattern notes.',
    );
  } else if (instType === 'triangle') {
    lines.push(
      '',
      '_Triangle hardware is always at full level; only `vol=0` has an audible effect._',
    );
  } else {
    lines.push(
      '',
      'Bypasses hardware envelope decay — use instead of `env=` for a flat level.',
      'Overridden when `vol_env=[…]` is present.',
    );
  }

  return lines.join('\n');
}

function buildNoiseModeValueMarkdown(value: string): string {
  const mode = value.toLowerCase();
  if (mode === 'white') {
    return [
      '**noise_mode=white** — full-bandwidth white noise.',
      '',
      'LFSR feedback from bits 0 and 1; long period (~32767 samples).',
      'Best for kicks, snares, and broad percussion.',
      '',
      'Example: `inst kick type=noise noise_mode=white noise_rate=2 vol_env=[0,4,8,12,15]`',
    ].join('\n');
  }
  if (mode === 'periodic') {
    return [
      '**noise_mode=periodic** — short-period metallic noise.',
      '',
      'LFSR feedback from bits 0 and 6; ~93-sample period, more tonal character.',
      'Useful for special FX and metallic textures.',
      '',
      'Example: `inst fx type=noise noise_mode=periodic noise_rate=1 vol=10`',
    ].join('\n');
  }
  return [
    `**noise_mode=${value}** — use \`white\` or \`periodic\`.`,
  ].join('\n');
}

function buildNoiseRateValueMarkdown(value: string, chip: string): string {
  const canonical = resolveChip(chip);
  if (canonical === 'spectrum-128') {
    const labels: Record<string, string> = {
      '0': 'Fastest / brightest noise (global R6)',
      '4': 'Typical kick attack range',
      '6': 'Typical snare body range',
      '10': 'Shared rate for multiplexed drum kits',
    };
    const label = labels[value];
    const lines = [
      `**noise_rate=${value}** — AY R6 noise period (**0–31**, global).`,
    ];
    if (label) lines.push('', label);
    lines.push(
      '',
      '⚠ Only one noise period is active per chip tick — use the same value for overlapping hits.',
      '',
      'Example: `inst kick type=tone3 tone_mix=true noise_rate=4 note=C3`',
    );
    return lines.join('\n');
  }

  const labels: Record<string, string> = {
    '0': 'Highest frequency (clock ÷ 128) — hi-hats, bright noise',
    '1': 'Medium frequency (clock ÷ 256) — snare range',
    '2': 'Lowest frequency (clock ÷ 512) — kicks, boomy transients',
    tone3: 'Follows Tone 3 period — synced kick/bass noise',
  };
  const label = labels[value] ?? labels[value.toLowerCase()];
  const lines = [
    `**noise_rate=${value}** — SN76489 noise clock divisor.`,
  ];
  if (label) lines.push('', label);
  lines.push(
    '',
    'Valid values: `0` · `1` · `2` · `tone3`',
    '',
    'Example: `inst kick type=noise noise_mode=white noise_rate=2 vol=5`',
  );
  return lines.join('\n');
}

function buildTypeValueMarkdown(value: string, chip: string): string | null {
  const canonical = resolveChip(chip);
  const chipDoc = chipRegistry.get(canonical)?.uiContributions?.hoverDocs?.[value];
  if (chipDoc) return chipDoc;

  const meta = getChipInstrumentMeta(canonical);
  if (!meta.types.includes(value)) return null;

  const chipLabel = canonical === 'nes' ? 'NES'
    : canonical === 'sms' ? 'SMS'
      : canonical === 'gameboy' ? 'Game Boy'
        : canonical === 'spectrum-128' ? 'Spectrum 128 / AY'
          : canonical;

  return [
    `**${value}** — ${chipLabel} instrument channel type.`,
    '',
    `Valid types: ${meta.types.map((t) => `\`${t}\``).join(' · ')}`,
  ].join('\n');
}

function buildPropertyKeywordMarkdown(property: string, chip: string): string | null {
  const canonical = resolveChip(chip);
  const chipDoc = chipRegistry.get(canonical)?.uiContributions?.hoverDocs?.[property];
  if (chipDoc) return chipDoc;

  const meta = getInstPropertyCompletions(canonical, property);
  if (!meta) return null;

  const lines = [`**${property}**`];
  if (meta.detail) lines.push(meta.detail);
  if (meta.values?.length) {
    lines.push('', `Values: ${meta.values.map((v) => `\`${v}\``).join(' · ')}`);
  }
  return lines.join('\n');
}

function parseInstTypeFromLine(line: string): string | undefined {
  const match = /\btype\s*=\s*([a-zA-Z][\w-]*)/.exec(line);
  return match?.[1]?.toLowerCase();
}

/** Hover when the cursor is on a property **name** (`type`, `vol`, …) in an `inst` line. */
export function buildInstPropertyKeywordHover(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
  chip: string,
): monaco.languages.Hover | null {
  const parsed = parseAssignmentAtPosition(
    model,
    position,
    getKeywordHoverProperties(chip),
    true,
  );
  if (!parsed) return null;

  const markdown = buildPropertyKeywordMarkdown(parsed.property, chip);
  if (!markdown) return null;

  return {
    range: parsed.range,
    contents: [{ value: markdown }],
  };
}

/** Hover when the cursor is on a property **value** (`tone1`, `10`, …) in an `inst` line. */
export function buildInstPropertyHover(
  model: monaco.editor.ITextModel,
  position: monaco.IPosition,
  chip: string,
): monaco.languages.Hover | null {
  const parsed = parseAssignmentAtPosition(
    model,
    position,
    getValueHoverProperties(chip),
    false,
  );
  if (!parsed) return null;

  const line = model.getLineContent(position.lineNumber);
  const instType = parseInstTypeFromLine(line);

  let markdown: string | null = null;
  switch (parsed.property) {
    case 'duty':
      markdown = buildDutyValueMarkdown(parsed.value);
      break;
    case 'vol':
      markdown = buildVolValueMarkdown(parsed.value, chip, instType);
      break;
    case 'type':
      markdown = buildTypeValueMarkdown(parsed.value, chip);
      break;
    case 'noise_mode':
      markdown = buildNoiseModeValueMarkdown(parsed.value);
      break;
    case 'noise_rate':
      markdown = buildNoiseRateValueMarkdown(parsed.value, chip);
      break;
    default: {
      const chipDoc = chipRegistry.get(resolveChip(chip))?.uiContributions?.hoverDocs?.[parsed.property];
      if (chipDoc && /^(true|false|\d+)$/i.test(parsed.value)) {
        markdown = chipDoc;
      }
      break;
    }
  }

  if (!markdown) return null;

  return {
    range: parsed.range,
    contents: [{ value: markdown }],
  };
}
