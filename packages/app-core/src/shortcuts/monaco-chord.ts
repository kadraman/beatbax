import { KeyCode, KeyMod } from 'monaco-editor';
import type { ShortcutBinding } from './types.js';
import { normaliseKey } from './match.js';

const LETTER_KEY_CODES: Record<string, number> = {
  a: KeyCode.KeyA,
  b: KeyCode.KeyB,
  c: KeyCode.KeyC,
  d: KeyCode.KeyD,
  e: KeyCode.KeyE,
  f: KeyCode.KeyF,
  g: KeyCode.KeyG,
  h: KeyCode.KeyH,
  i: KeyCode.KeyI,
  j: KeyCode.KeyJ,
  k: KeyCode.KeyK,
  l: KeyCode.KeyL,
  m: KeyCode.KeyM,
  n: KeyCode.KeyN,
  o: KeyCode.KeyO,
  p: KeyCode.KeyP,
  q: KeyCode.KeyQ,
  r: KeyCode.KeyR,
  s: KeyCode.KeyS,
  t: KeyCode.KeyT,
  u: KeyCode.KeyU,
  v: KeyCode.KeyV,
  w: KeyCode.KeyW,
  x: KeyCode.KeyX,
  y: KeyCode.KeyY,
  z: KeyCode.KeyZ,
};

const SPECIAL_KEY_CODES: Record<string, number> = {
  enter: KeyCode.Enter,
  f1: KeyCode.F1,
  f5: KeyCode.F5,
  f8: KeyCode.F8,
  ',': KeyCode.Comma,
  '.': KeyCode.Period,
  '`': KeyCode.Backquote,
};

function keyCodeForBinding(binding: ShortcutBinding): number | null {
  const key = normaliseKey(binding.key);
  if (LETTER_KEY_CODES[key]) return LETTER_KEY_CODES[key];
  if (SPECIAL_KEY_CODES[key]) return SPECIAL_KEY_CODES[key];
  if (SPECIAL_KEY_CODES[binding.key]) return SPECIAL_KEY_CODES[binding.key];
  return null;
}

/** Convert a catalog binding to a Monaco KeyMod | KeyCode chord. */
export function bindingToMonacoKeyChord(binding: ShortcutBinding): number | null {
  const keyCode = keyCodeForBinding(binding);
  if (keyCode == null) return null;

  let chord = 0;
  if (binding.ctrl) chord |= KeyMod.CtrlCmd;
  if (binding.alt) chord |= KeyMod.Alt;
  if (binding.shift) chord |= KeyMod.Shift;
  return chord | keyCode;
}
