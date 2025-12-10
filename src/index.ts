import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { parse } from './parser';
import { exportJSON, exportMIDI } from './export';
// import Player lazily to avoid requiring WebAudio in Node test environments
let Player: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Player = require('./audio/playback').Player;
} catch (e) {
  // ignore — playback may only be available in browser
}

export async function playFile(path: string) {
  const src = readFileSync(path, 'utf8');
  const ast = parse(src);
  console.log('Parsed song AST:', JSON.stringify(ast, null, 2));
  if (Player) {
    try {
      const p = new Player();
      await p.playAST(ast);
      console.log('Playback started (WebAudio)');
    } catch (err) {
      console.error('Failed to start playback:', err);
    }
  } else {
    console.log('Playback not available in this environment. Launching local demo in your browser...');
    try {
      // Copy the source file into demo/songs so the demo can fetch it
      const pathModule = await import('path');
      const child = await import('child_process');
      const basename = pathModule.basename(path);
      const outDir = pathModule.join(process.cwd(), 'demo', 'songs');
      try { mkdirSync(outDir, { recursive: true }); } catch (e) {}
      const outPath = pathModule.join(outDir, basename);
      writeFileSync(outPath, src, 'utf8');

      // Start a static server serving the demo directory (npx http-server demo -p 8080)
      try {
        const server = child.spawn('npx', ['http-server', 'demo', '-p', '8080'], { detached: true, stdio: 'ignore', shell: false });
        server.unref();
      } catch (e) {
        // ignore server spawn errors — user may run `npm run demo` instead
      }

      const url = `http://127.0.0.1:8080/?song=/songs/${encodeURIComponent(basename)}`;
      console.log('Opening demo at', url);
      // open default browser (cross-platform)
      const platform = process.platform;
      let cmd = '';
      if (platform === 'win32') cmd = `start "" "${url}"`;
      else if (platform === 'darwin') cmd = `open "${url}"`;
      else cmd = `xdg-open "${url}"`;
      try {
        child.exec(cmd, (err: any) => { if (err) console.error('Failed to open browser:', err); });
      } catch (e) {
        console.log('Please open the URL in your browser:', url);
      }
    } catch (err) {
      console.error('Failed to launch demo browser playback:', err);
      console.log('Please open the demo manually and load the file.');
    }
  }
}

export { exportJSON, exportMIDI };
export * from './import';
