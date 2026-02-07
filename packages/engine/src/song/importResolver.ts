/**
 * Import resolution for .ins files.
 * Handles loading, caching, cycle detection, and merging of instrument definitions.
 * Supports both local file imports and remote HTTP(S) imports.
 */

import { AST, InstMap } from '../parser/ast.js';
import { parse } from '../parser/index.js';
import * as path from 'path';
import * as fs from 'fs';
import { isRemoteImport, isLocalImport, extractLocalPath } from '../import/urlUtils.js';
import { RemoteInstrumentCache, RemoteImportOptions } from '../import/remoteCache.js';

export interface ImportResolverOptions {
  /** Base file path for resolving relative imports */
  baseFilePath?: string;
  /** Additional search paths for resolving imports */
  searchPaths?: string[];
  /** Strict mode: treat instrument name overrides as errors instead of warnings */
  strictMode?: boolean;
  /** Warning handler */
  onWarn?: (message: string, loc?: any) => void;
  /** File system reader for testing */
  readFile?: (filePath: string) => string;
  /** File existence checker for testing */
  fileExists?: (filePath: string) => boolean;
  /** Allow absolute paths in imports (disabled by default for security) */
  allowAbsolutePaths?: boolean;
  /** Remote import options (timeout, HTTPS-only, etc.) */
  remoteOptions?: RemoteImportOptions;
  /** Remote instrument cache (reused across multiple resolve calls) */
  remoteCache?: RemoteInstrumentCache;
}

interface ImportCache {
  [absolutePath: string]: InstMap;
}

interface ImportContext {
  importStack: string[];
  cache: ImportCache;
  options: ImportResolverOptions;
  remoteCache?: RemoteInstrumentCache;
}

/**
 * Validate an import path for security vulnerabilities.
 * Rejects paths with:
 * - Parent directory traversal (..) segments (for local paths)
 * - Absolute paths (unless explicitly allowed, for local paths)
 * - Missing local: prefix for file imports
 * Remote URLs (http://, https://, github:) are allowed and validated separately.
 * @throws Error if the path is invalid
 */
function validateImportPath(
  importSource: string,
  allowAbsolutePaths: boolean = false
): void {
  // Remote imports are handled separately
  if (isRemoteImport(importSource)) {
    return;
  }

  // Local imports must have local: prefix
  if (!isLocalImport(importSource)) {
    throw new Error(
      `Invalid import path "${importSource}": local file imports must use "local:" prefix. ` +
      `Use "local:${importSource}" instead. Remote imports should use "https://" or "github:" prefix.`
    );
  }

  // Extract the actual path from local: prefix
  const actualPath = extractLocalPath(importSource);

  // Normalize path separators for consistent checking
  const normalized = actualPath.replace(/\\/g, '/');

  // Check for parent directory traversal
  if (normalized.includes('..')) {
    throw new Error(
      `Invalid import path "${importSource}": path traversal using ".." is not allowed for security reasons`
    );
  }

  // Check for absolute paths
  if (!allowAbsolutePaths) {
    // Check for Unix-style absolute paths
    if (normalized.startsWith('/')) {
      throw new Error(
        `Invalid import path "${importSource}": absolute paths are not allowed for security reasons`
      );
    }
    // Check for Windows-style absolute paths (C:, D:, etc.)
    if (/^[a-zA-Z]:/.test(normalized)) {
      throw new Error(
        `Invalid import path "${importSource}": absolute paths are not allowed for security reasons`
      );
    }
  }
}

/**
 * Validate that a resolved path is within allowed directories.
 * Ensures the resolved path is under the base directory or one of the search paths.
 */
