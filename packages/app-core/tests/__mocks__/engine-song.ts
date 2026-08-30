export function resolveSong(ast: any) {
  const channels = (ast?.channels ?? []).map((ch: any) => ({
    ...ch,
    events: ch.events ?? [],
    defaultInstrument: ch.inst ?? ch.defaultInstrument ?? 'lead',
  }));
  return {
    ...(typeof ast === 'object' && ast ? ast : {}),
    bpm: ast?.bpm ?? 120,
    chip: ast?.chip ?? 'gameboy',
    pats: ast?.pats ?? {},
    channels,
  };
}

export async function resolveImports(ast: any) {
  return ast;
}

export default { resolveSong, resolveImports };
