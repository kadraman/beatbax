import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { BrowserWindow, Input, WebContents } from 'electron'
import type { DevToolsState } from '../shared/electron-api'

interface DesktopDiagnosticsSettingsFile {
  version: 1
  devToolsEnabled: boolean
}

export async function readDevToolsSetting(settingsPath: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as Partial<DesktopDiagnosticsSettingsFile>
    return parsed.version === 1 && parsed.devToolsEnabled === true
  } catch {
    return false
  }
}

export async function writeDevToolsSetting(settingsPath: string, enabled: boolean): Promise<void> {
  const payload: DesktopDiagnosticsSettingsFile = { version: 1, devToolsEnabled: enabled }
  await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  await fs.writeFile(settingsPath, JSON.stringify(payload, null, 2), 'utf8')
}

export function resolveDevToolsState(options: {
  development: boolean
  launchFlag: boolean
  saved: boolean
}): DevToolsState {
  const { development, launchFlag, saved } = options
  if (development) return { allowed: true, source: 'development', saved }
  if (launchFlag) return { allowed: true, source: 'launch-flag', saved }
  if (saved) return { allowed: true, source: 'setting', saved }
  return { allowed: false, source: 'off', saved }
}

export type ShortcutDecision = 'toggle-devtools' | 'block' | 'pass'

type ShortcutInput = Pick<Input, 'type' | 'code' | 'control' | 'meta' | 'alt' | 'shift'>

/**
 * Packaged builds also block reload and the zoom keys that
 * `optimizer.watchWindowShortcuts` blocked; development builds leave those to it.
 */
export function decideShortcut(
  input: ShortcutInput,
  options: { platform: NodeJS.Platform; allowed: boolean; development: boolean },
): ShortcutDecision {
  if (input.type !== 'keyDown') return 'pass'
  const { platform, allowed, development } = options
  const primary = input.control || input.meta

  if (input.code === 'KeyI') {
    const macCombo = input.meta && input.alt
    const otherCombo = input.control && input.shift
    const platformCombo = platform === 'darwin' ? macCombo : otherCombo
    if (platformCombo) return allowed ? 'toggle-devtools' : 'block'
    if (macCombo || otherCombo) return development ? 'pass' : 'block'
  }

  if (development) return 'pass'
  if (input.code === 'KeyR' && primary) return 'block'
  if (input.code === 'Minus' && primary) return 'block'
  if (input.code === 'Equal' && input.shift && primary) return 'block'
  return 'pass'
}

export interface DevToolsPolicyOptions {
  settingsPath: string
  development: boolean
  launchFlag: boolean
  platform?: NodeJS.Platform
  onChange?: (state: DevToolsState) => void
}

export interface DevToolsPolicy {
  /** Load the saved setting. Until this resolves the saved value is treated as off. */
  load(): Promise<DevToolsState>
  getState(): DevToolsState
  isAllowed(): boolean
  setEnabled(enabled: boolean): Promise<DevToolsState>
  /** Toggle developer tools for a window; ignored while not allowed. */
  toggle(window: BrowserWindow | null): void
  /** Shortcut handling and `devtools-opened` enforcement for a new window. */
  attachToWindow(window: BrowserWindow): void
}

export function createDevToolsPolicy(options: DevToolsPolicyOptions): DevToolsPolicy {
  const { settingsPath, development, launchFlag, onChange } = options
  const platform = options.platform ?? process.platform
  let saved = false
  const windows = new Set<BrowserWindow>()

  const getState = (): DevToolsState => resolveDevToolsState({ development, launchFlag, saved })

  const closeIfDisallowed = (webContents: WebContents): void => {
    if (!getState().allowed && webContents.isDevToolsOpened()) webContents.closeDevTools()
  }

  const toggle = (window: BrowserWindow | null): void => {
    if (!window || window.isDestroyed() || !getState().allowed) return
    window.webContents.toggleDevTools()
  }

  return {
    async load() {
      saved = await readDevToolsSetting(settingsPath)
      return getState()
    },
    getState,
    isAllowed: () => getState().allowed,
    async setEnabled(enabled) {
      if (typeof enabled !== 'boolean') throw new Error('Developer tools setting must be true or false.')
      await writeDevToolsSetting(settingsPath, enabled)
      saved = enabled
      const state = getState()
      for (const window of windows) {
        if (!window.isDestroyed()) closeIfDisallowed(window.webContents)
      }
      onChange?.(state)
      return state
    },
    toggle,
    attachToWindow(window) {
      windows.add(window)
      window.on('closed', () => windows.delete(window))
      const { webContents } = window
      webContents.on('devtools-opened', () => closeIfDisallowed(webContents))
      webContents.on('before-input-event', (event, input) => {
        const decision = decideShortcut(input, { platform, allowed: getState().allowed, development })
        if (decision === 'pass') return
        event.preventDefault()
        if (decision === 'toggle-devtools') toggle(window)
      })
    },
  }
}