function validateResolvedPath(
  resolvedPath: string,
  allowedDirs: string[],
  importSource: string,
  pathLib: typeof path
): void {
  if (allowedDirs.length === 0) {
    return; // No restrictions if no allowed directories specified
  }

  const normalizedResolved = pathLib.normalize(resolvedPath);

  for (const allowedDir of allowedDirs) {
    const normalizedAllowed = pathLib.normalize(allowedDir);
    const relative = pathLib.relative(normalizedAllowed, normalizedResolved);

    // If relative path doesn't start with .., it's within the allowed directory
    if (!relative.startsWith('..') && !pathLib.isAbsolute(relative)) {
      return; // Valid - within allowed directory
    }
  }

  throw new Error(
    `Security violation: import path "${importSource}" resolves to "${resolvedPath}" ` +
    `which is outside the allowed directories`
  );
}

/**
 * Resolve a relative import path to an absolute path.
 */
function resolveImportPath(
  importSource: string,
  baseFilePath: string | undefined,
  searchPaths: string[] = [],
  options: ImportResolverOptions = {}
):  string | null {
  const fileExists = options.fileExists;
  // Validate import path for security vulnerabilities
  validateImportPath(importSource, options.allowAbsolutePaths || false);

  // Extract the actual file path from local: prefix
  const actualPath = extractLocalPath(importSource);

  const checkExists = fileExists || ((p: string) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  // Use posix paths when a custom fileExists is provided (testing mode)
  const pathLib = fileExists ? path.posix : path;

  // Build list of allowed directories for validation
  const allowedDirs: string[] = [];
  if (baseFilePath) {
    const baseDir = pathLib.dirname(baseFilePath);
    // Normalize to absolute path for proper validation
    const absoluteBaseDir = pathLib.isAbsolute(baseDir) ? baseDir : pathLib.resolve(baseDir);
    allowedDirs.push(absoluteBaseDir);
  }
  // Also normalize search paths to absolute
  for (const searchPath of searchPaths) {
    const absoluteSearchPath = pathLib.isAbsolute(searchPath) ? searchPath : pathLib.resolve(searchPath);
    allowedDirs.push(absoluteSearchPath);
  }

  // If we have a base file path, try resolving relative to it first
  if (baseFilePath) {
    const baseDir = pathLib.dirname(baseFilePath);
    const resolved = pathLib.resolve(baseDir, actualPath);

    // Validate that resolved path is within allowed directories
    validateResolvedPath(resolved, allowedDirs, importSource, pathLib);

    if (checkExists(resolved)) {
      return resolved;
    }
  }

  // Try search paths
  for (const searchPath of searchPaths) {
    const resolved = pathLib.resolve(searchPath, actualPath);

    // Validate that resolved path is within allowed directories
    validateResolvedPath(resolved, allowedDirs, importSource, pathLib);

    if (checkExists(resolved)) {
      return resolved;
    }
  }

  return null;
}

/**
 * Validate that an AST contains only allowed node types for .ins files.
 */
function validateInsFile(ast: AST, filePath: string): void {
  // .ins files should only contain instrument definitions and imports
  // Check for disallowed nodes
  const hasPatterns = Object.keys(ast.pats || {}).length > 0;
  const hasSequences = Object.keys(ast.seqs || {}).length > 0;
  const hasChannels = (ast.channels || []).length > 0;
  const hasArranges = ast.arranges && Object.keys(ast.arranges).length > 0;
  const hasPlay = ast.play !== undefined;

  if (hasPatterns || hasSequences || hasChannels || hasArranges || hasPlay) {
    throw new Error(
      `Invalid .ins file "${filePath}": .ins files may only contain "inst" and "import" declarations. ` +
      `Found: ${[
        hasPatterns && 'patterns',
        hasSequences && 'sequences',
        hasChannels && 'channels',
        hasArranges && 'arranges',
        hasPlay && 'play'
      ].filter(Boolean).join(', ')}`
    );
  }
}

/**
 * Load and parse an import file (local or remote).
 */
async function loadImportFile(
  importSource: string,
  ctx: ImportContext
): Promise<InstMap> {
  // Handle remote imports
  if (isRemoteImport(importSource)) {
    return await loadRemoteImportFile(importSource, ctx);
  }

  // Check if this is a local import in browser context
  if (isLocalImport(importSource) && typeof window !== 'undefined') {
    throw new Error(
      `Local imports are not supported in the browser for security reasons. ` +
      `Import "${importSource}" cannot be loaded. ` +
      `Use remote imports (https:// or github:) instead, or run in CLI for local file access.`
    );
  }

  // Resolve local file path
  const absolutePath = resolveImportPath(
    importSource,
    ctx.options.baseFilePath,
    ctx.options.searchPaths || [],
    ctx.options
  );

  if (!absolutePath) {
    throw new Error(
      `Import file not found: "${importSource}"` +
      (ctx.options.baseFilePath ? ` (imported from "${ctx.options.baseFilePath}")` : '')
    );
  }

  // Check cache first
  if (ctx.cache[absolutePath]) {
    return ctx.cache[absolutePath];
  }

  // Check for import cycles
  if (ctx.importStack.includes(absolutePath)) {
    const cycle = [...ctx.importStack, absolutePath].join(' -> ');
    throw new Error(`Import cycle detected: ${cycle}`);
  }

  // Read file
  let source: string;
  try {
    if (ctx.options.readFile) {
      source = ctx.options.readFile(absolutePath);
    } else {
      source = fs.readFileSync(absolutePath, 'utf-8');
    }
  } catch (err) {
    throw new Error(`Failed to read import file "${absolutePath}": ${err}`);
  }

  // Parse file
  let ast: AST;
  try {
    ast = parse(source);
  } catch (err) {
    throw new Error(`Failed to parse import file "${absolutePath}": ${err}`);
  }

  // Validate that this is a valid .ins file
  validateInsFile(ast, absolutePath);

  // Add to import stack for cycle detection
  ctx.importStack.push(absolutePath);

  // Recursively process imports in this file
  const mergedInsts = await processImports(ast, absolutePath, ctx);

  // Merge this file's instruments (they override imported ones - last-win)
  const finalInsts = mergeInstruments(
    mergedInsts,
    ast.insts || {},
    absolutePath,
    ctx
  );

  // Remove from import stack
  ctx.importStack.pop();

  // Cache the result
  ctx.cache[absolutePath] = finalInsts;

  return finalInsts;
}

/**
 * Load and parse a remote import file.
 */
async function loadRemoteImportFile(
  url: string,
  ctx: ImportContext
): Promise<InstMap> {
  // Check for import cycles (use URL as identifier)
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

    // Note: Remote .ins files cannot have nested imports for security reasons
    // The RemoteInstrumentCache already validates that the file only contains instruments

    return instruments;
  } finally {
    // Remove from import stack
    ctx.importStack.pop();
  }
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
  baseFilePath: string | undefined,
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
 * Supports both local file imports and remote HTTP(S) imports.
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
  const importedInsts = await processImports(ast, options.baseFilePath, ctx);

  // Merge imported instruments with local instruments (local overrides imported)
  const finalInsts = mergeInstruments(
    importedInsts,
    ast.insts || {},
    options.baseFilePath || '<main>',
    ctx
  );

  // Return new AST with merged instruments and cleared imports
  // (imports are already resolved, so we don't want to resolve them again)
  return {
    ...ast,
    insts: finalInsts,
    imports: [], // Clear imports to prevent double-resolution
  };
}

