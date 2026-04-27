/**
 * MAL parser. Tokens → array of `ParsedLine`s ready for the encoder.
 *
 * The grammar (informal):
 *
 *   line       = (label ('=' addr)?)? statement (';' statement)* NEWLINE
 *   statement  = assignment | mem-op | goto | if-goto
 *   assignment = writable-reg ('=' writable-reg)* '=' expr-with-shifter
 *   mem-op     = 'rd' | 'wr' | 'fetch'
 *   goto       = 'goto' (IDENT | NUMBER | '(' 'MBR' ('OR' IDENT)? ')')
 *   if-goto    = 'if' '(' ('N'|'Z') ')' 'goto' (IDENT|NUMBER)
 *   expr       = unary ((PLUS|MINUS|AND|OR) unary)?
 *   unary      = (MINUS|TILDE)? primary
 *   primary    = NUMBER | IDENT
 *
 * The expression grammar is intentionally permissive — the encoder later
 * rejects expressions that don't map to a single ALU encoding.
 */

import { type Token, type LexError, parseNumber } from './lexer';

export type AluRegister = 'H' | 'MDR' | 'PC' | 'MBR' | 'MBRU' | 'SP' | 'LV' | 'CPP' | 'TOS' | 'OPC';
export type WritableReg = 'H' | 'MDR' | 'PC' | 'SP' | 'LV' | 'CPP' | 'TOS' | 'OPC' | 'MAR';

export const ALU_REGISTERS: ReadonlySet<string> = new Set([
  'H',
  'MDR',
  'PC',
  'MBR',
  'MBRU',
  'SP',
  'LV',
  'CPP',
  'TOS',
  'OPC',
]);

export const WRITABLE_REGISTERS: ReadonlySet<string> = new Set([
  'H',
  'MDR',
  'PC',
  'SP',
  'LV',
  'CPP',
  'TOS',
  'OPC',
  'MAR',
]);

const KEYWORDS_THAT_BLOCK_LABEL: ReadonlySet<string> = new Set([
  'rd',
  'wr',
  'fetch',
  'goto',
  'if',
  'RD',
  'WR',
  'FETCH',
  'GOTO',
  'IF',
]);

// AST -------------------------------------------------------------------

export type Expr =
  | { kind: 'num'; value: number; token: Token }
  | { kind: 'reg'; name: AluRegister; token: Token }
  | { kind: 'unary'; op: '-' | '~'; arg: Expr; token: Token }
  | { kind: 'binary'; op: '+' | '-' | 'AND' | 'OR'; left: Expr; right: Expr; token: Token };

export type ShifterOp = 'NONE' | 'SLL8' | 'SRA1';

export type Statement =
  | {
      kind: 'assign';
      targets: WritableReg[];
      expr: Expr;
      shifter: ShifterOp;
      token: Token;
    }
  | { kind: 'mem'; op: 'rd' | 'wr' | 'fetch'; token: Token }
  | { kind: 'goto'; target: GotoTarget; token: Token }
  | { kind: 'if'; flag: 'N' | 'Z'; target: GotoTarget; token: Token };

export type GotoTarget =
  | { kind: 'label'; name: string; token: Token }
  | { kind: 'addr'; value: number; token: Token }
  | { kind: 'mbr'; orLabel?: string; token: Token };

export interface ParsedLine {
  /** 1-based line number in the source. */
  line: number;
  label?: string;
  /** If the user wrote `Label = ADDR`, the explicit address. */
  explicitAddress?: number;
  statements: Statement[];
}

export interface ParseError {
  line: number;
  column: number;
  message: string;
}

export interface ParseResult {
  lines: ParsedLine[];
  errors: ParseError[];
}

// Parser ----------------------------------------------------------------

class Parser {
  private pos = 0;
  readonly errors: ParseError[] = [];

  constructor(private readonly tokens: Token[]) {}

  parse(): ParsedLine[] {
    const lines: ParsedLine[] = [];
    // Skip leading NEWLINEs
    while (this.peek().type === 'NEWLINE') this.advance();

    while (this.peek().type !== 'EOF') {
      try {
        const line = this.parseLine();
        if (line) lines.push(line);
      } catch (e) {
        // Recover: skip to next NEWLINE.
        if (e instanceof ParseFailure) {
          this.errors.push({ line: e.line, column: e.column, message: e.message });
          this.skipToNextLine();
        } else {
          throw e;
        }
      }
      // Skip any trailing NEWLINEs / blank lines.
      while (this.peek().type === 'NEWLINE') this.advance();
    }
    return lines;
  }

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  private fail(token: Token, message: string): never {
    throw new ParseFailure(token.line, token.column, message);
  }

