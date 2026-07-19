import { line, tag } from './xml.js';

/**
 * AT3 requires non-empty `<arpeggios>` and `<pitches>` roots, each with at least
 * one `<expression>` child. Empty self-closing tags cause:
 *   "No Expressions node found! Abnormal." / "Expressions could not be deserialize!"
 */
export function serializeDefaultExpressions(level: number): string[] {
  return [
    ...serializeExpressionRoot('arpeggios', true, level),
    ...serializeExpressionRoot('pitches', false, level),
  ];
}

function serializeExpressionRoot(
  rootName: 'arpeggios' | 'pitches',
  isArpeggio: boolean,
  level: number,
): string[] {
  const out: string[] = [];
  out.push(line(level, `<${rootName}>`));
  out.push(line(level + 1, '<expression>'));
  out.push(line(level + 2, tag('name', 'Default')));
  out.push(line(level + 2, tag('isArpeggio', isArpeggio)));
  out.push(line(level + 2, tag('speed', 0)));
  out.push(line(level + 2, tag('shift', 0)));
  out.push(line(level + 2, tag('loopStartIndex', 0)));
  out.push(line(level + 2, tag('endIndex', 0)));
  out.push(line(level + 2, '<values>'));
  out.push(line(level + 3, tag('value', 0)));
  out.push(line(level + 2, '</values>'));
  out.push(line(level + 1, '</expression>'));
  out.push(line(level, `</${rootName}>`));
  return out;
}
