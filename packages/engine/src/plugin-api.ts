/**
 * Plugin API entry point — exports only the types and runtime objects needed
 * by external chip plugins. This file is safe to import in Jest tests because
 * it does NOT reference `import.meta` (unlike the main `index.ts`).
 *
 * External plugins should import from `@beatbax/engine` in production code;
 * Jest tests can map that to this file to avoid ESM/import.meta issues.
 */

// ─── AST types ────────────────────────────────────────────────────────────────
export type {
  InstrumentNode,
  InstMap,
  AST,
  ChannelNode,
  EnvelopeAST,
  SweepAST,
  NoiseAST,
} from './parser/ast.js';

// ─── Plugin system ────────────────────────────────────────────────────────────
export type { ChipPlugin, ChipChannelBackend, ValidationError } from './chips/types.js';
export { ChipRegistry, chipRegistry, gameboyPlugin } from './chips/index.js';
export type { ExporterPlugin, ExportOptions, ExporterUIContribution } from './export/types.js';
export { ExporterRegistry, exporterRegistry } from './export/registry.js';
export { BeatBaxEngine } from './engine.js';
