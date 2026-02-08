import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { parse } from './parser/index.js';
import { exportJSON, exportMIDI, exportWAV } from './export/index.js';
import { warn, error } from './util/diag.js';

/**
 * Wait for a directory to be ready (exists and is accessible).
 * Uses polling with exponential backoff up to a maximum timeout.
 * @param dirPath - Directory path to check
 * @param maxWaitMs - Maximum time to wait in milliseconds (default: 10000)
 * @param checkIntervalMs - Initial polling interval in milliseconds (default: 100)
 * @returns Promise that resolves when directory is ready or rejects on timeout
 */
async function waitForDirectory(
  dirPath: string,
  maxWaitMs: number = 10000,
  checkIntervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();
  let currentInterval = checkIntervalMs;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      // Check if directory exists and is accessible
      if (existsSync(dirPath)) {
        // Additional check: ensure we can list the directory
        const fs = await import('fs/promises');
        await fs.readdir(dirPath);
        return; // Directory is ready
      }
    } catch (err) {
      // Directory not accessible yet, continue polling
    }

    // Wait before next check with exponential backoff (max 1 second)
    await new Promise(resolve => setTimeout(resolve, currentInterval));
    currentInterval = Math.min(currentInterval * 1.5, 1000);
  }

  throw new Error(`Timeout waiting for directory "${dirPath}" to be ready after ${maxWaitMs}ms`);
}

/**
 * Wait for Vite dev server to be ready by checking if it responds to HTTP requests.
 * @param url - URL to check (default: http://localhost:5173)
 * @param maxWaitMs - Maximum time to wait in milliseconds (default: 10000)
 * @returns Promise that resolves when server is ready or rejects on timeout
 */
async function waitForViteServer(
  url: string = 'http://localhost:5173',
  maxWaitMs: number = 10000
): Promise<void> {
  const startTime = Date.now();
  let currentInterval = 200;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      // Try to fetch from the server
      const http = await import('http');
      await new Promise<void>((resolve, reject) => {
        const req = http.get(url, (res) => {
          // Any response means server is running
          if (res.statusCode) {
            resolve();
          } else {
            reject(new Error('No status code'));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000);
      });
      return; // Server is ready
    } catch (err) {
      // Server not ready yet, continue polling
    }

    // Wait before next check with exponential backoff (max 1 second)
    await new Promise(resolve => setTimeout(resolve, currentInterval));
    currentInterval = Math.min(currentInterval * 1.5, 1000);
  }

  throw new Error(`Timeout waiting for Vite server at ${url} after ${maxWaitMs}ms`);
}

export interface PlayOptions {
  noBrowser?: boolean;
  browser?: boolean;
  backend?: 'auto' | 'node-webaudio' | 'browser';
  sampleRate?: number;
  duration?: number;
  channels?: number[]; // Which channels to render
  verbose?: boolean;
  bufferFrames?: number;
}

