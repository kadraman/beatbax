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
export declare enum TokenType {
    EOF = "EOF",
    IDENT = "IDENT",
    NUMBER = "NUMBER",
    STRING = "STRING",
    NOTE = "NOTE",
    REST = "REST",
    ARROW = "ARROW",// =>
    EQUAL = "EQUAL",
    COMMA = "COMMA",
    COLON = "COLON",
    LBRACKET = "LBRACKET",
    RBRACKET = "RBRACKET",
    LPAREN = "LPAREN",
    RPAREN = "RPAREN",
    DOT = "DOT",
    MINUS = "MINUS",
    PLUS = "PLUS"
}
export interface Token {
    type: TokenType;
    value?: string;
    line: number;
    col: number;
}
/** Tokenize input text into an array of tokens. */
export declare function tokenize(input: string): Token[];
/** Simple iterator class for tokens. */
export declare class Tokenizer {
    private tokens;
    private pos;
    constructor(source: string);
    peek(offset?: number): Token;
    next(): Token;
    expect(type: TokenType): Token;
}
//# sourceMappingURL=tokenizer.d.ts.map