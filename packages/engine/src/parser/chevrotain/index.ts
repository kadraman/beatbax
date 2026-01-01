import { transform } from './transformer';

export async function parseWithChevrotain(input: string) {
  // Dynamic import of Chevrotain to avoid raising module resolution errors
  // during normal test runs (when the feature flag is not enabled).
  // Prefer reusing the shared lexer/token builder so token ordering and
  // options remain consistent across sync/async parser entrypoints.
  const lexerModule = await import('./lexer');
  const built = lexerModule.getBuiltTokens();
  const { allTokens, StringLiteral, NumberLiteral, Id } = built as any;
  const chev = await import('chevrotain');
  const { CstParser } = chev as any;

  const run = (built: any) => {
    const allTokens = built.allTokens;
    const lexer = new (chev as any).Lexer(allTokens);
    const lexResult = lexer.tokenize(input);
    if (lexResult.errors && lexResult.errors.length) return { errors: lexResult.errors, ast: null };

    // Destructure tokens into locals so grammar can reference them as before
    const { Pat, Inst, Seq, Channel, Chip, Song, Bpm, Play, Export, Id, StringLiteral, NumberLiteral, Equals, Colon, LParen, RParen, Comma, Asterisk, Dot } = built as any;

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
  };

  return run(built);
}

export function parseWithChevrotainSync(input: string) {
  // Synchronous CommonJS path for existing sync parse() API compatibility
  // This uses `require` so environments that can `require('chevrotain')` can
  // run the parser synchronously without dynamic import.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const chev = require('chevrotain');
  // Reuse lexer builder so token order and options match tokens.ts
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lexerModule = require('./lexer');
  const built = lexerModule.getBuiltTokens();
  const { allTokens } = built as any;
  const { CstParser } = chev as any;

  const run = (built: any) => {
    const allTokens = built.allTokens;
    const lexer = new (chev as any).Lexer(allTokens);
    const lexResult = lexer.tokenize(input);
    if (lexResult.errors && lexResult.errors.length) return { errors: lexResult.errors, ast: null };

    // Destructure tokens into locals so grammar can reference them as before
    const { Pat, Inst, Seq, Channel, Chip, Song, Bpm, Play, Export, Id, StringLiteral, NumberLiteral, Equals, Colon, LParen, RParen, Comma, Asterisk, Dot } = built as any;

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
  };

  return run(built);
}

export default parseWithChevrotain;
