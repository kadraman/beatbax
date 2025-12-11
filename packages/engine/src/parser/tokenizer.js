/**
 * Tokenizer for the BeatBax small language.
 *
 * Produces a stream/array of tokens with position info. Supports:
 * - identifiers (letters, digits, -, _)
 * - integers
 * - string literals (single or double quoted, with escapes)
 * - notes like C4, G#3
 * - rest token: `.`
 * - punctuation: = , : ( ) [ ] =>
 * - comments: `//` and `#` to end-of-line
 */
export var TokenType;
(function (TokenType) {
    TokenType["EOF"] = "EOF";
    TokenType["IDENT"] = "IDENT";
    TokenType["NUMBER"] = "NUMBER";
    TokenType["STRING"] = "STRING";
    TokenType["NOTE"] = "NOTE";
    TokenType["REST"] = "REST";
    TokenType["ARROW"] = "ARROW";
    TokenType["EQUAL"] = "EQUAL";
    TokenType["COMMA"] = "COMMA";
    TokenType["COLON"] = "COLON";
    TokenType["LBRACKET"] = "LBRACKET";
    TokenType["RBRACKET"] = "RBRACKET";
    TokenType["LPAREN"] = "LPAREN";
    TokenType["RPAREN"] = "RPAREN";
    TokenType["DOT"] = "DOT";
    TokenType["MINUS"] = "MINUS";
    TokenType["PLUS"] = "PLUS";
})(TokenType || (TokenType = {}));
/** Tokenize input text into an array of tokens. */
export function tokenize(input) {
    const tokens = [];
    let i = 0;
    let line = 1;
    let col = 1;
    function current() {
        return i >= input.length ? null : input[i];
    }
    function advance(n = 1) {
        for (let k = 0; k < n; k++) {
            if (i >= input.length)
                return;
            const ch = input[i++];
            if (ch === "\n") {
                line++;
                col = 1;
            }
            else {
                col++;
            }
        }
    }
    function makeToken(type, value) {
        return { type, value, line, col };
    }
    function isAlpha(ch) {
        return /[A-Za-z_]/.test(ch);
    }
    function isDigit(ch) {
        return /[0-9]/.test(ch);
    }
    function isAlphaNumDash(ch) {
        return /[A-Za-z0-9_\-]/.test(ch);
    }
    while (i < input.length) {
        const ch = current();
        // Whitespace
        if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
            advance();
            continue;
        }
        // Comments: // or # to end of line
        if (ch === '/' && input[i + 1] === '/') {
            // consume until newline
            while (current() !== null && current() !== '\n')
                advance();
            continue;
        }
        if (ch === '#') {
            while (current() !== null && current() !== '\n')
                advance();
            continue;
        }
        // Two-char tokens
        if (ch === '=' && input[i + 1] === '>') {
            advance(2);
            tokens.push({ type: TokenType.ARROW, line, col });
            continue;
        }
        // Single-char punctuation
        if (ch === '=') {
            advance();
            tokens.push({ type: TokenType.EQUAL, line, col });
            continue;
        }
        if (ch === ',') {
            advance();
            tokens.push({ type: TokenType.COMMA, line, col });
            continue;
        }
        if (ch === ':') {
            advance();
            tokens.push({ type: TokenType.COLON, line, col });
            continue;
        }
        if (ch === '[') {
            advance();
            tokens.push({ type: TokenType.LBRACKET, line, col });
            continue;
        }
        if (ch === ']') {
            advance();
            tokens.push({ type: TokenType.RBRACKET, line, col });
            continue;
        }
        if (ch === '(') {
            advance();
            tokens.push({ type: TokenType.LPAREN, line, col });
            continue;
        }
        if (ch === ')') {
            advance();
            tokens.push({ type: TokenType.RPAREN, line, col });
            continue;
        }
        if (ch === '.') {
            // dot as rest token
            advance();
            tokens.push({ type: TokenType.REST, line, col });
            continue;
        }
        if (ch === '-') {
            advance();
            tokens.push({ type: TokenType.MINUS, line, col });
            continue;
        }
        if (ch === '+') {
            advance();
            tokens.push({ type: TokenType.PLUS, line, col });
            continue;
        }
        // String literal
        if (ch === '"' || ch === "'") {
            const quote = ch;
            advance();
            let buf = '';
            while (current() !== null && current() !== quote) {
                if (current() === '\\') {
                    advance();
                    const esc = current();
                    if (esc === null)
                        break;
                    if (esc === 'n')
                        buf += '\n';
                    else if (esc === 't')
                        buf += '\t';
                    else
                        buf += esc;
                    advance();
                }
                else {
                    buf += current();
                    advance();
                }
            }
            // consume closing quote
            if (current() === quote)
                advance();
            tokens.push({ type: TokenType.STRING, value: buf, line, col });
            continue;
        }
        // Number (integer)
        if (isDigit(ch)) {
            let start = i;
            while (current() !== null && isDigit(current()))
                advance();
            const raw = input.slice(start, i);
            tokens.push({ type: TokenType.NUMBER, value: raw, line, col });
            continue;
        }
        // Note detection: A-G, optional #/b, octave digits (e.g. C5, G#3, Bb4)
        if (/[A-Ga-g]/.test(ch)) {
            const rest = input.slice(i);
            const m = rest.match(/^([A-Ga-g])([#b]?)([0-9]+)/);
            if (m) {
                const raw = m[0];
                advance(raw.length);
                tokens.push({ type: TokenType.NOTE, value: raw.toUpperCase(), line, col });
                continue;
            }
        }
        // Identifier (letters, digits, dash, underscore)
        if (isAlpha(ch)) {
            let start = i;
            while (current() !== null && isAlphaNumDash(current()))
                advance();
            const raw = input.slice(start, i);
            tokens.push({ type: TokenType.IDENT, value: raw, line, col });
            continue;
        }
        // Unknown/unsupported char: consume and create IDENT of single char to avoid infinite loop
        advance();
        tokens.push({ type: TokenType.IDENT, value: ch, line, col });
    }
    tokens.push({ type: TokenType.EOF, line, col });
    return tokens;
}
/** Simple iterator class for tokens. */
export class Tokenizer {
    tokens;
    pos = 0;
    constructor(source) {
        this.tokens = tokenize(source);
    }
    peek(offset = 0) {
        const idx = this.pos + offset;
        if (idx >= this.tokens.length)
            return this.tokens[this.tokens.length - 1];
        return this.tokens[idx];
    }
    next() {
        const t = this.peek(0);
        if (this.pos < this.tokens.length - 1)
            this.pos++;
        return t;
    }
    expect(type) {
        const t = this.next();
        if (t.type !== type) {
            throw new Error(`Expected token ${type} but got ${t.type} at ${t.line}:${t.col}`);
        }
        return t;
    }
}
//# sourceMappingURL=tokenizer.js.map