/**
 * Synchronous wrapper for resolveImports for backward compatibility.
 * Does not support remote imports - throws an error if remote imports are encountered.
 * @deprecated Use resolveImports (async) instead
 */
export function resolveImportsSync(
  ast: AST,
  options: ImportResolverOptions = {}
): AST {
  // Check if AST contains remote imports
  if (ast.imports && ast.imports.some(imp => isRemoteImport(imp.source))) {
    throw new Error(
      'Remote imports require async resolution. Use resolveImports() instead of resolveImportsSync().'
    );
  }

  // Use a synchronous implementation for local imports only
  const ctx: ImportContext = {
    importStack: [],
    cache: {},
    options,
  };

  // Process imports synchronously
  const importedInsts = processImportsSync(ast, options.baseFilePath, ctx);

  // Merge imported instruments with local instruments
  const finalInsts = mergeInstruments(
    importedInsts,
    ast.insts || {},
    options.baseFilePath || '<main>',
    ctx
  );

  return {
    ...ast,
    insts: finalInsts,
  };
}

/**
 * Synchronous version of processImports (local files only).
 */
function processImportsSync(
  ast: AST,
  baseFilePath: string | undefined,
  ctx: ImportContext
): InstMap {
  let mergedInsts: InstMap = {};

  if (!ast.imports || ast.imports.length === 0) {
    return mergedInsts;
  }

  for (const imp of ast.imports) {
    if (isRemoteImport(imp.source)) {
      throw new Error(
        `Remote import "${imp.source}" requires async resolution. Use resolveImports() instead.`
      );
    }

    const importedInsts = loadImportFileSync(imp.source, ctx);
    mergedInsts = mergeInstruments(mergedInsts, importedInsts, imp.source, ctx);
  }

  return mergedInsts;
}