  private skipToNextLine(): void {
    while (this.peek().type !== 'NEWLINE' && this.peek().type !== 'EOF') {
      this.advance();
    }
  }

  private parseLine(): ParsedLine | null {
    const startToken = this.peek();
    const lineNum = startToken.line;

    let label: string | undefined;
    let explicitAddress: number | undefined;

    // Decide whether this line starts with a label.
    // First token must be IDENT and not a register or reserved keyword.
    if (
      startToken.type === 'IDENT' &&
      !ALU_REGISTERS.has(startToken.value) &&
      !WRITABLE_REGISTERS.has(startToken.value) &&
      !KEYWORDS_THAT_BLOCK_LABEL.has(startToken.value)
    ) {
      label = startToken.value;
      this.advance();
      // Optional `:` after label (purely syntactic sugar).
      if (this.peek().type === 'COLON') this.advance();
      // Optional `= NUMBER` for explicit address.
      if (this.peek().type === 'EQ' && this.peek(1).type === 'NUMBER') {
        this.advance(); // =
        const numTok = this.advance();
        explicitAddress = parseNumber(numTok);
      }
    }

    const statements: Statement[] = [];

    // Empty line with just a label is OK.
    while (this.peek().type !== 'NEWLINE' && this.peek().type !== 'EOF') {
      const stmt = this.parseStatement();
      statements.push(stmt);
      if (this.peek().type === 'SEMI') {
        this.advance();
        // Allow trailing semicolon before NEWLINE.
        if (this.peek().type === 'NEWLINE' || this.peek().type === 'EOF') break;
      } else if (this.peek().type !== 'NEWLINE' && this.peek().type !== 'EOF') {
        this.fail(this.peek(), `Expected ';' or newline, got '${this.peek().value}'`);
      }
    }

    if (!label && statements.length === 0) return null;

    return {
      line: lineNum,
      ...(label !== undefined && { label }),
      ...(explicitAddress !== undefined && { explicitAddress }),
      statements,
    };
  }

  private parseStatement(): Statement {
    const t = this.peek();

    // Memory op: bare keyword.
    if (t.type === 'IDENT') {
      const v = t.value.toLowerCase();
      if (v === 'rd' || v === 'wr' || v === 'fetch') {
        this.advance();
        return { kind: 'mem', op: v, token: t };
      }
      if (v === 'goto') {
        this.advance();
        const target = this.parseGotoTarget();
        return { kind: 'goto', target, token: t };
      }
      if (v === 'if') {
        this.advance();
        return this.parseIfStatement(t);
      }
    }

    // Otherwise: assignment.
    return this.parseAssignment();
  }

  private parseAssignment(): Statement {
    const startToken = this.peek();
    const targets: WritableReg[] = [];

    // Greedy: while next two tokens are [IDENT (writable), EQ], consume.
    while (
      this.peek().type === 'IDENT' &&
      WRITABLE_REGISTERS.has(this.peek().value) &&
      this.peek(1).type === 'EQ'
    ) {
      targets.push(this.peek().value as WritableReg);
      this.advance(); // IDENT
      this.advance(); // =
    }

    if (targets.length === 0) {
      this.fail(startToken, `Unexpected token '${startToken.value}' at start of statement`);
    }

    const expr = this.parseExpr();
    const shifter = this.parseOptionalShifter();
    return { kind: 'assign', targets, expr, shifter, token: startToken };
  }

  private parseOptionalShifter(): ShifterOp {
    const t = this.peek();
    if (t.type === 'LSHIFT') {
      this.advance();
      const num = this.expect('NUMBER');
      const n = parseNumber(num);
      if (n !== 8) this.fail(num, `Only '<< 8' is supported (got ${n})`);
      return 'SLL8';
    }
    if (t.type === 'RSHIFT') {
      this.advance();
      const num = this.expect('NUMBER');
      const n = parseNumber(num);
      if (n !== 1) this.fail(num, `Only '>> 1' is supported (got ${n})`);
      return 'SRA1';
    }
    return 'NONE';
  }

