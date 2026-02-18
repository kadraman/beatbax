/**
 * BeatBax Engine Logger
 *
 * Centralized logging utility for BeatBax engine and apps.
 *
 * Features:
 * - Runtime configurable log levels
 * - Module namespaces (webaudio, ui, network, player, sequencer, etc.)
 * - Colorized console output (browser)
 * - Structured logging support
 * - WebAudio tracing helpers
 * - Safe production defaults (error-only)
 * - Works in Node.js and browser environments
 *
 * Usage:
 * ```typescript
 * import { createLogger } from '@beatbax/engine/util/logger';
 *
 * const log = createLogger('player');
 *
 * log.debug('Starting playback');
 * log.info({ event: 'started', duration: 120 });
 * log.warn('Buffer underrun detected');
 * log.error('Failed to initialize audio context', error);
 * ```
 */

export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';

export interface LoggerConfig {
  level: LogLevel;
  modules?: string[];
  timestamps?: boolean;
  webaudioTrace?: boolean;
  colorize?: boolean;
}

export interface Logger {
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  debug: (...args: any[]) => void;
}

// ---------- State ----------
let config: LoggerConfig = {
  level: 'error', // Safe production default
  modules: undefined,
  timestamps: true,
  webaudioTrace: false,
  colorize: typeof window !== 'undefined', // Auto-detect browser
};

const moduleSet = new Set<string>();

const levelOrder: LogLevel[] = ['none', 'error', 'warn', 'info', 'debug'];

// ---------- Configuration ----------

/**
 * Configure global logging settings.
 *
 * @example
 * ```typescript
 * configureLogging({
 *   level: 'debug',
 *   modules: ['player', 'sequencer'],
 *   timestamps: true,
 *   webaudioTrace: true
 * });
 * ```
 */
export function configureLogging(opts: Partial<LoggerConfig>): void {
  config = { ...config, ...opts };
  if (opts.modules) {
    moduleSet.clear();
    opts.modules.forEach(m => moduleSet.add(m));
  }

  // Only log configuration message if at info level or higher
  if (shouldLog('info')) {
    const method = config.colorize ? console.info : console.log;
    method('[BeatBax] Logging configured:', config);
  }
}

/**
 * Load logging configuration from localStorage (browser only).
 * Looks for keys: beatbax.loglevel, beatbax.modules, beatbax.webaudio
 */
