declare module '@beatbax/engine/util/logger' {
  export function createLogger(_name: string): {
    debug: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}
