export function parseEffectParams(paramsStr: string | undefined): Array<string | number> {
  if (!paramsStr || !paramsStr.length) return [];
  // Split on top-level commas only, preserving bracketed payloads such as
  // pitch_env:[0,2,0,-2,0] as a single parameter token.
  const parts: string[] = [];
  let current = '';
  let bracketDepth = 0;

  for (let i = 0; i < paramsStr.length; i++) {
    const ch = paramsStr[i];
    if (ch === '[') bracketDepth++;
    if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);

    if (ch === ',' && bracketDepth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());

  return parts
    .filter(s => s !== '')
    .map(s => (isNaN(Number(s)) ? s : Number(s)));
}

export function parseEffectsInline(str: string) {
  // Keep empty parts so positional empty parameters are preserved (e.g. "vib:3,6,,8")
  const rawParts = str.split(',').map(s => s.trim());
  const effects: Array<{ type: string; params: Array<string | number>; paramsStr?: string }> = [];
  let pan: any = undefined;

  // Group parts so that effect parameters following a `type:...` are attached
  // to that effect until the next part that contains a colon (start of next effect).
  let currentEffect: { type: string; paramsStr?: string } | null = null;
  for (const p of rawParts) {
    // Detect namespaced pan tokens first: gb:pan:L, pan:L, pan=-0.5
    const panMatch = p.match(/^(?:(gb):)?pan[:=](-?\d*\.?\d+|L|R|C)$/i);
    if (panMatch) {
      const [, ns, val] = panMatch;
      const up = String(val).toUpperCase();
      if (up === 'L' || up === 'R' || up === 'C') {
        pan = { enum: up as 'L'|'R'|'C', sourceNamespace: ns || undefined };
      } else {
        const num = Number(val);
        if (!Number.isNaN(num)) pan = { value: Math.max(-1, Math.min(1, num)), sourceNamespace: ns || undefined };
      }
      // finalize any pending effect before continuing
      if (currentEffect) {
        effects.push({ type: currentEffect.type, params: parseEffectParams(currentEffect.paramsStr) });
        currentEffect = null;
      }
      continue;
    }

    // Check if this part starts a new effect (contains a colon)
    const m = p.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):(.*)$/);
    if (m && m[1]) {
      // This part has a colon, so it's a new effect type:params
      if (currentEffect) {
        effects.push({ type: currentEffect.type, params: parseEffectParams(currentEffect.paramsStr), paramsStr: currentEffect.paramsStr });
      }
      currentEffect = { type: m[1], paramsStr: m[2] };
    } else if (currentEffect) {
      // This part is an additional parameter for the current effect
      currentEffect.paramsStr = (currentEffect.paramsStr ? (currentEffect.paramsStr + ',' + p) : p);
    } else {
      // Bare identifier with no colon - treat as an effect type with no params (preset name)
      const bareMatch = p.match(/^[a-zA-Z_][a-zA-Z0-9_-]*$/);
      if (bareMatch) {
        currentEffect = { type: p, paramsStr: '' };
      }
    }
    // Otherwise orphaned - ignore it
  }
  if (currentEffect) {
    effects.push({ type: currentEffect.type, params: parseEffectParams(currentEffect.paramsStr), paramsStr: currentEffect.paramsStr });
  }
  return { effects, pan };
}
