import { transform } from './transformer';

export async function parseWithChevrotain(input: string) {
  // Dynamic import of Chevrotain to avoid raising module resolution errors
  // during normal test runs (when the feature flag is not enabled).
  const chev = await import('chevrotain');
  const { createToken, Lexer, CstParser } = chev as any;

  // Define a minimal set of tokens (mirrors tokens.ts but created at runtime)
  const WhiteSpace = createToken({ name: 'WhiteSpace', pattern: /\s+/, group: Lexer.SKIPPED });
  const Comment = createToken({ name: 'Comment', pattern: /#[^\n]*/, group: Lexer.SKIPPED });
  const Pat = createToken({ name: 'Pat', pattern: /pat/ });
  const Inst = createToken({ name: 'Inst', pattern: /inst/ });
  const Seq = createToken({ name: 'Seq', pattern: /seq/ });
  const Channel = createToken({ name: 'Channel', pattern: /channel/ });
  const Chip = createToken({ name: 'Chip', pattern: /chip/ });
  const Bpm = createToken({ name: 'Bpm', pattern: /bpm/ });
  const Play = createToken({ name: 'Play', pattern: /play/ });
  const Export = createToken({ name: 'Export', pattern: /export/ });
  const Id = createToken({ name: 'Id', pattern: /[A-Za-z_][A-Za-z0-9_\-]*/ });
  const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /-?\d+/ });
  const StringLiteral = createToken({ name: 'StringLiteral', pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/ });
  const Equals = createToken({ name: 'Equals', pattern: /=/ });
  const Colon = createToken({ name: 'Colon', pattern: /:/ });
  const LParen = createToken({ name: 'LParen', pattern: /\(/ });
  const RParen = createToken({ name: 'RParen', pattern: /\)/ });
  const LBracket = createToken({ name: 'LBracket', pattern: /\[/ });
  const RBracket = createToken({ name: 'RBracket', pattern: /\]/ });
  const Comma = createToken({ name: 'Comma', pattern: /,/ });
  const Dot = createToken({ name: 'Dot', pattern: /\./ });

  const allTokens = [
    WhiteSpace,
    Comment,
    Pat,
    Inst,
    Seq,
    Channel,
    Chip,
    Bpm,
    Play,
    Export,
    StringLiteral,
    NumberLiteral,
    Id,
    Equals,
    Colon,
    LParen,
    RParen,
    LBracket,
    RBracket,
    Comma,
    Dot,
  ];

  const lexer = new Lexer(allTokens);
  const lexResult = lexer.tokenize(input);
  if (lexResult.errors && lexResult.errors.length) return { errors: lexResult.errors, ast: null };

  // Lightweight parser for initial migration tests
  class BaxParser extends (CstParser as any) {
    constructor() {
      super(allTokens, { recoveryEnabled: true });
      this.performSelfAnalysis();
    }

    public program = this.RULE('program', () => {
      this.MANY(() => this.SUBRULE(this.directive));
    });

    private directive = this.RULE('directive', () => {
      this.OR([
        { ALT: () => this.SUBRULE(this.patStmt) },
        { ALT: () => this.SUBRULE(this.instStmt) },
        { ALT: () => this.SUBRULE(this.seqStmt) },
        { ALT: () => this.SUBRULE(this.channelStmt) },
        { ALT: () => this.SUBRULE(this.simpleDirective) },
      ]);
    });

    private simpleDirective = this.RULE('simpleDirective', () => {
      this.OR([
        { ALT: () => this.CONSUME(Chip) },
        { ALT: () => this.CONSUME(Bpm) },
        { ALT: () => this.CONSUME(Play) },
        { ALT: () => this.CONSUME(Export) },
      ]);
      this.OPTION(() => this.CONSUME(Id));
    });

    private patStmt = this.RULE('patStmt', () => {
      this.CONSUME(Pat);
      this.CONSUME(Id, { LABEL: 'name' });
      this.OPTION(() => {
        this.CONSUME(Colon);
        this.MANY(() => this.CONSUME(Id));
      });
      this.CONSUME(Equals);
      this.AT_LEAST_ONE(() => this.CONSUME(Id));
    });

    private instStmt = this.RULE('instStmt', () => {
      this.CONSUME(Inst);
      this.CONSUME(Id, { LABEL: 'name' });
      this.CONSUME(Equals);
      this.AT_LEAST_ONE(() => this.CONSUME(Id));
    });

    private seqStmt = this.RULE('seqStmt', () => {
      this.CONSUME(Seq);
      this.CONSUME(Id, { LABEL: 'name' });
      this.CONSUME(Equals);
      this.AT_LEAST_ONE(() => this.CONSUME(Id));
    });

    private channelStmt = this.RULE('channelStmt', () => {
      this.CONSUME(Channel);
      this.CONSUME(NumberLiteral);
      this.CONSUME(Equals);
      this.AT_LEAST_ONE(() => this.CONSUME(Id));
    });
  }

  const parser = new BaxParser();
  parser.input = lexResult.tokens as any;
  const cst = parser.program();
  if (parser.errors && parser.errors.length) return { errors: parser.errors, ast: null };

  const ast = transform(cst);
  return { errors: [], ast };
}

export default parseWithChevrotain;