  private parseExpr(): Expr {
    // Left-associative chain of binary ops. The encoder later pattern-matches
    // the resulting tree (so `H + R + 1` parses as `((H + R) + 1)` and the
    // encoder recognises it as add-with-INC).
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t.type !== 'PLUS' && t.type !== 'MINUS' && t.type !== 'AND' && t.type !== 'OR') break;
      this.advance();
      const right = this.parseUnary();
      const op =
        t.type === 'PLUS' ? '+' : t.type === 'MINUS' ? '-' : t.type === 'AND' ? 'AND' : 'OR';
      left = { kind: 'binary', op, left, right, token: t };
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.type === 'MINUS') {
      this.advance();
      // Fold `-NUMBER` into a single negative numeric literal so the encoder
      // sees Num(-1) rather than Unary('-', Num(1)).
      if (this.peek().type === 'NUMBER') {
        const numTok = this.advance();
        return { kind: 'num', value: -parseNumber(numTok), token: numTok };
      }
      const arg = this.parsePrimary();
      return { kind: 'unary', op: '-', arg, token: t };
    }
    if (t.type === 'TILDE') {
      this.advance();
      const arg = this.parsePrimary();
      return { kind: 'unary', op: '~', arg, token: t };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.type === 'NUMBER') {
      this.advance();
      return { kind: 'num', value: parseNumber(t), token: t };
    }
    if (t.type === 'IDENT') {
      if (!ALU_REGISTERS.has(t.value)) {
        this.fail(t, `Expected register or number, got '${t.value}'`);
      }
      this.advance();
      return { kind: 'reg', name: t.value as AluRegister, token: t };
    }
    this.fail(t, `Unexpected token '${t.value}' in expression`);
  }

  private parseGotoTarget(): GotoTarget {
    const t = this.peek();
    if (t.type === 'LPAREN') {
      this.advance();
      const inner = this.expectIdent();
      if (inner.value !== 'MBR') {
        this.fail(inner, `Expected 'MBR' in indirect goto, got '${inner.value}'`);
      }
      let orLabel: string | undefined;
      if (this.peek().type === 'OR') {
        this.advance();
        const labelTok = this.expectIdent();
        orLabel = labelTok.value;
      }
      this.expect('RPAREN');
      return { kind: 'mbr', token: t, ...(orLabel !== undefined && { orLabel }) };
    }
    if (t.type === 'NUMBER') {
      this.advance();
      return { kind: 'addr', value: parseNumber(t), token: t };
    }
    if (t.type === 'IDENT') {
      this.advance();
      return { kind: 'label', name: t.value, token: t };
    }
    this.fail(t, `Expected label or '(MBR)' after 'goto'`);
  }

  private parseIfStatement(startTok: Token): Statement {
    this.expect('LPAREN');
    const flagTok = this.expectIdent();
    if (flagTok.value !== 'N' && flagTok.value !== 'Z') {
      this.fail(flagTok, `Expected 'N' or 'Z', got '${flagTok.value}'`);
    }
    const flag = flagTok.value as 'N' | 'Z';
    this.expect('RPAREN');
    const gotoTok = this.expectIdent();
    if (gotoTok.value.toLowerCase() !== 'goto') {
      this.fail(gotoTok, `Expected 'goto' after 'if (...)'`);
    }
    const target = this.parseGotoTarget();
    return { kind: 'if', flag, target, token: startTok };
  }

  private expect(type: Token['type']): Token {
    const t = this.peek();
    if (t.type !== type) this.fail(t, `Expected ${type}, got ${t.type} '${t.value}'`);
    return this.advance();
  }

  private expectIdent(): Token {
    return this.expect('IDENT');
  }
}

class ParseFailure extends Error {
  constructor(
    public readonly line: number,
    public readonly column: number,
    message: string,
  ) {
    super(message);
  }
}

export function parse(tokens: Token[], lexErrors: LexError[] = []): ParseResult {
  const parser = new Parser(tokens);
  const lines = parser.parse();
  const errors: ParseError[] = [
    ...lexErrors.map((e) => ({ line: e.line, column: e.column, message: e.message })),
    ...parser.errors,
  ];
  return { lines, errors };
}
