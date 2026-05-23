/** Serialize Peggy syntax-error metadata on Monaco marker `code` fields. */

export interface PeggyParseHint {
  expectedLabels: string[];
  found: string | null;
}

export function peggyExpectedLabels(
  expected?: Array<{ type?: string; text?: string; description?: string }>,
): string[] {
  if (!expected?.length) return [];
  const labels: string[] = [];
  for (const e of expected) {
    if (e.text != null && e.text !== '') {
      labels.push(e.text);
      continue;
    }
    if (e.description) {
      labels.push(e.description);
      continue;
    }
    if (e.type === 'end') labels.push('end of input');
  }
  return [...new Set(labels)];
}

export function encodePeggyHintMarkerCode(
  expected?: Array<{ type?: string; text?: string; description?: string }>,
  found?: string | null,
): string | undefined {
  const expectedLabels = peggyExpectedLabels(expected);
  if (!expectedLabels.length && (found == null || found === '')) return undefined;
  return JSON.stringify({ expectedLabels, found: found ?? null } satisfies PeggyParseHint);
}

export function peggyHintFromMarkerCode(code: string | undefined): PeggyParseHint | null {
  if (!code) return null;
  try {
    const parsed = JSON.parse(code) as PeggyParseHint;
    if (!parsed?.expectedLabels?.length && parsed.found == null) return null;
    return parsed;
  } catch {
    return null;
  }
}
