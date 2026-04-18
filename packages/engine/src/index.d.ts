import { exportJSON, exportMIDI, exportWAV } from './export/index.js';
export interface PlayOptions {
    noBrowser?: boolean;
    browser?: boolean;
    backend?: 'auto' | 'node-webaudio' | 'browser';
    sampleRate?: number;
    duration?: number;
    channels?: number[];
    verbose?: boolean;
    bufferFrames?: number;
}
export declare function playFile(path: string, options?: PlayOptions): Promise<void>;
export { exportJSON, exportMIDI, exportWAV };
export { renderSongToPCM } from './audio/pcmRenderer.js';
export * from './import/index.js';
export type { InstrumentNode, InstMap, AST, PatternEvent, SequenceItem, ChannelNode, EnvelopeAST, SweepAST, NoiseAST } from './parser/ast.js';
export type { ChipPlugin, ChipChannelBackend, ValidationError, ChipUIContributions, ChipHelpSection } from './chips/types.js';
export { ChipRegistry, chipRegistry, gameboyPlugin } from './chips/index.js';
export { BeatBaxEngine } from './engine.js';
//# sourceMappingURL=index.d.ts.map