export function loadLoggingFromStorage(): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const level = localStorage.getItem('beatbax.loglevel') as LogLevel | null;
    const modulesStr = localStorage.getItem('beatbax.modules');
    const modules = modulesStr ? modulesStr.split(',').map(m => m.trim()) : undefined;
    const webaudio = localStorage.getItem('beatbax.webaudio') === '1';

    if (level || modules || webaudio) {
      configureLogging({
        level: level ?? config.level,
        modules,
        webaudioTrace: webaudio
      });
    }
  } catch (e) {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Load logging configuration from URL query parameters (browser only).
 * Supports: ?loglevel=debug&debug=player,sequencer&webaudio=1
 */
export function loadLoggingFromURL(): void {
  if (typeof window === 'undefined' || typeof URLSearchParams === 'undefined') return;

  try {
    const params = new URLSearchParams(window.location.search);
    const level = params.get('loglevel') as LogLevel | null;
    const modulesStr = params.get('debug');
    const modules = modulesStr ? modulesStr.split(',').map(m => m.trim()) : undefined;
    const webaudioTrace = params.get('webaudio') === '1';

    if (level || modules || webaudioTrace) {
      configureLogging({
        level: level ?? config.level,
        modules,
        webaudioTrace
      });
    }
  } catch (e) {
    // Silently fail if URL parsing fails
  }
}

/**
 * Get current logging configuration.
 */
export function getLoggingConfig(): Readonly<LoggerConfig> {
  return { ...config };
}

// ---------- Helpers ----------

function shouldLog(level: LogLevel, module?: string): boolean {
  const levelIndex = levelOrder.indexOf(level);
  const configIndex = levelOrder.indexOf(config.level);

  if (levelIndex > configIndex) return false;
  if (module && moduleSet.size > 0 && !moduleSet.has(module)) return false;

  return true;
}

function formatTimestamp(): string {
  if (!config.timestamps) return '';

  const now = new Date();
  const iso = now.toISOString();
  return `${iso} `;
}

const colors: Record<string, string> = {
  default: 'color:#ccc',
  error: 'color:#ff6b6b',
  warn: 'color:#feca57',
  info: 'color:#48dbfb',
  debug: 'color:#1dd1a1',
};

function formatArgs(args: any[]): any[] {
  return args.map(arg => {
    // If it's a plain object with only data properties, format it nicely
    if (arg && typeof arg === 'object' && arg.constructor === Object) {
      // For structured logging, keep the object intact
      return arg;
    }
    return arg;
  });
}

function output(level: LogLevel, module: string | undefined, args: any[]): void {
  const prefix = `${formatTimestamp()}[${module ?? 'BeatBax'}]`;
  const formattedArgs = formatArgs(args);

  if (config.colorize) {
    const style = colors[level] ?? colors.default;
    const method = level === 'debug' ? 'log' : level;
    (console as any)[method](`%c${prefix}`, style, ...formattedArgs);
  } else {
    // Plain text output for Node.js or when colorization is disabled
    const method = level === 'debug' ? 'log' : level;
    (console as any)[method](prefix, ...formattedArgs);
  }
}

// ---------- Public Logger Factory ----------

/**
 * Create a namespaced logger for a specific module.
 *
 * @param module - Module name (e.g., 'player', 'sequencer', 'webaudio', 'ui')
 *
 * @example
 * ```typescript
 * const log = createLogger('player');
 *
 * log.debug('Initializing player');
 * log.info({ state: 'playing', position: 0 });
 * log.warn('Buffer underrun', { bufferSize: 2048 });
 * log.error('Audio context error', error);
 * ```
 */
export function createLogger(module: string): Logger {
  return {
    error: (...args: any[]) => {
      if (shouldLog('error', module)) {
        output('error', module, args);
      }
    },
    warn: (...args: any[]) => {
      if (shouldLog('warn', module)) {
        output('warn', module, args);
      }
    },
    info: (...args: any[]) => {
      if (shouldLog('info', module)) {
        output('info', module, args);
      }
    },
    debug: (...args: any[]) => {
      if (shouldLog('debug', module)) {
        output('debug', module, args);
      }
    },
  };
}

// ---------- WebAudio Tracing Helpers ----------

/**
 * Trace AudioNode creation (only when webaudioTrace is enabled).
 */
export function traceNodeCreation(node: AudioNode, name?: string): void {
  if (!config.webaudioTrace) return;

  if (config.colorize) {
    console.log(
      '%c[WebAudio] Node created:',
      'color:#9b59b6',
      name ?? node.constructor.name,
      node
    );
  } else {
    console.log('[WebAudio] Node created:', name ?? node.constructor.name, node);
  }
}

/**
 * Trace AudioNode connections (only when webaudioTrace is enabled).
 */
export function traceConnection(src: AudioNode, dest: AudioNode | AudioParam): void {
  if (!config.webaudioTrace) return;

  const destName = (dest as any).constructor?.name ?? 'AudioParam';

  if (config.colorize) {
    console.log(
      '%c[WebAudio] Connect:',
      'color:#9b59b6',
      src.constructor.name,
      '->',
      destName
    );
  } else {
    console.log('[WebAudio] Connect:', src.constructor.name, '->', destName);
  }
}

/**
 * Trace AudioNode disconnection (only when webaudioTrace is enabled).
 */
export function traceDisconnect(node: AudioNode): void {
  if (!config.webaudioTrace) return;

  if (config.colorize) {
    console.log('%c[WebAudio] Disconnect:', 'color:#9b59b6', node.constructor.name);
  } else {
    console.log('[WebAudio] Disconnect:', node.constructor.name);
  }
}

// ---------- Global Debug API (Browser Only) ----------

declare global {
  interface Window {
    beatbaxDebug?: {
      enable: (level?: LogLevel, modules?: string[]) => void;
      disable: () => void;
      webaudio: (on?: boolean) => void;
      config: () => LoggerConfig;
    };
  }
}

if (typeof window !== 'undefined') {
  window.beatbaxDebug = {
    /**
     * Enable debug logging.
     * @example window.beatbaxDebug.enable('debug', ['player', 'sequencer'])
     */
    enable(level: LogLevel = 'debug', modules?: string[]) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('beatbax.loglevel', level);
        if (modules) {
          localStorage.setItem('beatbax.modules', modules.join(','));
        }
        window.location.reload();
      }
    },

    /**
     * Disable debug logging (revert to default error-only).
     * @example window.beatbaxDebug.disable()
     */
    disable() {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('beatbax.loglevel');
        localStorage.removeItem('beatbax.modules');
        window.location.reload();
      }
    },

    /**
     * Enable/disable WebAudio tracing.
     * @example window.beatbaxDebug.webaudio(true)
     */
    webaudio(on = true) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('beatbax.webaudio', on ? '1' : '0');
        window.location.reload();
      }
    },

    /**
     * Get current logging configuration.
     * @example window.beatbaxDebug.config()
     */
    config() {
      return getLoggingConfig();
    },
  };

  // Auto-initialize from storage and URL
  loadLoggingFromStorage();
  loadLoggingFromURL();
}

// ---------- Export everything ----------

export default createLogger;
