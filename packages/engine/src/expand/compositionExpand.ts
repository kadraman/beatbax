/**
 * Compile-time lowering for song composition abstractions (spec 008):
 * alias, cat(), section, form, channel role, Beginner Mode sugar.
 * Expands to existing seq / channel AST before normal sequence expansion.
 */

import type {
  ChannelNode,
  ParseDiagnostic,
  SequenceItem,
  SequenceItemMap,
  SeqMap,
  SourceLocation,
} from '../parser/ast.js';
import {
  materializeSequenceItems,
  normalizeSeqItems,
  parseSeqTransforms,
  type RawSeqItem,
  type RawSeqModifier,
} from '../parser/structured.js';

export interface AliasDecl {
  name: string;
  items: SequenceItem[];
  loc?: SourceLocation;
}

export interface SectionRoleDecl {
  role: string;
  items: SequenceItem[];
  loc?: SourceLocation;
}

export interface SectionDecl {
  name: string;
  roles: SectionRoleDecl[];
  /** Pending Beginner Mode `use` names; desugared at expand time. */
  beginnerUse?: string[];
  loc?: SourceLocation;
}

export interface FormDecl {
  name: string;
  sectionNames: string[];
  defaults?: { instruments: string[] };
  loc?: SourceLocation;
}

export type CatOperand =
  | { kind: 'ref'; name: string; modifiers: RawSeqModifier[]; raw?: string; loc?: SourceLocation }
  | { kind: 'cat'; operands: CatOperand[]; loc?: SourceLocation };

export interface CompositionExpandInput {
  aliases: Map<string, AliasDecl>;
  sections: Map<string, SectionDecl>;
  forms: Map<string, FormDecl>;
  /** Seq names whose RHS was `cat(...)` before flattening. */
  pendingCats: Map<string, CatOperand[]>;
  sequenceItems: SequenceItemMap;
  seqs: SeqMap;
  channels: Array<ChannelNode & { role?: string; formRef?: string; seqSpecTokens?: string[] }>;
  /** Pending `channel auto` lines (rhs after `auto`). */
  channelAutos: Array<{ rhs: string; loc?: SourceLocation }>;
  chip?: string;
  diagnostics: ParseDiagnostic[];
  /** Existing explicit seq names before section generation (for collision checks). */
  explicitSeqNames: Set<string>;
}

const BEGINNER_QUARTET = ['mel', 'harm', 'bass', 'perc'] as const;

/** Beginner Mode role list for a chip + lane count, or null if unsupported. */
export function beginnerRolesFor(chip: string | undefined, laneCount: number): string[] | null {
  const c = String(chip || 'gameboy').toLowerCase();
  const isNes = c === 'nes' || c === 'famicom';
  const isFourChDefault =
    !chip ||
    c === 'gameboy' ||
    c === 'sms' ||
    c === 'gg' ||
    c === 'gamegear' ||
    isNes;

  if (laneCount === 4 && isFourChDefault) {
    return [...BEGINNER_QUARTET];
  }
  if (laneCount === 5 && isNes) {
    return [...BEGINNER_QUARTET, 'dmc'];
  }
  return null;
}

const beginnerArityHint = (chip?: string): string => {
  const c = String(chip || '').toLowerCase();
  if (c === 'nes' || c === 'famicom') {
    return `NES Beginner Mode expects 4 roles (mel harm bass perc) or 5 (… dmc). Use advanced channel role bindings otherwise.`;
  }
  return `Beginner Mode expects exactly 4 roles (mel harm bass perc) on this chip. Use advanced channel role bindings otherwise.`;
};

const diag = (
  diagnostics: ParseDiagnostic[],
  level: ParseDiagnostic['level'],
  message: string,
  loc?: SourceLocation,
) => {
  diagnostics.push({ level, component: 'composition', message, loc });
};

const rawItemsToSequenceItems = (items?: RawSeqItem[]): SequenceItem[] =>
  normalizeSeqItems(items);

const flattenCatOperands = (
  operands: CatOperand[],
  diagnostics: ParseDiagnostic[],
  loc?: SourceLocation,
): SequenceItem[] => {
  const out: SequenceItem[] = [];
  const walk = (ops: CatOperand[]) => {
    for (const op of ops) {
      if (op.kind === 'cat') {
        walk(op.operands || []);
        continue;
      }
      out.push({
        name: op.name,
        transforms: parseSeqTransforms(op.modifiers || []),
        loc: op.loc,
        raw: op.raw,
      });
    }
  };
  walk(operands);
  if (out.length === 0) {
    diag(diagnostics, 'error', 'Empty cat() is not allowed.', loc);
  }
  return out;
};

