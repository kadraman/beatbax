/* BeatBaxLogger.ts
   Drop‑in logging utility for BeatBax web app
   Features:
   - Runtime configurable log levels
   - Module namespaces
   - Colorized console output
   - WebAudio tracing helpers
   - URL + localStorage config
   - Safe production defaults
*/

// ---------- Types ----------
export type LogLevel = "none" | "error" | "warn" | "info" | "debug";

interface LoggerConfig {
  level: LogLevel;
  modules?: string[];
  timestamps?: boolean;
  webaudioTrace?: boolean;
}

// ---------- State ----------
let config: LoggerConfig = {
  level: "error",
  modules: undefined,
  timestamps: true,
  webaudioTrace: false,
};

const moduleSet = new Set<string>();

const levelOrder: LogLevel[] = ["none", "error", "warn", "info", "debug"];

// ---------- Setup ----------
export function configureLogging(opts: Partial<LoggerConfig>) {
  config = { ...config, ...opts };
  if (opts.modules) {
    moduleSet.clear();
    opts.modules.forEach(m => moduleSet.add(m));
  }
  console.info("BeatBax logging configured:", config);
}

export function loadLoggingFromStorage() {
  try {
    const level = localStorage.getItem("beatbax.loglevel") as LogLevel | null;
    const modules = localStorage.getItem("beatbax.modules")?.split(",");
    const webaudio = localStorage.getItem("beatbax.webaudio") === "1";

    configureLogging({ level: level ?? config.level, modules, webaudioTrace: webaudio });
  } catch {}
}

export function loadLoggingFromURL() {
  const params = new URLSearchParams(location.search);

  const level = params.get("loglevel") as LogLevel | null;
  const modules = params.get("debug")?.split(",");
  const webaudioTrace = params.get("webaudio") === "1";

  if (level || modules || webaudioTrace) {
    configureLogging({ level: level ?? config.level, modules, webaudioTrace });
  }
}

// ---------- Helpers ----------
function shouldLog(level: LogLevel, module?: string) {
  if (levelOrder.indexOf(level) > levelOrder.indexOf(config.level)) return false;
  if (module && moduleSet.size && !moduleSet.has(module)) return false;
  return true;
}

function ts() {
  return config.timestamps ? new Date().toISOString() + " " : "";
}

const colors: Record<string, string> = {
  default: "color:#ccc",
  error: "color:#ff6b6b",
  warn: "color:#feca57",
  info: "color:#48dbfb",
  debug: "color:#1dd1a1",
};

function output(level: LogLevel, module: string | undefined, args: any[]) {
  const prefix = `${ts()}[${module ?? "BeatBax"}]`;
  const style = colors[level] ?? colors.default;
  const method = level === "debug" ? "log" : level;
  (console as any)[method](`%c${prefix}`, style, ...args);
}

// ---------- Public Logger ----------
export function createLogger(module: string) {
  return {
    error: (...a: any[]) => shouldLog("error", module) && output("error", module, a),
    warn: (...a: any[]) => shouldLog("warn", module) && output("warn", module, a),
    info: (...a: any[]) => shouldLog("info", module) && output("info", module, a),
    debug: (...a: any[]) => shouldLog("debug", module) && output("debug", module, a),
  };
}

// ---------- WebAudio Helpers ----------
export function traceNodeCreation(node: AudioNode, name?: string) {
  if (!config.webaudioTrace) return;
  console.log("%c[WebAudio] Node created:", "color:#9b59b6", name ?? node.constructor.name, node);
}

export function traceConnection(src: AudioNode, dest: AudioNode | AudioParam) {
  if (!config.webaudioTrace) return;
  console.log("%c[WebAudio] Connect:", "color:#9b59b6", src.constructor.name, "->", (dest as any).constructor?.name ?? "AudioParam");
}

export function traceDisconnect(node: AudioNode) {
  if (!config.webaudioTrace) return;
  console.log("%c[WebAudio] Disconnect:", "color:#9b59b6", node.constructor.name);
}

// ---------- Global Console API ----------
declare global {
  interface Window {
    beatbaxDebug?: any;
  }
}

window.beatbaxDebug = {
  enable(level: LogLevel = "debug", modules?: string[]) {
    localStorage.setItem("beatbax.loglevel", level);
    if (modules) localStorage.setItem("beatbax.modules", modules.join(","));
    location.reload();
  },
  disable() {
    localStorage.removeItem("beatbax.loglevel");
    localStorage.removeItem("beatbax.modules");
    location.reload();
  },
  webaudio(on = true) {
    localStorage.setItem("beatbax.webaudio", on ? "1" : "0");
    location.reload();
  }
};

// ---------- Auto Init ----------
if (typeof window !== "undefined") {
  loadLoggingFromStorage();
  loadLoggingFromURL();
}

/* ---------- Example Usage ----------
import { createLogger, traceNodeCreation, traceConnection } from './BeatBaxLogger';

const log = createLogger('webaudio');

log.debug('Starting synth');

const osc = audioCtx.createOscillator();
traceNodeCreation(osc, 'LeadOsc');

osc.connect(audioCtx.destination);
traceConnection(osc, audioCtx.destination);
*/
