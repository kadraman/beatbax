import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { parse } from './parser/index.js';
import { exportJSON, exportMIDI, exportWAV } from './export/index.js';

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
      const { resolveSong } = await import('./song/resolver.js');
      const { renderSongToPCM } = await import('./audio/pcmRenderer.js');
      
      const song = resolveSong(ast);
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
        console.error('Failed to play audio:', err.message);
        console.log('\nTip: Install speaker module: npm install --workspace=packages/cli speaker');
        console.log('Or use "export wav" to export to WAV file instead.');
        process.exitCode = 1;
      }
      return;
    } catch (err: any) {
      console.error('Failed to render song:', err.message);
      console.error(err.stack);
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
        // Copy the source file into apps/web-ui/public/songs so the web UI can fetch it
        const pathModule = await import('path');
        const child = await import('child_process');
        const basename = pathModule.basename(path);
        const outDir = pathModule.join(process.cwd(), 'apps', 'web-ui', 'public', 'songs');
        try { mkdirSync(outDir, { recursive: true }); } catch (e) {}
        const outPath = pathModule.join(outDir, basename);
        writeFileSync(outPath, src, 'utf8');

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
          console.warn('Failed to start Vite server:', e);
        }

        // Give Vite a moment to start, then open browser
        await new Promise((resolve) => {
          setTimeout(() => {
            const url = `http://localhost:5173/?song=/songs/${encodeURIComponent(basename)}`;
            console.log('Opening web UI at', url);
            // open default browser (cross-platform)
            const platform = process.platform;
            let cmd = '';
            if (platform === 'win32') cmd = `start "" "${url}"`;
            else if (platform === 'darwin') cmd = `open "${url}"`;
            else cmd = `xdg-open "${url}"`;
            try {
              child.exec(cmd, (err: any) => { 
                if (err) console.error('Failed to open browser:', err);
                resolve(null);
              });
            } catch (e) {
              console.log('Please open the URL in your browser:', url);
              resolve(null);
            }
          }, 2000);
        });
      } catch (err) {
        console.error('Failed to launch browser-based playback:', err);
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