const expandAliasItems = (
  items: SequenceItem[],
  aliases: Map<string, AliasDecl>,
  diagnostics: ParseDiagnostic[],
  stack: string[],
): SequenceItem[] => {
  const out: SequenceItem[] = [];
  for (const it of items) {
    const alias = aliases.get(it.name);
    if (!alias) {
      out.push(it);
      continue;
    }
    if (stack.includes(it.name)) {
      const cycle = [...stack, it.name].join(' → ');
      diag(diagnostics, 'error', `Alias cycle detected: ${cycle}.`, it.loc || alias.loc);
      continue;
    }
    const expanded = expandAliasItems(alias.items, aliases, diagnostics, [...stack, it.name]);
    // Alias body items inherit caller transforms only if the alias ref had transforms —
    // v1: alias ref with transforms applies to each expanded item's name token via materialize later.
    // Spec: when alias appears in seq RHS, expand to item list. Transforms on the alias token
    // are unusual; if present, append them to each leaf item.
    if (it.transforms && it.transforms.length > 0) {
      for (const leaf of expanded) {
        out.push({
          ...leaf,
          transforms: [...(leaf.transforms || []), ...it.transforms],
        });
      }
    } else {
      out.push(...expanded);
    }
  }
  return out;
};

const chipChannelCount = (chip?: string): number | undefined => {
  const c = String(chip || '').toLowerCase();
  if (!c || c === 'gameboy') return 4;
  if (c === 'sms' || c === 'gg' || c === 'gamegear') return 4;
  if (c === 'spectrum-128' || c === 'cpc' || c === 'amstrad-cpc') return 3;
  if (c === 'nes' || c === 'famicom') return 5;
  return undefined;
};

/**
 * Lower composition abstractions in place. Mutates input maps/arrays.
 */
