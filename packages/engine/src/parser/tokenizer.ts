// Lazy-proxy to legacy tokenizer to avoid statically importing it into
// browser bundles. Callers can use `tokenize` or `Tokenizer` as before;
// the actual implementation is required at runtime only when first used.

type LegacyModule = {
	tokenize: (input: string) => any;
	Tokenizer: any;
	TokenType?: any;
};

let _legacy: LegacyModule | null = null;
const loadLegacy = (): LegacyModule => {
	if (_legacy) return _legacy;
	try {
		const req = (globalThis as any).require ?? (globalThis as any).module?.require ?? (typeof require !== 'undefined' ? require : undefined);
		if (typeof req === 'function') {
			const mod = req('./legacy/tokenizer.js');
			_legacy = mod as LegacyModule;
			return _legacy;
		}
	} catch {
		// fall through to dynamic import as a last resort
	}
	// Dynamic import: keeps bundlers from eagerly pulling the legacy file
	// into the default bundle unless the import is used at runtime.
	// Note: dynamic import returns a promise, so we synchronously throw if
	// not available in the environment.
	throw new Error('Legacy tokenizer not available in this runtime. Set BEATBAX_PARSER=legacy or run in Node.js with require.');
};

export function tokenize(input: string): Token[] {
	const mod = loadLegacy();
	return mod.tokenize(input) as Token[];
}

export class Tokenizer {
	private impl: any;
	constructor(source: string) {
		const mod = loadLegacy();
		this.impl = new mod.Tokenizer(source);
	}
	peek(offset = 0): Token { return this.impl.peek(offset); }
	next(): Token { return this.impl.next(); }
	expect(type: any): Token { return this.impl.expect(type); }
}

export const TokenType = (() => {
	try { return loadLegacy().TokenType; } catch { return {}; }
})();

// Re-exporting types for TypeScript consumers (compile-time only)
export type Token = { type: string; value?: string; line: number; col: number };
