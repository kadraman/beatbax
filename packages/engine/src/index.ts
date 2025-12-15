import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { parse } from './parser/index.js';
import { exportJSON, exportMIDI, exportWAV } from './export/index.js';

export interface PlayOptions {
  noBrowser?: boolean;
  browser?: boolean;
  backend?: 'auto' | 'node-webaudio' | 'browser';
  sampleRate?: number;
  renderTo?: string;
  duration?: number;
  channels?: number[]; // Which GB channels to render (1-4)
}

export async function playFile(path: string, options: PlayOptions = {}) {
  const src = readFileSync(path, 'utf8');
  const ast = parse(src);
  console.log('Parsed song AST:', JSON.stringify(ast, null, 2));

  const noBrowser = options.noBrowser || options.backend === 'node-webaudio';
  const renderTo = options.renderTo;

  // Attempt headless playback or offline rendering
  if (noBrowser || renderTo) {
    console.log('Rendering song using native PCM renderer...');
    
    try {
      const { resolveSong } = await import('./song/resolver.js');
      const { renderSongToPCM } = await import('./audio/pcmRenderer.js');
      
      const song = resolveSong(ast);
      const sampleRate = options.sampleRate || 44100;
      const duration = options.duration;
      const bpm = ast.bpm || 120;
      const renderChannels = options.channels;
      
      const samples = renderSongToPCM(song, { 
        sampleRate, 
        duration,
        channels: 2, // Use stereo to match browser
        bpm,
        renderChannels
      });
      
      if (renderTo) {
        // Export to WAV file
        await exportWAV(samples, renderTo, {
          sampleRate,
          bitDepth: 16,
          channels: 2 // Use stereo to match browser
        });
        console.log(`✓ Rendered to ${renderTo}`);
      } else {
        // Real-time playback via speaker
        try {
          // Resolve absolute path to cli module  
          const path = await import('path');
          const url = await import('url');
          const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
          const cliPath = path.resolve(__dirname, '../../cli/dist/nodeAudioPlayer.js');
          const cliUrl = url.pathToFileURL(cliPath).href;
          
          const { playAudioBuffer } = await import(cliUrl);
          console.log('Playing audio via system speakers...');
          await playAudioBuffer(samples, { channels: 2, sampleRate }); // Use stereo
          console.log('✓ Playback complete');
        } catch (err: any) {
          console.error('Failed to play audio:', err.message);
          console.log('\nTip: Install speaker module: npm install --workspace=packages/cli speaker');
          console.log('Or use --render-to <file.wav> to export to WAV file instead.');
          process.exitCode = 1;
        }
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
    const { Player } = await import('./audio/playback.js');
    const p = new Player();
    await p.playAST(ast);
    console.log('✓ Playback started (WebAudio)');
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
          const server = child.spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev'], { 
            cwd: viteDir,
            detached: true, 
            stdio: 'ignore'
          });
          server.unref();
        } catch (e) {
          console.warn('Failed to start Vite server:', e);
        }

        // Give Vite a moment to start, then open browser
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
            });
          } catch (e) {
            console.log('Please open the URL in your browser:', url);
          }
        }, 2000);
      } catch (err) {
        console.error('Failed to launch browser-based playback:', err);
        console.log('Please run manually: cd apps/web-ui && npm run dev');
      }
    } else {
      // Default: show helpful message instead of auto-launching
      console.log('\n⚠️  CLI playback not available in Node.js environment.');
      console.log('\nPlayback options:');
      console.log(`  • Browser playback: npm run cli -- play ${path} --browser`);
      console.log('  • Web UI: cd apps/web-ui && npm run dev (then load your song)');
      console.log('\nNote: Headless CLI playback requires native audio bindings (future feature)');
      console.log('Use --browser flag to launch browser-based playback.\n');
      process.exitCode = 1;
    }
  }
}

/**
 * Write an AudioBuffer to a WAV file
 */
async function writeWAVFile(filePath: string, buffer: AudioBuffer): Promise<void> {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2; // 16-bit PCM
  
  // Interleave channels
  const interleaved = new Int16Array(length * numberOfChannels);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i])); // Clamp
      interleaved[i * numberOfChannels + ch] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
  }
  
  // WAV file structure
  const dataSize = interleaved.length * bytesPerSample;
  const buffer32 = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer32);
  
  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // File size - 8
  writeString(view, 8, 'WAVE');
  
  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * bytesPerSample, true); // ByteRate
  view.setUint16(32, numberOfChannels * bytesPerSample, true); // BlockAlign
  view.setUint16(34, bytesPerSample * 8, true); // BitsPerSample
  
  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Write PCM samples
  const pcmData = new Uint8Array(buffer32, 44);
  pcmData.set(new Uint8Array(interleaved.buffer));
  
  writeFileSync(filePath, Buffer.from(buffer32));
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export { exportJSON, exportMIDI, exportWAV };
export { renderSongToPCM } from './audio/pcmRenderer.js';
export * from './import/index.js';
