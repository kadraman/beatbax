/**
 * Browser-safe import resolution for .ins files.
 * Only supports remote HTTP(S) imports - local file imports are blocked in browser contexts.
 * This module does NOT import Node.js built-ins (fs, path) to ensure compatibility with browser bundlers.
 */

import { AST, InstMap } from '../parser/ast.js';
import { parse } from '../parser/index.js';
import { isRemoteImport, isLocalImport } from '../import/urlUtils.js';
import { RemoteInstrumentCache, RemoteImportOptions } from '../import/remoteCache.js';

export interface ImportResolverOptions {
  /** Strict mode: treat instrument name overrides as errors instead of warnings */
  strictMode?: boolean;
  /** Warning handler */
  onWarn?: (message: string, loc?: any) => void;
  /** Remote import options (timeout, HTTPS-only, etc.) */
  remoteOptions?: RemoteImportOptions;
  /** Remote instrument cache (reused across multiple resolve calls) */
  remoteCache?: RemoteInstrumentCache;
  
  // Note: File system options are not supported in browser context
  // The following options from the Node version are intentionally omitted:
  // - baseFilePath, searchPaths, readFile, fileExists, allowAbsolutePaths
}

interface ImportContext {
  importStack: string[];
  options: ImportResolverOptions;
  remoteCache?: RemoteInstrumentCache;
}

/**
 * Validate that an AST contains only allowed node types for .ins files.
 */
function validateInsFile(ast: AST, source: string): void {
  // .ins files should only contain instrument definitions and imports
  const disallowed: string[] = [];
  
  // Playback/structure directives
  if (Object.keys(ast.pats || {}).length > 0) disallowed.push('patterns');
  if (Object.keys(ast.seqs || {}).length > 0) disallowed.push('sequences');
  if ((ast.channels || []).length > 0) disallowed.push('channels');
  if (ast.arranges && Object.keys(ast.arranges).length > 0) disallowed.push('arranges');
  if (ast.play !== undefined) disallowed.push('play');
  
  // Top-level scalar directives (should not be in .ins files)
  if (ast.chip !== undefined) disallowed.push('chip');
  if (ast.bpm !== undefined) disallowed.push('bpm');
  if (ast.volume !== undefined) disallowed.push('volume');
  
  // Metadata
  if (ast.metadata !== undefined && Object.keys(ast.metadata).length > 0) {
    disallowed.push('metadata');
  }
  
  // Effect definitions
  if (ast.effects && Object.keys(ast.effects).length > 0) disallowed.push('effects');
  
  // Pattern events and structured patterns
  if (ast.patternEvents && Object.keys(ast.patternEvents).length > 0) {
    disallowed.push('patternEvents');
  }
  if (ast.sequenceItems && Object.keys(ast.sequenceItems).length > 0) {
    disallowed.push('sequenceItems');
  }
  
  // Check for any other non-standard properties that might be added
  const allowedKeys = new Set([
    'insts', 'imports', 'pats', 'seqs', 'channels', 'arranges', 'play',
    'chip', 'bpm', 'volume', 'metadata', 'effects', 'patternEvents', 'sequenceItems'
  ]);
  
  for (const key of Object.keys(ast)) {
    if (!allowedKeys.has(key) && key !== 'insts' && key !== 'imports') {
      disallowed.push(`unknown property '${key}'`);
    }
  }

  if (disallowed.length > 0) {
    throw new Error(
      `Invalid .ins file "${source}": .ins files may only contain "inst" and "import" declarations. ` +
      `Found: ${disallowed.join(', ')}`
    );
  }
}

/**
 * Load and parse a remote import file.
 */
async function loadRemoteImportFile(
  url: string,
  ctx: ImportContext
): Promise<InstMap> {
  // Check for import cycles
  if (ctx.importStack.includes(url)) {
    const cycle = [...ctx.importStack, url].join(' -> ');
    throw new Error(`Import cycle detected: ${cycle}`);
  }

  // Get or create remote cache
  if (!ctx.remoteCache) {
    ctx.remoteCache = new RemoteInstrumentCache(ctx.options.remoteOptions);
  }

  // Add to import stack
  ctx.importStack.push(url);

  try {
    // Fetch from remote cache (handles caching internally)
    const instruments = await ctx.remoteCache.fetch(url);
    return instruments;
  } finally {
    // Remove from import stack
    ctx.importStack.pop();
  }
}

/**
 * Load and parse an import file (remote only in browser).
 */
async function loadImportFile(
  importSource: string,
  ctx: ImportContext
): Promise<InstMap> {
  // Block local imports in browser
  if (isLocalImport(importSource)) {
    throw new Error(
      `Local imports are not supported in the browser for security reasons. ` +
      `Import "${importSource}" cannot be loaded. ` +
      `Use remote imports (https:// or github:) instead.`
    );
  }

  // Only remote imports are supported in browser
  if (!isRemoteImport(importSource)) {
    throw new Error(
      `Invalid import "${importSource}": Browser environment only supports remote imports. ` +
      `Use "https://", "http://", or "github:" prefix for remote imports. ` +
      `Local file imports require CLI environment.`
    );
  }

  return await loadRemoteImportFile(importSource, ctx);
}

/**
 * Merge instrument maps with last-win semantics.
 */
function mergeInstruments(
  base: InstMap,
  override: InstMap,
  sourcePath: string,
  ctx: ImportContext
): InstMap {
  const result = { ...base };

  for (const [name, inst] of Object.entries(override)) {
    if (result[name] !== undefined) {
      const message = `Instrument "${name}" from "${sourcePath}" overrides previously defined instrument`;
      if (ctx.options.strictMode) {
        throw new Error(message);
      } else if (ctx.options.onWarn) {
        ctx.options.onWarn(message);
      }
    }
    result[name] = inst;
  }

  return result;
}

/**
 * Process all imports in an AST and return merged instruments.
 */
async function processImports(
  ast: AST,
  ctx: ImportContext
): Promise<InstMap> {
  let mergedInsts: InstMap = {};

  if (!ast.imports || ast.imports.length === 0) {
    return mergedInsts;
  }

  for (const imp of ast.imports) {
    const importedInsts = await loadImportFile(imp.source, ctx);

    // Merge imported instruments (later imports override earlier ones)
    mergedInsts = mergeInstruments(mergedInsts, importedInsts, imp.source, ctx);
  }

  return mergedInsts;
}

/**
 * Resolve all imports in an AST and merge them into the instrument table.
 * Returns a new AST with merged instruments.
 * Browser version: Only supports remote imports (HTTP(S), GitHub).
 */
export async function resolveImports(
  ast: AST,
  options: ImportResolverOptions = {}
): Promise<AST> {
  const ctx: ImportContext = {
    importStack: [],
    options,
    remoteCache: options.remoteCache,
  };

  // Process imports
  const importedInsts = await processImports(ast, ctx);

  // Merge imported instruments with local instruments (local overrides imported)
  const finalInsts = mergeInstruments(
    importedInsts,
    ast.insts || {},
    '<main>',
    ctx
  );

  // Return new AST with merged instruments and cleared imports
  return {
    ...ast,
    insts: finalInsts,
    imports: [], // Clear imports to prevent double-resolution
  };
}

/**
 * Synchronous wrapper - not supported in browser (all remote imports are async).
 * @deprecated Not available in browser context
 */
export function resolveImportsSync(
  _ast: AST,
  _options: ImportResolverOptions = {}
): AST {
  throw new Error(
    'resolveImportsSync is not available in browser context. ' +
    'Use resolveImports() (async) instead for remote imports.'
  );
}
