/**
 * Monaco-specific shortcut helpers — import from @beatbax/app-core/shortcuts/monaco in renderer only.
 * Do not import this module from the Electron main process.
 */
export { bindingToMonacoKeyChord } from './monaco-chord.js';
export {
  registerMonacoShortcut,
  registerMonacoShortcuts,
  type MonacoShortcutRegistration,
} from './setup-monaco.js';
