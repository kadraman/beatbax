import type { ExporterPlugin } from '../types.js';
import { jsonExporterPlugin } from './json.plugin.js';
import { midiExporterPlugin } from './midi.plugin.js';
import { ugeExporterPlugin } from './uge.plugin.js';
import { wavExporterPlugin } from './wav.plugin.js';

export const BUILTIN_EXPORTER_PLUGINS: ExporterPlugin[] = [
  jsonExporterPlugin,
  midiExporterPlugin,
  ugeExporterPlugin,
  wavExporterPlugin,
];

export {
  jsonExporterPlugin,
  midiExporterPlugin,
  ugeExporterPlugin,
  wavExporterPlugin,
};