export function expandComposition(input: CompositionExpandInput): void {
  const {
    aliases,
    sections,
    forms,
    pendingCats,
    sequenceItems,
    seqs,
    channels,
    channelAutos,
    chip,
    diagnostics,
    explicitSeqNames,
  } = input;

  // --- Beginner Mode: section … use → roles ---
  let beginnerLaneCount: number | undefined;
  for (const section of sections.values()) {
    const use = section.beginnerUse;
    if (!use || use.length === 0) continue;
    if (beginnerLaneCount === undefined) {
      beginnerLaneCount = use.length;
    } else if (use.length !== beginnerLaneCount) {
      diag(
        diagnostics,
        'error',
        `Beginner Mode section '${section.name}' has ${use.length} use-names but other Beginner sections use ${beginnerLaneCount}. All section … use lines must share the same lane count.`,
        section.loc,
      );
      continue;
    }
    const roles = beginnerRolesFor(chip, use.length);
    if (!roles) {
      diag(
        diagnostics,
        'error',
        `Beginner Mode section '${section.name}' use-arity ${use.length} is unsupported for chip '${chip || 'gameboy'}'. ${beginnerArityHint(chip)}`,
        section.loc,
      );
      continue;
    }
    section.roles = roles.map((role, i) => ({
      role,
      items: [{ name: use[i] }],
      loc: section.loc,
    }));
    delete section.beginnerUse;
  }

  // --- Flatten pending cat() into sequenceItems ---
  for (const [name, ops] of pendingCats) {
    const items = flattenCatOperands(ops, diagnostics, undefined);
    sequenceItems[name] = items;
    seqs[name] = materializeSequenceItems(items);
  }

  // --- Expand aliases inside every sequenceItems entry ---
  for (const name of Object.keys(sequenceItems)) {
    const items = sequenceItems[name] || [];
    const expanded = expandAliasItems(items, aliases, diagnostics, []);
    sequenceItems[name] = expanded;
    seqs[name] = materializeSequenceItems(expanded);
  }

  // --- Expand sections → synthetic seqs ---
  for (const section of sections.values()) {
    if (!section.roles || section.roles.length === 0) {
      diag(diagnostics, 'error', `Section '${section.name}' is empty.`, section.loc);
      continue;
    }
    const seenRoles = new Set<string>();
    for (const role of section.roles) {
      if (seenRoles.has(role.role)) {
        diag(diagnostics, 'error', `Duplicate role '${role.role}' in section '${section.name}'.`, role.loc || section.loc);
        continue;
      }
      seenRoles.add(role.role);
      const genName = `${section.name}_${role.role}`;
      if (explicitSeqNames.has(genName) || sequenceItems[genName]) {
        // Collision with explicit user seq (or earlier generated)
        if (explicitSeqNames.has(genName)) {
          diag(
            diagnostics,
            'error',
            `Generated sequence '${genName}' collides with an explicit seq declaration.`,
            role.loc || section.loc,
          );
          continue;
        }
      }
      const items = expandAliasItems(role.items, aliases, diagnostics, []);
      sequenceItems[genName] = items;
      seqs[genName] = materializeSequenceItems(items);
    }
  }

  // --- channel auto → concrete channels ---
  for (const auto of channelAutos) {
    const tokens = auto.rhs.split(/\s+/).filter(Boolean);
    let formRef: string | undefined;
    let instList: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === 'form' && tokens[i + 1]) {
        formRef = tokens[i + 1];
        i++;
      } else if (t.startsWith('inst=')) {
        instList = t.slice(5).split('|').map((s) => s.trim()).filter(Boolean);
      } else if (t === 'inst' && tokens[i + 1]) {
        const next = tokens[i + 1];
        instList = next.startsWith('=')
          ? next.slice(1).split('|').map((s) => s.trim()).filter(Boolean)
          : next.split('|').map((s) => s.trim()).filter(Boolean);
        i++;
      }
    }
    if (!formRef) {
      diag(diagnostics, 'error', `channel auto requires 'form <name>'.`, auto.loc);
      continue;
    }
    if (beginnerLaneCount !== undefined && instList.length !== beginnerLaneCount) {
      diag(
        diagnostics,
        'error',
        `channel auto inst= arity (${instList.length}) must match Beginner section use lane count (${beginnerLaneCount}).`,
        auto.loc,
      );
      continue;
    }
    const roles = beginnerRolesFor(chip, instList.length);
    if (!roles) {
      diag(
        diagnostics,
        'error',
        `channel auto inst= arity ${instList.length} is unsupported for chip '${chip || 'gameboy'}'. ${beginnerArityHint(chip)}`,
        auto.loc,
      );
      continue;
    }
    const count = chipChannelCount(chip);
    if (count !== undefined && roles.length > count) {
      diag(
        diagnostics,
        'error',
        `channel auto (Beginner Mode) would bind ${roles.length} channels but '${chip}' has ${count}. Use advanced channel role bindings.`,
        auto.loc,
      );
      continue;
    }
    if (channels.some((c) => c.role || c.formRef)) {
      diag(diagnostics, 'error', `channel auto cannot mix with other role/form channel bindings.`, auto.loc);
      continue;
    }
    if (channels.length > 0) {
      diag(diagnostics, 'error', `channel auto must be the only channel binding (found existing channels).`, auto.loc);
      continue;
    }
    for (let i = 0; i < roles.length; i++) {
      channels.push({
        id: i + 1,
        inst: instList[i],
        role: roles[i],
        formRef,
        loc: auto.loc,
      });
    }
  }

  // --- form + channel role → timeline seq list on channel ---
  for (const ch of channels) {
    if (!ch.role && !ch.formRef) continue;
    if (!ch.role || !ch.formRef) {
      diag(diagnostics, 'error', `channel ${ch.id}: both 'role' and 'form' are required together.`, ch.loc);
      continue;
    }
    const form = forms.get(ch.formRef);
    if (!form) {
      diag(diagnostics, 'error', `channel ${ch.id}: unknown form '${ch.formRef}'.`, ch.loc);
      continue;
    }
    if (form.defaults?.instruments?.length && !ch.inst) {
      const idx = ch.id - 1;
      if (idx >= 0 && idx < form.defaults.instruments.length) {
        ch.inst = form.defaults.instruments[idx];
      }
    }
    const timeline: string[] = [];
    for (const sectionName of form.sectionNames) {
      const section = sections.get(sectionName);
      if (!section) {
        diag(diagnostics, 'error', `form '${form.name}' references unknown section '${sectionName}'.`, form.loc || ch.loc);
        continue;
      }
      const hasRole = section.roles.some((r) => r.role === ch.role);
      if (!hasRole) {
        diag(
          diagnostics,
          'error',
          `channel ${ch.id} role '${ch.role}': section '${sectionName}' does not define that role.`,
          ch.loc || section.loc,
        );
        continue;
      }
      timeline.push(`${sectionName}_${ch.role}`);
    }
    ch.pat = timeline.join(' ');
    ch.seqSpecTokens = timeline.slice();
    delete ch.role;
    delete ch.formRef;
  }
}

/** Build AliasDecl / SectionDecl helpers from Peggy stmts. */
export function sequenceItemsFromRaw(items?: RawSeqItem[]): SequenceItem[] {
  return rawItemsToSequenceItems(items);
}

/** Store a Beginner `section … use` for desugar in `expandComposition` (chip-aware). */
export function sectionFromBeginnerUse(
  name: string,
  beginnerUse: string[],
  loc?: SourceLocation,
): SectionDecl {
  return {
    name,
    loc,
    roles: [],
    beginnerUse: beginnerUse.slice(),
  };
}

export { flattenCatOperands, expandAliasItems };
