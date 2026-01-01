import type { IToken } from 'chevrotain';
import { getBuiltTokens } from './lexer';

// Delay binding to Chevrotain token constructors until runtime so this module can
// be imported in environments where `chevrotain` may not be available.
function createParserWithTokens(CstParser: any, tokens: any) {
  const { allTokens, Pat, Inst, Seq, Channel, Chip, Song, Bpm, Play, Export, Id, StringLiteral, NumberLiteral, Arrow, Equals, Colon, LParen, RParen, Comma, Asterisk, Dot, LAngle, RAngle } = tokens as any;

  class BaxParser extends CstParser {
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
        { ALT: () => this.SUBRULE(this.songStmt) },
        { ALT: () => this.SUBRULE(this.exportStmt) },
        { ALT: () => this.SUBRULE(this.simpleDirective) },
      ]);
      // allow trailing id/number/string
      this.OPTION(() => this.CONSUME(Id));
    });

    private songStmt = this.RULE('songStmt', () => {
      this.CONSUME(Song);
      this.CONSUME(Id, { LABEL: 'key' });
      this.CONSUME(StringLiteral, { LABEL: 'value' });
    });

    private exportStmt = this.RULE('exportStmt', () => {
      this.CONSUME(Export);
      this.CONSUME(Id, { LABEL: 'format' });
      this.OPTION(() => this.CONSUME(StringLiteral, { LABEL: 'dest' }));
    });

    private patStmt = this.RULE('patStmt', () => {
      this.CONSUME(Pat);
      this.CONSUME(Id, { LABEL: 'name' });
      this.OPTION(() => {
        this.CONSUME(Colon);
        this.MANY(() => this.SUBRULE(this.patMod));
      });
      this.CONSUME(Equals);
      this.SUBRULE(this.patBody);
    });

    private patMod = this.RULE('patMod', () => {
      this.OR([
        { ALT: () => this.CONSUME(NumberLiteral) },
        {
          ALT: () => {
            this.CONSUME(Id);
            this.OPTION(() => {
              this.CONSUME(LParen);
              this.OPTION(() => {
                this.OR([
                  { ALT: () => this.CONSUME(NumberLiteral) },
                  { ALT: () => this.CONSUME(Id) },
                  { ALT: () => this.CONSUME(StringLiteral) },
                ]);
                this.OPTION(() => { this.CONSUME(Comma); this.CONSUME(NumberLiteral); });
              });
              this.CONSUME(RParen);
            });
          }
        }
      ]);
    });

    private patBody = this.RULE('patBody', () => {
      this.AT_LEAST_ONE(() => this.SUBRULE(this.patternItem));
    });

    private patternItem = this.RULE('patternItem', () => {
      this.OR([
        { ALT: () => this.CONSUME(Dot) },
        { ALT: () => this.CONSUME(Id) },
        { ALT: () => this.CONSUME(NumberLiteral) },
        { ALT: () => this.CONSUME(LParen) },
        { ALT: () => this.CONSUME(RParen) },
        { ALT: () => this.CONSUME(Comma) },
        { ALT: () => this.CONSUME(Asterisk) },
        { ALT: () => this.CONSUME(Colon) },
        { ALT: () => this.CONSUME(LAngle) },
        { ALT: () => this.CONSUME(RAngle) },
        { ALT: () => this.SUBRULE(this.inlineInst) },
        { ALT: () => this.CONSUME(StringLiteral) },
      ]);
    });

    private inlineInst = this.RULE('inlineInst', () => {
      this.CONSUME(Inst);
      this.OR([
        { ALT: () => this.CONSUME(Id) },
        { ALT: () => { this.CONSUME(LParen); this.CONSUME(Id); this.OPTION(() => { this.CONSUME(Comma); this.CONSUME(NumberLiteral); }); this.CONSUME(RParen); } }
      ]);
    });

    private instStmt = this.RULE('instStmt', () => {
      this.CONSUME(Inst);
      this.CONSUME(Id, { LABEL: 'name' });
      this.CONSUME(Equals);
      // simple key=value pairs; accept Ids and commas
      this.AT_LEAST_ONE(() => this.CONSUME(Id));
    });

    private seqStmt = this.RULE('seqStmt', () => {
      this.CONSUME(Seq);
      this.CONSUME(Id, { LABEL: 'name' });
      this.CONSUME(Equals);
      this.AT_LEAST_ONE(() => this.SUBRULE(this.seqItem));
    });

    private seqItem = this.RULE('seqItem', () => {
      this.CONSUME(Id);
      this.OPTION(() => {
        this.CONSUME(Colon);
        this.MANY(() => this.SUBRULE(this.patMod));
      });
      this.OPTION(() => {
        this.CONSUME(Asterisk);
        this.CONSUME(NumberLiteral);
      });
    });

    private channelStmt = this.RULE('channelStmt', () => {
      this.CONSUME(Channel);
      this.CONSUME(NumberLiteral);
      this.OR([
        { ALT: () => this.CONSUME(Arrow) },
        { ALT: () => this.CONSUME(Equals) },
      ]);
      this.AT_LEAST_ONE(() => this.CONSUME(Id));
    });
  }

  return BaxParser;
}

export function parseCst(tokens: IToken[]) {
  // To avoid top-level dependency on Chevrotain, require it only when parsing.
  // This keeps the module import-safe in test environments where Chevrotain
  // may not be resolvable by the module loader.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const chev = require('chevrotain');
  const { CstParser } = chev as any;
  const builtTokens = getBuiltTokens();
  const BaxParser = createParserWithTokens(CstParser, builtTokens);
  const parser = new BaxParser();
  parser.input = tokens as any;
  const cst = parser.program();
  return { cst, errors: parser.errors };
}
