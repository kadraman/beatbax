import { readFileSync } from 'fs';
import { parse } from './parser';
import { exportJSON, exportMIDI } from './export';

export async function playFile(path: string) {
  const src = readFileSync(path, 'utf8');
  const ast = parse(src);
  console.log('Parsed song AST:', JSON.stringify(ast, null, 2));
  // TODO: hook into scheduler/audio to play AST
}

export { exportJSON, exportMIDI };
