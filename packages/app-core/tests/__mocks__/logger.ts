/**
 * Mock logger for tests
 * Prevents console output during test runs
 * Returns the same logger instance for the same module name
 */

const loggers = new Map<string, any>();

export const createLogger = (module: string) => {
  if (!loggers.has(module)) {
    loggers.set(module, {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    });
  }
  return loggers.get(module);
};

export const configureLogging = jest.fn();
export const loadLoggingFromStorage = jest.fn();
export const saveLoggingToStorage = jest.fn();
export const loadLoggingFromURL = jest.fn();
export const getLoggingConfig = jest.fn(() => ({
  level: 'error',
  modules: undefined,
  timestamps: true,
  webaudioTrace: false,
  colorize: false,
}));

// Helper to clear all logger mocks (useful in tests)
export const clearLoggerMocks = () => {
  loggers.forEach(logger => {
    logger.error.mockClear();
    logger.warn.mockClear();
    logger.info.mockClear();
    logger.debug.mockClear();
  });
};
