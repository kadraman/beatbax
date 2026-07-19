/** Minimal XML helpers for deterministic Arkos serialization. */

export function esc(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function tag(name: string, value: string | number | boolean): string {
  return `<${name}>${esc(String(value))}</${name}>`;
}

export function indent(level: number): string {
  return '  '.repeat(level);
}

export function line(level: number, content: string): string {
  return `${indent(level)}${content}`;
}
