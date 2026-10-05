import { appendFileSync, mkdirSync, promises as fs, renameSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import type { DiagnosticsLogEntry } from '../shared/electron-api'

export type DiagnosticsLevel = 'info' | 'warn' | 'error'

export const DIAGNOSTICS_LOG_FILE = 'beatbax.log'
export const DIAGNOSTICS_OLD_LOG_FILE = 'beatbax.old.log'
export const DIAGNOSTICS_MAX_BYTES = 1024 * 1024
export const RENDERER_ENTRY_MAX_CHARS = 4096
export const RENDERER_ENTRIES_PER_MINUTE = 100

const REDACTED = '[redacted]'

export function redactDiagnostics(text: string, secrets: Iterable<string> = []): string {
  let result = text
  // Longest first, so a key that prefixes another cannot leave the longer key's suffix behind.
  const ordered = [...secrets].filter((secret) => secret.length > 0).sort((a, b) => b.length - a.length)
  for (const secret of ordered) {
    result = result.split(secret).join(REDACTED)
  }
  return result
    .replace(/(authorization["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^\s"',}]+/gi, `$1${REDACTED}`)
    .replace(/\bbearer\s+(?!\[redacted\])[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, REDACTED)
}

const ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,63}$/

function safeErrorCode(value: unknown): string | undefined {
  const code = (value as { code?: unknown } | null | undefined)?.code
  return typeof code === 'string' && ERROR_CODE.test(code) ? code : undefined
}

/**
 * Error class plus system error code (e.g. `TypeError ECONNREFUSED`), never the
 * message: messages such as a JSON `SyntaxError` can quote the provider body.
 */
export function describeErrorSafely(error: unknown): string {
  const name = error instanceof Error && ERROR_NAME.test(error.name) ? error.name : 'Error'
  const code = safeErrorCode(error) ?? safeErrorCode((error as { cause?: unknown } | null | undefined)?.cause)
  return code ? `${name} ${code}` : name
}

export function formatDiagnosticsEntry(
  time: Date,
  level: DiagnosticsLevel,
  source: string,
  message: string,
  stack?: string,
): string {
  const [first = '', ...rest] = message.split(/\r?\n/)
  const continuation = [...rest, ...(stack ? stack.split(/\r?\n/) : [])]
    .filter((line) => line.trim().length > 0)
    .map((line) => `  ${line.trim()}`)
  return [`${time.toISOString()} [${level}] [${source}] ${first}`, ...continuation].join('\n') + '\n'
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : String(error)
}

export interface DiagnosticsLogOptions {
  dir: string
  maxBytes?: number
  now?: () => Date
  /** Receives entries once the file cannot be written. */
  fallback?: (level: DiagnosticsLevel, line: string) => void
}

export interface DiagnosticsLog {
  readonly filePath: string
  append(level: DiagnosticsLevel, source: string, message: string, stack?: string): void
  /** Like `append`, taking the stack (or message) from an error. */
  log(level: DiagnosticsLevel, source: string, message: string, error?: unknown): void
  /**
   * Like `log`, but writes (and rotates) synchronously and never throws. For fatal
   * paths where the process may exit before queued writes run; entries still
   * queued by `log` may land after this one or not at all.
   */
  logSync(level: DiagnosticsLevel, source: string, message: string, error?: unknown): void
  /** Values (such as the stored AI API key) replaced with `[redacted]` before writing. */
  setSecret(name: string, value: string): void
  /** Resolves once every queued entry has been written or dropped. */
  flush(): Promise<void>
}

export function createDiagnosticsLog(options: DiagnosticsLogOptions): DiagnosticsLog {
  const filePath = path.join(options.dir, DIAGNOSTICS_LOG_FILE)
  const oldFilePath = path.join(options.dir, DIAGNOSTICS_OLD_LOG_FILE)
  const maxBytes = options.maxBytes ?? DIAGNOSTICS_MAX_BYTES
  const now = options.now ?? (() => new Date())
  const fallback = options.fallback ?? ((level, line) => {
    if (level === 'error') console.error(line.trimEnd())
    else console.warn(line.trimEnd())
  })
  const secrets = new Map<string, string>()
  let size: number | null = null
  let failed = false
  let queue: Promise<void> = Promise.resolve()

  const write = async (line: string): Promise<void> => {
    if (size === null) {
      await fs.mkdir(options.dir, { recursive: true })
      size = await fs.stat(filePath).then((stat) => stat.size, () => 0)
    }
    const bytes = Buffer.byteLength(line)
    if (size > 0 && size + bytes > maxBytes) {
      await fs.rm(oldFilePath, { force: true })
      await fs.rename(filePath, oldFilePath)
      size = 0
    }
    await fs.appendFile(filePath, line, 'utf8')
    size += bytes
  }

  const writeSync = (line: string): void => {
    if (size === null) {
      mkdirSync(options.dir, { recursive: true })
      try {
        size = statSync(filePath).size
      } catch {
        size = 0
      }
    }
    const bytes = Buffer.byteLength(line)
    if (size > 0 && size + bytes > maxBytes) {
      rmSync(oldFilePath, { force: true })
      renameSync(filePath, oldFilePath)
      size = 0
    }
    appendFileSync(filePath, line, 'utf8')
    size += bytes
  }

  const formatLine = (level: DiagnosticsLevel, source: string, message: string, stack?: string): string =>
    redactDiagnostics(formatDiagnosticsEntry(now(), level, source, message, stack), secrets.values())

  const append = (level: DiagnosticsLevel, source: string, message: string, stack?: string): void => {
    const line = formatLine(level, source, message, stack)
    if (failed) {
      fallback(level, line)
      return
    }
    queue = queue.then(() => write(line)).catch(() => {
      failed = true
      fallback(level, line)
    })
  }

  const errorEntry = (message: string, error: unknown): [string, string | undefined] => {
    const stack = errorStack(error)
    return [error !== undefined && !stack ? `${message}: ${errorMessage(error)}` : message, stack]
  }

  return {
    filePath,
    append,
    log(level, source, message, error) {
      append(level, source, ...errorEntry(message, error))
    },
    logSync(level, source, message, error) {
      let line: string
      try {
        line = formatLine(level, source, ...errorEntry(message, error))
      } catch {
        return
      }
      if (!failed) {
        try {
          writeSync(line)
          return
        } catch {
          failed = true
        }
      }
      try {
        fallback(level, line)
      } catch {
        /* a fatal-path logger must not throw */
      }
    },
    setSecret(name, value) {
      if (value) secrets.set(name, value)
      else secrets.delete(name)
    },
    flush: () => queue,
  }
}

export interface RendererLogGate {
  /** Validate and cap a renderer entry; null when it is malformed or over the rate limit. */
  accept(key: number, entry: unknown): DiagnosticsLogEntry | null
  /** Count of entries dropped in the window that just ended, reported once. */
  takeDropped(key: number): number
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}… [truncated]` : value
}

export function createRendererLogGate(options: {
  perMinute?: number
  maxChars?: number
  now?: () => number
} = {}): RendererLogGate {
  const perMinute = options.perMinute ?? RENDERER_ENTRIES_PER_MINUTE
  const maxChars = options.maxChars ?? RENDERER_ENTRY_MAX_CHARS
  const now = options.now ?? (() => Date.now())
  type RateWindow = { start: number; count: number; dropped: number; reportable: number }
  const windows = new Map<number, RateWindow>()

  const windowFor = (key: number): RateWindow => {
    const time = now()
    let state = windows.get(key)
    if (!state) {
      state = { start: time, count: 0, dropped: 0, reportable: 0 }
      windows.set(key, state)
    } else if (time - state.start >= 60_000) {
      state.reportable += state.dropped
      state.start = time
      state.count = 0
      state.dropped = 0
    }
    return state
  }

  return {
    accept(key, entry) {
      const value = entry as Partial<DiagnosticsLogEntry> | null
      if (!value || typeof value !== 'object') return null
      if (value.level !== 'warn' && value.level !== 'error') return null
      if (typeof value.source !== 'string' || typeof value.message !== 'string') return null
      const state = windowFor(key)
      if (state.count >= perMinute) {
        state.dropped += 1
        return null
      }
      state.count += 1
      return {
        level: value.level,
        source: value.source.replace(/[^\w:.-]/g, '').slice(0, 64) || 'renderer',
        message: truncate(value.message, maxChars),
        ...(typeof value.stack === 'string' && value.stack ? { stack: truncate(value.stack, maxChars) } : {}),
      }
    },
    takeDropped(key) {
      const state = windows.get(key)
      if (!state) return 0
      windowFor(key)
      const dropped = state.reportable
      state.reportable = 0
      return dropped
    },
  }
}

let defaultLog: DiagnosticsLog | null = null

export function setDiagnosticsLog(log: DiagnosticsLog | null): void {
  defaultLog = log
}

export function getDiagnosticsLog(): DiagnosticsLog | null {
  return defaultLog
}

/** Write to the app diagnostics log; a no-op until the log is initialised. */
export function logDiagnostics(level: DiagnosticsLevel, source: string, message: string, error?: unknown): void {
  defaultLog?.log(level, source, message, error)
}

/** Synchronous `logDiagnostics` for handlers that run just before the process may exit. */
export function logDiagnosticsSync(level: DiagnosticsLevel, source: string, message: string, error?: unknown): void {
  defaultLog?.logSync(level, source, message, error)
}
