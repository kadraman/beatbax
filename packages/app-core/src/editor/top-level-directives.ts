/**
 * Top-level BeatBax statement prefixes recognized by the document formatter.
 * Includes deprecated directives (time, ticksPerStep) that remain valid for legacy songs.
 */
export const TOP_LEVEL_DIRECTIVE_RE =
  /^\s*(song|chip|bpm|stepsPerBar|time|ticksPerStep|inst|pat|seq|channel|play|export|import)\b/;

export function isTopLevelBaxLine(line: string): boolean {
  return TOP_LEVEL_DIRECTIVE_RE.test(line);
}
