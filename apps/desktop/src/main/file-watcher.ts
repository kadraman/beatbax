import { watch as fsWatch, watchFile, unwatchFile, type FSWatcher } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  filePathsMatch,
  isSelfWriteEcho,
  shouldHandleDirectoryWatchEvent
} from '../shared/file-watcher-logic'
import type { DesktopDocumentChangedPayload } from '../shared/electron-api'

export type DocumentFileWatcherChangeHandler = (payload: DesktopDocumentChangedPayload) => void

export interface DocumentFileWatcherOptions {
  onChange?: DocumentFileWatcherChangeHandler
  debounceMs?: number
  selfWriteWindowMs?: number
}

export interface DocumentFileWatcher {
  watch(filePath: string): void
  unwatch(): void
  markSelfWrite(filePath: string): void
  setOnChange(handler: DocumentFileWatcherChangeHandler | undefined): void
  getWatchedPath(): string | null
  dispose(): void
}

const DEFAULT_DEBOUNCE_MS = 200
const DEFAULT_SELF_WRITE_WINDOW_MS = 750

export function createDocumentFileWatcher(
  options: DocumentFileWatcherOptions = {}
): DocumentFileWatcher {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const selfWriteWindowMs = options.selfWriteWindowMs ?? DEFAULT_SELF_WRITE_WINDOW_MS

  let onChange = options.onChange
  let watchedPath: string | null = null
  let watchedBasename = ''
  let fsWatcher: FSWatcher | null = null
  let polledPath: string | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let reattachTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let disposed = false
  let ignoreUntilMs = 0
  let lastSelfWriteContent: string | undefined
  let lastPollMtimeMs = 0
  let lastPollSize = -1
  let generation = 0

  const clearDebounce = (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  const clearReattach = (): void => {
    if (reattachTimer !== null) {
      clearTimeout(reattachTimer)
      reattachTimer = null
    }
  }

  const closeFsWatcher = (): void => {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    if (polledPath) {
      unwatchFile(polledPath)
      polledPath = null
    }
    if (!fsWatcher) return
    fsWatcher.removeAllListeners()
    try {
      fsWatcher.close()
    } catch {
      /* ignore */
    }
    fsWatcher = null
  }

  const emitIfExternal = async (currentGeneration: number): Promise<void> => {
    const target = watchedPath
    if (!target || disposed || currentGeneration !== generation) return

    try {
      await fs.stat(target)
      if (currentGeneration !== generation || watchedPath !== target) return
      if (
        isSelfWriteEcho({
          watchedPath: target,
          eventPath: target,
          nowMs: Date.now(),
          ignoreUntilMs,
        })
      ) {
        return
      }
      const content = await fs.readFile(target, 'utf8')
      if (currentGeneration !== generation || watchedPath !== target) return
      if (Date.now() < ignoreUntilMs && content === lastSelfWriteContent) return
      onChange?.({ path: target, type: 'change', content })
    } catch {
      if (currentGeneration !== generation || watchedPath !== target) return
      if (
        isSelfWriteEcho({
          watchedPath: target,
          eventPath: target,
          nowMs: Date.now(),
          ignoreUntilMs
        })
      ) {
        return
      }
      onChange?.({ path: target, type: 'unlink' })
    }
  }

  const scheduleEmit = (): void => {
    clearDebounce()
    const currentGeneration = generation
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void emitIfExternal(currentGeneration)
    }, debounceMs)
  }

  const onDirEvent = (eventType: string, filename: string | Buffer | null): void => {
    if (!watchedPath) return
    const name = typeof filename === 'string' ? filename : filename?.toString()
    if (!shouldHandleDirectoryWatchEvent(watchedBasename, name || null)) return
    if (eventType === 'rename' || eventType === 'change') {
      scheduleEmit()
    }
  }

  const pollStat = async (): Promise<void> => {
    const target = watchedPath
    if (!target || disposed) return
    try {
      const st = await fs.stat(target)
      if (!watchedPath || watchedPath !== target || disposed) return
      if (lastPollSize < 0) {
        lastPollMtimeMs = st.mtimeMs
        lastPollSize = st.size
        return
      }
      if (st.mtimeMs !== lastPollMtimeMs || st.size !== lastPollSize) {
        lastPollMtimeMs = st.mtimeMs
        lastPollSize = st.size
        scheduleEmit()
      }
    } catch {
      if (!watchedPath || watchedPath !== target || disposed) return
      if (lastPollSize !== -2) {
        lastPollSize = -2
        scheduleEmit()
      }
    }
  }

  const startWatch = (): void => {
    if (!watchedPath || disposed) return
    closeFsWatcher()
    lastPollMtimeMs = 0
    lastPollSize = -1
    const dir = path.dirname(watchedPath)
    try {
      fsWatcher = fsWatch(dir, { persistent: true }, onDirEvent)
      fsWatcher.on('error', () => {
        closeFsWatcher()
        if (!watchedPath || disposed) return
        clearReattach()
        reattachTimer = setTimeout(() => {
          reattachTimer = null
          startWatch()
        }, 250)
      })
    } catch (error) {
      console.error('desktop file watcher failed to start', error)
    }

    polledPath = watchedPath
    watchFile(polledPath, { persistent: true, interval: 250 }, (curr, prev) => {
      if (curr.nlink === 0 || curr.mtimeMs !== prev.mtimeMs || curr.size !== prev.size) {
        scheduleEmit()
      }
    })
    pollTimer = setInterval(() => {
      void pollStat()
    }, 300)
    void pollStat()
  }

  return {
    watch(filePath: string): void {
      if (disposed) return
      if (!path.isAbsolute(filePath)) {
        throw new Error('Expected an absolute file path.')
      }
      const resolved = path.resolve(filePath)
      if (watchedPath === resolved && fsWatcher) return
      generation += 1
      clearDebounce()
      clearReattach()
      closeFsWatcher()
      watchedPath = resolved
      watchedBasename = path.basename(resolved)
      ignoreUntilMs = 0
      lastSelfWriteContent = undefined
      lastPollMtimeMs = 0
      lastPollSize = -1
      startWatch()
    },

    unwatch(): void {
      generation += 1
      clearDebounce()
      clearReattach()
      closeFsWatcher()
      watchedPath = null
      watchedBasename = ''
      ignoreUntilMs = 0
      lastSelfWriteContent = undefined
      lastPollMtimeMs = 0
      lastPollSize = -1
    },

    markSelfWrite(filePath: string): void {
      if (!path.isAbsolute(filePath) || !watchedPath) return
      const resolved = path.resolve(filePath)
      if (!filePathsMatch(watchedPath, resolved)) return
      ignoreUntilMs = Date.now() + selfWriteWindowMs
      void fs
        .readFile(resolved, 'utf8')
        .then((content) => {
          if (!watchedPath || !filePathsMatch(watchedPath, resolved)) return
          lastSelfWriteContent = content
          ignoreUntilMs = Date.now() + selfWriteWindowMs
        })
        .catch(() => {
          /* file may have been replaced mid-write */
        })
    },

    setOnChange(handler: DocumentFileWatcherChangeHandler | undefined): void {
      onChange = handler
    },

    getWatchedPath(): string | null {
      return watchedPath
    },

    dispose(): void {
      disposed = true
      this.unwatch()
      onChange = undefined
    }
  }
}
