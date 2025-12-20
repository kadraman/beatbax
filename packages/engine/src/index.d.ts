import { exportJSON, exportMIDI, exportWAV } from './export/index.js';

export interface PlayOptions {
  noBrowser?: boolean;
  browser?: boolean;
  backend?: 'auto' | 'node-webaudio' | 'browser';
  sampleRate?: number;
  duration?: number;
  channels?: number[]; // Which GB channels to render (1-4)
  verbose?: boolean;
}

export declare function playFile(path: string, options?: PlayOptions): Promise<void>;
export { exportJSON, exportMIDI, exportWAV };
export { renderSongToPCM } from './audio/pcmRenderer.js';
export * from './import/index.js';
//# sourceMappingURL=index.d.ts.map