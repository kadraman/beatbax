// Lazy-proxy to legacy tokenizer to avoid statically importing it into
// browser bundles. Callers can use `tokenize` or `Tokenizer` as before;
// the actual implementation is required at runtime only when first used.

// Legacy tokenizer support was removed as part of the Peggy migration.
// Callers should use the Peggy parser and structured tokenizers instead.
function legacyRemoved(): never {
	throw new Error('Legacy tokenizer has been removed after the Peggy migration. Use the Peggy parser and structured events instead.');
}

export function tokenize(_input: string): Token[] { legacyRemoved(); }

export class Tokenizer {
  constructor(_source?: string) { legacyRemoved(); }
}

export const TokenType = {} as any;

// Re-exporting types for TypeScript consumers (compile-time only)
export type Token = { type: string; value?: string; line: number; col: number };
