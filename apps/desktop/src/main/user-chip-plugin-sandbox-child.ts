/**
 * Launch the sandboxed Electron validator from a Node test process.
 * The plugin source is not imported here.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface ValidatorChild {
  dir: string;
  child: ChildProcess;
  chain: Promise<void>;
  stderr: string[];
}

let starting: Promise<ValidatorChild> | null = null;
let activeChild: ChildProcess | null = null;
let bundlePath: string | null = null;

function electronBinary(): string {
  const roots = [
    path.resolve(process.cwd(), 'node_modules/electron'),
    path.resolve(process.cwd(), '../../node_modules/electron'),
    path.resolve(__dirname, '../../node_modules/electron'),
    path.resolve(__dirname, '../../../../node_modules/electron'),
  ];
  for (const root of roots) {
    const pathFile = path.join(root, 'path.txt');
    if (!existsSync(pathFile)) continue;
    const relative = readFileSync(pathFile, 'utf8').trim();
    const binary = path.join(root, 'dist', relative);
    if (existsSync(binary)) return binary;
  }
  throw new Error('Could not resolve the Electron binary for sandboxed plugin validation.');
}

function sandboxMainEntry(): string {
  const candidates = [
    path.join(__dirname, 'user-chip-plugin-sandbox-main.ts'),
    path.resolve(process.cwd(), 'src/main/user-chip-plugin-sandbox-main.ts'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Cannot find user-chip-plugin-sandbox-main.ts');
}

async function bundledEntry(): Promise<string> {
  if (bundlePath && existsSync(bundlePath)) return bundlePath;
  const esbuild = await import('esbuild');
  const outfile = path.join(tmpdir(), 'beatbax-plugin-sandbox-main.cjs');
  await esbuild.build({
    entryPoints: [sandboxMainEntry()],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    external: ['electron', 'esbuild'],
    logLevel: 'silent',
  });
  bundlePath = outfile;
  return outfile;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startValidator(): Promise<ValidatorChild> {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-chip-sandbox-'));
  const entry = await bundledEntry();
  // Prebuild the engine-host browser bundle in this Node/Jest process. Doing it
  // inside the Electron child during the first protocol request blocks the main
  // loop so the validation watchdog cannot fire and requests time out on CI.
  const { ensureValidationEngineHostFile } = await import('./user-chip-plugin-validation-host-build');
  const hostFile = await ensureValidationEngineHostFile();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.BEATBAX_VALIDATE_DIR = dir;
  env.BEATBAX_VALIDATION_ENGINE_HOST = hostFile;
  // This helper only spawns Electron for Jest. Production install validation runs
  // inside the already-running Desktop app (loadPluginShapeInSandbox) and never
  // takes this path.
  // - BEATBAX_ELECTRON_NO_SANDBOX=1: CI opt-in when chrome-sandbox SUID cannot be set.
  // - Linux needs a real $DISPLAY (Xvfb in CI). Ozone headless writes ready but
  //   never finishes sandboxed BrowserWindow validation.
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    throw new Error(
      'Sandboxed plugin validation needs a display on Linux. Run under Xvfb (e.g. xvfb-run) or set $DISPLAY.'
    );
  }
  const electronArgs: string[] = [];
  if (process.env.BEATBAX_ELECTRON_NO_SANDBOX === '1') {
    electronArgs.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  electronArgs.push(entry);
  const child = spawn(electronBinary(), electronArgs, {
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  activeChild = child;
  const stderr: string[] = [];
  child.stderr.on('data', (chunk: Buffer) => {
    stderr.push(String(chunk));
    if (stderr.length > 40) stderr.shift();
  });
  const ready = path.join(dir, 'ready');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Sandboxed validator exited before ready (code ${child.exitCode}). ${stderr.join('').slice(-2000)}`
      );
    }
    if (existsSync(ready)) {
      return { dir, child, chain: Promise.resolve(), stderr };
    }
    await sleep(25);
  }
  child.kill();
  throw new Error(`Sandboxed validator did not become ready. ${stderr.join('').slice(-2000)}`);
}

function validator(): Promise<ValidatorChild> {
  if (!starting) {
    starting = startValidator().catch((error) => {
      starting = null;
      throw error;
    });
  }
  return starting;
}

export function stopSandboxValidator(): void {
  const child = activeChild;
  activeChild = null;
  starting = null;
  if (child && child.exitCode === null) child.kill();
}

process.on('exit', () => {
  if (activeChild && activeChild.exitCode === null) activeChild.kill();
});

export async function loadPluginShapeInSandboxChild(options: {
  packageDir: string;
  entryRelativePath: string;
}): Promise<{ name: string; aliases: string[] }> {
  const session = await validator();
  const run = session.chain.then(async () => {
    if (session.child.exitCode !== null) {
      starting = null;
      throw new Error('Sandboxed validator is no longer running.');
    }
    const responsePath = path.join(session.dir, 'response.json');
    if (existsSync(responsePath)) rmSync(responsePath);
    const requestTmp = path.join(session.dir, 'request.json.tmp');
    const requestId = randomBytes(8).toString('hex');
    writeFileSync(requestTmp, JSON.stringify({ ...options, id: requestId }));
    renameSync(requestTmp, path.join(session.dir, 'request.json'));
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (session.child.exitCode !== null) {
        starting = null;
        throw new Error(`Sandboxed validator exited during validation (code ${session.child.exitCode}).`);
      }
      if (existsSync(responsePath)) {
        const body = JSON.parse(readFileSync(responsePath, 'utf8')) as {
          id?: string;
          ok: boolean;
          name?: string;
          aliases?: string[];
          error?: string;
        };
        rmSync(responsePath, { force: true });
        if (body.id !== requestId) continue;
        if (!body.ok) throw new Error(body.error || 'Plugin validation failed.');
        return {
          name: body.name || '',
          aliases: Array.isArray(body.aliases) ? body.aliases : [],
        };
      }
      await sleep(25);
    }
    session.child.kill();
    activeChild = null;
    starting = null;
    const detail = session.stderr.length ? ` ${session.stderr.join('').slice(-2000)}` : '';
    throw new Error(`Sandboxed plugin validation timed out.${detail}`);
  });
  session.chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