export async function playFile(path: string, options: PlayOptions = {}) {
  const src = readFileSync(path, 'utf8');
  const ast = parse(src);
  if (options.verbose) {
    console.log('Parsed song AST:', JSON.stringify(ast, null, 2));
  }

  const isNode = typeof window === 'undefined';
  const noBrowser = options.noBrowser ||
                    options.backend === 'node-webaudio' ||
                    (isNode && !options.browser && options.backend !== 'browser');

  // Attempt headless playback
  if (noBrowser) {
    console.log('Rendering song using native PCM renderer...');

    try {
      const { resolveSongAsync } = await import('./song/resolver.js');
      const { renderSongToPCM } = await import('./audio/pcmRenderer.js');

      const song = await resolveSongAsync(ast, { filename: path, searchPaths: [process.cwd()] });

      // Check for echo effects and warn (PCM renderer doesn't support echo yet)
      let hasEchoEffects = false;
      if (song && song.channels) {
        for (const ch of song.channels) {
          if (ch && ch.events) {
            for (const evt of ch.events) {
              if (evt.type === 'note' && evt.effects && Array.isArray(evt.effects)) {
                for (const fx of evt.effects) {
                  const fxName = fx && fx.type ? fx.type : fx;
                  if (fxName === 'echo') {
                    hasEchoEffects = true;
                    break;
                  }
                }
              }
              if (hasEchoEffects) break;
            }
          }
          if (hasEchoEffects) break;
        }
      }

      if (hasEchoEffects) {
        warn('play', 'Echo/delay effects detected in song but are not supported in PCM renderer (CLI playback). Echo effects will be ignored. Use --browser flag for echo support.');
      }
      const sampleRate = options.sampleRate || 44100;
      const duration = options.duration;
      const bpm = ast.bpm || 128;
      const renderChannels = options.channels;

      const samples = renderSongToPCM(song, {
        sampleRate,
        duration,
        channels: 2, // Use stereo to match browser
        bpm,
        renderChannels
      });

      // Real-time playback via speaker
      try {
        // Resolve absolute path to cli module
        const path = await import('path');
        const url = await import('url');
        const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

        let cliPath = path.resolve(__dirname, '../../cli/dist/nodeAudioPlayer.js');

        // Fallback for monorepo development where engine might be in node_modules but cli isn't linked
        if (!existsSync(cliPath)) {
          const monorepoPath = path.resolve(__dirname, '../../../../packages/cli/dist/nodeAudioPlayer.js');
          if (existsSync(monorepoPath)) {
            cliPath = monorepoPath;
          }
        }

        const cliUrl = url.pathToFileURL(cliPath).href;

        const { playAudioBuffer } = await import(cliUrl);
        console.log('Playing audio via system speakers...');
        if (ast.play?.repeat) {
          console.log('Repeat requested by play directive — looping until process exit (Ctrl-C to stop)');
          // Loop playback indefinitely; user may interrupt with Ctrl-C
          // Play sequentially to avoid overlapping audio
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            await playAudioBuffer(samples, { channels: 2, sampleRate });
          }
        } else {
          await playAudioBuffer(samples, { channels: 2, sampleRate }); // Use stereo
          console.log('[OK] Playback complete');
        }
      } catch (err: any) {
        error('engine', 'Failed to play audio: ' + (err && err.message ? err.message : String(err)));
        console.log('\nTip: Install speaker module: npm install --workspace=packages/cli speaker');
        console.log('Or use "export wav" to export to WAV file instead.');
        process.exitCode = 1;
      }
      return;
    } catch (err: any) {
      error('engine', 'Failed to render song: ' + (err.message ?? String(err)));
      if (err.stack) error('engine', String(err.stack));
      process.exitCode = 1;
      return;
    }
  }

  // Browser-based playback (requires explicit --browser flag)
  try {
    const { Player, createAudioContext } = await import('./audio/playback.js');
    const ctx = await createAudioContext({
      sampleRate: options.sampleRate,
      backend: options.backend
    });
    const p = new Player(ctx);
    await p.playAST(ast);
    console.log('[OK] Playback started (WebAudio)');
  } catch (err) {
    // WebAudio not available in Node.js environment
    if (options.browser) {
      // User explicitly requested browser playback
      console.log('Launching browser-based playback with Vite dev server...');
      try {
        // Resolve imports before copying to browser (imports won't work in browser context)
        const pathModule = await import('path');
        let resolvedSrc = src;

        if (ast.imports && ast.imports.length > 0) {
          // Filter imports for browser security - only block local imports, keep remote imports intact
          const { isLocalImport } = await import('./import/urlUtils.js');

          const localImports = ast.imports.filter(imp => isLocalImport(imp.source));
          const remoteImports = ast.imports.filter(imp => !isLocalImport(imp.source));

          // Warn about local imports - browser will error when trying to resolve them
          if (localImports.length > 0) {
            console.log(`⚠️  Warning: This song contains ${localImports.length} local file import(s) which will be blocked by browser security.`);
            console.log('   The browser will display an error when attempting to load this song.');
            console.log('   To play this song in the browser, replace local imports with remote imports (https:// or github:).');
          }

          if (remoteImports.length > 0) {
            console.log(`Browser will resolve ${remoteImports.length} remote import(s) at runtime`);
          }

          // Send source as-is to browser - let browser error on local imports for clear user feedback
          resolvedSrc = src;
        }

        // Copy the resolved source file into apps/web-ui/public/songs so the web UI can fetch it
        const child = await import('child_process');
        const basename = pathModule.basename(path);
        const outDir = pathModule.join(process.cwd(), 'apps', 'web-ui', 'public', 'songs');

        // Ensure output directory exists
        try {
          mkdirSync(outDir, { recursive: true });
        } catch (e) {
          warn('engine', `Failed to create output directory: ${e}`);
        }

        const outPath = pathModule.join(outDir, basename);

        // Start Vite dev server in apps/web-ui
        const viteDir = pathModule.join(process.cwd(), 'apps', 'web-ui');
        console.log('Starting Vite dev server...');
        try {
          const isWindows = process.platform === 'win32';
          const server = child.spawn('npm', ['run', 'dev'], {
            cwd: viteDir,
            detached: true,
            stdio: 'ignore',
            shell: true  // Required on Windows to find npm in PATH
          });
          server.unref();
        } catch (e) {
          warn('engine', 'Failed to start Vite server: ' + (e && (e as any).message ? (e as any).message : String(e)));
        }

        // Wait for output directory to be ready and Vite server to start
        try {
          await waitForDirectory(outDir, 10000);
          console.log('Output directory ready');
        } catch (err) {
          warn('engine', `Directory not ready, proceeding anyway: ${err}`);
        }

        // Write the resolved source file
        writeFileSync(outPath, resolvedSrc, 'utf8');
        console.log(`Resolved song written to: ${outPath}`);

        // Wait for Vite server to be ready before opening browser
        try {
          await waitForViteServer('http://localhost:5173', 10000);
          console.log('Vite dev server is ready');
        } catch (err) {
          warn('engine', `Vite server may not be ready: ${err}`);
          console.log('Waiting additional 2 seconds before opening browser...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Open browser
        const url = `http://localhost:5173/?song=/songs/${encodeURIComponent(basename)}`;
        console.log('Opening web UI at', url);

        // Open default browser (cross-platform)
        const platform = process.platform;
        let cmd = '';
        if (platform === 'win32') cmd = `start "" "${url}"`;
        else if (platform === 'darwin') cmd = `open "${url}"`;
        else cmd = `xdg-open "${url}"`;

        try {
          child.exec(cmd, (err: any) => {
            if (err) {
              error('engine', 'Failed to open browser: ' + (err.message ?? String(err)));
              console.log('Please open the URL in your browser:', url);
            }
          });
        } catch (e) {
          console.log('Please open the URL in your browser:', url);
        }
      } catch (err) {
        error('engine', 'Failed to launch browser-based playback: ' + (err && (err as any).message ? (err as any).message : String(err)));
        console.log('Please run manually: cd apps/web-ui && npm run dev');
      }
    } else {
      // Default: show helpful message instead of auto-launching
      console.log('\n[!] CLI playback not available in Node.js environment.');
      console.log('\nPlayback options:');
      console.log(`  - Browser playback: node bin/beatbax play ${path} --browser`);
      console.log(`  - Headless playback: node bin/beatbax play ${path} --headless`);
      console.log(`  - Direct command: node packages/cli/dist/cli.js play ${path} --headless`);
      console.log('  - Web UI: cd apps/web-ui && npm run dev (then load your song)');
      console.log('\nNote: Use direct node commands rather than npm scripts for flag arguments');
      console.log('      (npm strips flags like --headless due to argument passing limitations)\n');
      process.exitCode = 1;
    }
  }
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export { exportJSON, exportMIDI, exportWAV };
export { renderSongToPCM } from './audio/pcmRenderer.js';
export * from './import/index.js';