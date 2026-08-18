/**
 * Remember the last File → Open / Save directory for native dialogs.
 * First launch still falls back to bundled (or macOS Documents) example songs.
 */

import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const SETTINGS_FILE = 'last-file-dialog.json'

export function lastFileDialogSettingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

/** Skip paths inside a packaged .app so the next Open is not stuck in Contents/. */
export function shouldRememberDialogDirectory(dir: string): boolean {
  const normalized = dir.replace(/\\/g, '/')
  if (normalized.includes('.app/Contents/')) return false
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    const rel = path.relative(path.resolve(resourcesPath), path.resolve(dir))
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return false
  }
  return true
}

export function directoryFromFilePath(filePath: string): string | null {
  const trimmed = filePath.trim()
  if (!trimmed) return null
  const abs = path.resolve(trimmed)
  if (!path.isAbsolute(abs)) return null
  return path.dirname(abs)
}

export async function readLastFileDialogDirectory(): Promise<string | null> {
  try {
    const raw = await fs.readFile(lastFileDialogSettingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as { directory?: unknown }
    const dir = typeof parsed.directory === 'string' ? parsed.directory.trim() : ''
    if (!dir || !path.isAbsolute(dir) || !existsSync(dir)) return null
    if (!shouldRememberDialogDirectory(dir)) return null
    return dir
  } catch {
    return null
  }
}

export async function rememberLastFileDialogDirectory(filePath: string): Promise<void> {
  const dir = directoryFromFilePath(filePath)
  if (!dir || !shouldRememberDialogDirectory(dir)) return
  try {
    const settingsPath = lastFileDialogSettingsPath()
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(
      settingsPath,
      `${JSON.stringify({ version: 1, directory: dir }, null, 2)}\n`,
      'utf8',
    )
  } catch (error) {
    console.warn('[BeatBax] Failed to remember last file-dialog directory:', error)
  }
}

/** Open dialog: explicit path, else last remembered folder, else first-run fallback. */
export async function resolveOpenDialogDefaultPath(
  explicit?: string,
  fallback?: string | null,
): Promise<string | undefined> {
  const trimmed = explicit?.trim()
  if (trimmed) return trimmed
  const last = await readLastFileDialogDirectory()
  if (last) return last
  return fallback?.trim() || undefined
}

/**
 * Save dialog: keep an absolute file path; otherwise put a bare filename
 * (or empty default) in the last remembered folder.
 */
export async function resolveSaveDialogDefaultPath(explicit?: string): Promise<string | undefined> {
  const trimmed = explicit?.trim() || ''
  const last = await readLastFileDialogDirectory()
  if (trimmed && path.isAbsolute(trimmed)) return trimmed
  if (trimmed && last) return path.join(last, path.basename(trimmed))
  if (trimmed) return trimmed
  return last ?? undefined
}
