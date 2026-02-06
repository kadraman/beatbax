/**
 * Import resolution for .ins files.
 * Handles loading, caching, cycle detection, and merging of instrument definitions.
 */

import { AST, InstMap } from '../parser/ast.js';
import { parse } from '../parser/index.js';
import * as path from 'path';
import * as fs from 'fs';

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
}

interface ImportCache {
  [absolutePath: string]: InstMap;
}

interface ImportContext {
  importStack: string[];
  cache: ImportCache;
  options: ImportResolverOptions;
}

/**
 * Validate an import path for security vulnerabilities.
 * Rejects paths with:
 * - Parent directory traversal (..) segments
 * - Absolute paths (unless explicitly allowed)
 * @throws Error if the path is invalid
 */
function validateImportPath(
  importSource: string,
  allowAbsolutePaths: boolean = false
): void {
  // Normalize path separators for consistent checking
  const normalized = importSource.replace(/\\/g, '/');

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
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
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
): string | null {
  const fileExists = options.fileExists;
  // Validate import path for security vulnerabilities
  validateImportPath(importSource, options.allowAbsolutePaths || false);

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
    allowedDirs.push(pathLib.dirname(baseFilePath));
  }
  allowedDirs.push(...searchPaths);

  // If we have a base file path, try resolving relative to it first
  if (baseFilePath) {
    const baseDir = pathLib.dirname(baseFilePath);
    const resolved = pathLib.resolve(baseDir, importSource);

    // Validate that resolved path is within allowed directories
    validateResolvedPath(resolved, allowedDirs, importSource, pathLib);

    if (checkExists(resolved)) {
      return resolved;
    }
  }

  // Try search paths
  for (const searchPath of searchPaths) {
    const resolved = pathLib.resolve(searchPath, importSource);
    
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
 * Load and parse an import file.
 */
function loadImportFile(
  absolutePath: string,
  ctx: ImportContext
): InstMap {
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
  const mergedInsts = processImports(ast, absolutePath, ctx);

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
function processImports(
  ast: AST,
  baseFilePath: string | undefined,
  ctx: ImportContext
): InstMap {
  let mergedInsts: InstMap = {};

  if (!ast.imports || ast.imports.length === 0) {
    return mergedInsts;
  }

  for (const imp of ast.imports) {
    const resolvedPath = resolveImportPath(
      imp.source,
      baseFilePath,
      ctx.options.searchPaths || [],
      ctx.options
    );

    if (!resolvedPath) {
      throw new Error(
        `Import file not found: "${imp.source}"` +
        (baseFilePath ? ` (imported from "${baseFilePath}")` : '')
      );
    }

    const importedInsts = loadImportFile(resolvedPath, ctx);

    // Merge imported instruments (later imports override earlier ones)
    mergedInsts = mergeInstruments(mergedInsts, importedInsts, resolvedPath, ctx);
  }

  return mergedInsts;
}

/**
 * Resolve all imports in an AST and merge them into the instrument table.
 * Returns a new AST with merged instruments.
 */
export function resolveImports(
  ast: AST,
  options: ImportResolverOptions = {}
): AST {
  const ctx: ImportContext = {
    importStack: [],
    cache: {},
    options,
  };

  // Process imports
  const importedInsts = processImports(ast, options.baseFilePath, ctx);

  // Merge imported instruments with local instruments (local overrides imported)
  const finalInsts = mergeInstruments(
    importedInsts,
    ast.insts || {},
    options.baseFilePath || '<main>',
    ctx
  );

  // Return new AST with merged instruments
  return {
    ...ast,
    insts: finalInsts,
  };
}