/**
 * Synchronous version of loadImportFile (local files only).
 */
function loadImportFileSync(
  importSource: string,
  ctx: ImportContext
): InstMap {
  if (isRemoteImport(importSource)) {
    throw new Error(
      `Remote import "${importSource}" requires async resolution.`
    );
  }

  // Check if this is a local import in browser context
  if (isLocalImport(importSource) && typeof window !== 'undefined') {
    throw new Error(
      `Local imports are not supported in the browser for security reasons. ` +
      `Import "${importSource}" cannot be loaded. ` +
      `Use remote imports (https:// or github:) instead, or run in CLI for local file access.`
    );
  }

  // Resolve local file path
  const absolutePath = resolveImportPath(
    importSource,
    ctx.options.baseFilePath,
    ctx.options.searchPaths || [],
    ctx.options
  );

  if (!absolutePath) {
    throw new Error(
      `Import file not found: "${importSource}"` +
      (ctx.options.baseFilePath ? ` (imported from "${ctx.options.baseFilePath}")` : '')
    );
  }

  // Check cache first
  if (ctx.cache[absolutePath]) {
    return ctx.cache[absolutePath];
  }

  // Check for import cycles
  if (ctx.importStack.includes(absolutePath)) {
    const cycle = [...ctx.importStack, absolutePath].join(' -> ');
    throw new Error(`Import cycle detected: ${cycle}`);
  }

  // Read file
  let source: string;
  try {
    if (ctx.options.readFile) {
      source = ctx.options.readFile(absolutePath);
    } else {
      source = fs.readFileSync(absolutePath, 'utf-8');
    }
  } catch (err) {
    throw new Error(`Failed to read import file "${absolutePath}": ${err}`);
  }

  // Parse file
  let ast: AST;
  try {
    ast = parse(source);
  } catch (err) {
    throw new Error(`Failed to parse import file "${absolutePath}": ${err}`);
  }

  // Validate that this is a valid .ins file
  validateInsFile(ast, absolutePath);

  // Add to import stack for cycle detection
  ctx.importStack.push(absolutePath);

  // Recursively process imports in this file
  const mergedInsts = processImportsSync(ast, absolutePath, ctx);

  // Merge this file's instruments (they override imported ones - last-win)
  const finalInsts = mergeInstruments(
    mergedInsts,
    ast.insts || {},
    absolutePath,
    ctx
  );

  // Remove from import stack
  ctx.importStack.pop();

  // Cache the result
  ctx.cache[absolutePath] = finalInsts;

  return finalInsts;
}
