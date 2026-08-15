/**
 * Browser-safe import resolution for .ins files.
 * Supports remote HTTP(S)/GitHub imports everywhere.
 * Local `local:` imports are allowed only when a filesystem is injected
 * (Desktop Electron IPC) — not in the web-lite browser client.
 * This module does NOT import Node.js built-ins (fs, path).
 */

import { AST, InstMap } from '../parser/ast.js';
import { parse } from '../parser/index.js';
import { isRemoteImport, isLocalImport } from '../import/urlUtils.js';
import { resolveLocalImportPath } from '../import/localImportPath.js';
import { RemoteInstrumentCache, RemoteImportOptions } from '../import/remoteCache.js';

export interface ImportResolverOptions {
  /** Base file path of the importing .bax/.ins (Desktop: on-disk song path). */
  baseFilePath?: string;
  searchPaths?: string[];
  /** Strict mode: treat instrument name overrides as errors instead of warnings */
  strictMode?: boolean;
  /** Warning handler */
  onWarn?: (message: string, loc?: any) => void;
  /** File system reader (Desktop injects Electron IPC; tests inject a mock). */
  readFile?: (filePath: string) => string;
  /** File existence checker */
  fileExists?: (filePath: string) => boolean;
  /** Allow absolute paths in imports (disabled by default for security) */
  allowAbsolutePaths?: boolean;
  /** Remote import options (timeout, HTTPS-only, etc.) */
  remoteOptions?: RemoteImportOptions;
  /** Remote instrument cache (reused across multiple resolve calls) */
  remoteCache?: RemoteInstrumentCache;
}

interface ImportContext {
  importStack: string[];
  cache: Record<string, InstMap>;
  options: ImportResolverOptions;
  remoteCache?: RemoteInstrumentCache;
}

type DesktopElectronFs = {
  readFileSync: (targetPath: string, encoding?: string) => string;
  existsSync: (targetPath: string) => boolean;
};

function desktopFsFromWindow(): Pick<ImportResolverOptions, 'readFile' | 'fileExists'> | undefined {
  if (typeof window === 'undefined') return undefined;
  const api = (window as unknown as { electronAPI?: DesktopElectronFs }).electronAPI;
  if (!api?.readFileSync || !api?.existsSync) return undefined;
  return {
    readFile: (filePath: string) => api.readFileSync(filePath, 'utf-8'),
    fileExists: (filePath: string) => Boolean(api.existsSync(filePath)),
  };
}

function localFs(options: ImportResolverOptions): {
  readFile: (filePath: string) => string;
  fileExists: (filePath: string) => boolean;
} | undefined {
  const fallback = desktopFsFromWindow();
  const readFile = options.readFile ?? fallback?.readFile;
  const fileExists = options.fileExists ?? fallback?.fileExists;
  if (!readFile || !fileExists) return undefined;
  return { readFile, fileExists };
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
    'insts', 'imports', 'pats', 'seqs', 'channels', 'play',
    'chip', 'chipRegion', 'bpm', 'time', 'stepsPerBar', 'volume', 'metadata', 'effects', 'patternEvents', 'sequenceItems'
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

async function loadLocalImportFile(
  importSource: string,
  ctx: ImportContext,
  fs: { readFile: (filePath: string) => string; fileExists: (filePath: string) => boolean },
): Promise<InstMap> {
  if (!ctx.options.baseFilePath && !(ctx.options.searchPaths && ctx.options.searchPaths.length > 0)) {
    throw new Error(
      `Local import "${importSource}" cannot be resolved because the song has not been saved to disk. ` +
      `Save the .bax file first, and keep the .ins file relative to it (for example lib/adventure.ins next to the song).`
    );
  }

  const absolutePath = resolveLocalImportPath(importSource, {
    baseFilePath: ctx.options.baseFilePath,
    searchPaths: ctx.options.searchPaths || [],
    allowAbsolutePaths: ctx.options.allowAbsolutePaths,
    fileExists: fs.fileExists,
  });

  if (!absolutePath) {
    throw new Error(
      `Import file not found: "${importSource}"` +
      (ctx.options.baseFilePath ? ` (imported from "${ctx.options.baseFilePath}")` : '')
    );
  }

  if (ctx.cache[absolutePath]) {
    return ctx.cache[absolutePath];
  }

  if (ctx.importStack.includes(absolutePath)) {
    const cycle = [...ctx.importStack, absolutePath].join(' -> ');
    throw new Error(`Import cycle detected: ${cycle}`);
  }

  let source: string;
  try {
    source = fs.readFile(absolutePath);
  } catch (err) {
    throw new Error(`Failed to read import file "${absolutePath}": ${err}`);
  }

  let ast: AST;
  try {
    ast = parse(source);
  } catch (err) {
    throw new Error(`Failed to parse import file "${absolutePath}": ${err}`);
  }

  validateInsFile(ast, absolutePath);

  ctx.importStack.push(absolutePath);
  try {
    const nestedCtx: ImportContext = {
      ...ctx,
      options: { ...ctx.options, baseFilePath: absolutePath },
    };
    const mergedInsts = await processImports(ast, nestedCtx);
    const finalInsts = mergeInstruments(
      mergedInsts,
      ast.insts || {},
      absolutePath,
      ctx,
    );
    ctx.cache[absolutePath] = finalInsts;
    return finalInsts;
  } finally {
    ctx.importStack.pop();
  }
}

/**
 * Load and parse an import file (remote, or local when a filesystem is available).
 */
async function loadImportFile(
  importSource: string,
  ctx: ImportContext
): Promise<InstMap> {
  if (isLocalImport(importSource)) {
    const fs = localFs(ctx.options);
    if (!fs) {
      throw new Error(
        `Local imports are not supported in the browser for security reasons. ` +
        `Import "${importSource}" cannot be loaded. ` +
        `Use remote imports (https:// or github:) instead.`
      );
    }
    return await loadLocalImportFile(importSource, ctx, fs);
  }

  // Only remote imports are supported without a local filesystem
  if (!isRemoteImport(importSource)) {
    throw new Error(
      `Invalid import "${importSource}": Browser environment only supports remote imports. ` +
      `Use "https://", "http://", or "github:" prefix for remote imports. ` +
      `Local file imports require CLI or BeatBax Desktop.`
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
 * Browser / Desktop renderer: remote imports always; local imports when a filesystem is available.
 */
export async function resolveImports(
  ast: AST,
  options: ImportResolverOptions = {}
): Promise<AST> {
  const ctx: ImportContext = {
    importStack: [],
    cache: {},
    options,
    remoteCache: options.remoteCache,
  };

  // Process imports
  const importedInsts = await processImports(ast, ctx);

  // Merge imported instruments with local instruments (local overrides imported)
  const finalInsts = mergeInstruments(
    importedInsts,
    ast.insts || {},
    options.baseFilePath || '<main>',
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
