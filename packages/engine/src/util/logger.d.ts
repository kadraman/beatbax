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
export declare function configureLogging(opts: Partial<LoggerConfig>): void;
/**
 * Load logging configuration from localStorage (browser only).
 * Looks for keys: beatbax:loglevel, beatbax:debug, beatbax:logcolor
 */
export declare function loadLoggingFromStorage(): void;
/**
 * Save current logging configuration to localStorage (browser only).
 */
export declare function saveLoggingToStorage(): void;
/**
 * Load logging configuration from URL query parameters (browser only).
 * Supports: ?loglevel=debug&debug=player,sequencer&logcolor=true
 */
export declare function loadLoggingFromURL(): void;
/**
 * Get current logging configuration.
 */
export declare function getLoggingConfig(): Readonly<LoggerConfig>;
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
export declare function createLogger(module: string): Logger;
/**
 * Trace AudioNode creation (only when webaudioTrace is enabled).
 */
export declare function traceNodeCreation(node: AudioNode, name?: string): void;
/**
 * Trace AudioNode connections (only when webaudioTrace is enabled).
 */
export declare function traceConnection(src: AudioNode, dest: AudioNode | AudioParam): void;
/**
 * Trace AudioNode disconnection (only when webaudioTrace is enabled).
 */
export declare function traceDisconnect(node: AudioNode): void;
declare global {
    interface Window {
        beatbaxDebug?: {
            setLevel: (level: LogLevel) => void;
            enable: (...modules: string[]) => void;
            disable: (...modules: string[]) => void;
            reset: () => void;
            webaudio: (enabled: boolean) => void;
            colorize: (enabled: boolean) => void;
            config: () => LoggerConfig;
        };
    }
}
export default createLogger;
//# sourceMappingURL=logger.d.ts.map