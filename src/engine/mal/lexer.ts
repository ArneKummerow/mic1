/**
 * MAL (Micro Assembly Language) lexer.
 *
 * Produces a flat token stream. NEWLINE is a real token (statements are
 * line-oriented). Whitespace and `// ...` comments are skipped.
 */

export type TokenType =
  | 'IDENT'
  | 'NUMBER'
  | 'EQ'
  | 'SEMI'
  | 'COLON'
  | 'COMMA'
  | 'PLUS'
  | 'MINUS'
  | 'TILDE'
  | 'BANG'
  | 'LPAREN'
  | 'RPAREN'
  | 'LSHIFT'
  | 'RSHIFT'
  | 'AND'
  | 'OR'
  | 'NEWLINE'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export interface LexError {
  line: number;
  column: number;
  message: string;
}

export interface LexResult {
  tokens: Token[];
  errors: LexError[];
}

const KEYWORDS: Record<string, TokenType> = {
  AND: 'AND',
  OR: 'OR',
};

export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const errors: LexError[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const len = source.length;

  const push = (type: TokenType, value: string, l: number, c: number): void => {
    tokens.push({ type, value, line: l, column: c });
  };

  while (i < len) {
    const startLine = line;
    const startCol = col;
    const c = source[i];

    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      col++;
      continue;
    }
    if (c === '\n') {
      push('NEWLINE', '\n', startLine, startCol);
      i++;
      line++;
      col = 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < len && source[i] !== '\n') {
        i++;
        col++;
      }
      continue;
    }

    // Single-character punctuation
    const single: Record<string, TokenType> = {
      '=': 'EQ',
      ';': 'SEMI',
      ':': 'COLON',
      ',': 'COMMA',
      '+': 'PLUS',
      '-': 'MINUS',
      '~': 'TILDE',
      '!': 'BANG',
      '(': 'LPAREN',
      ')': 'RPAREN',
    };
    if (single[c]) {
      push(single[c], c, startLine, startCol);
      i++;
      col++;
      continue;
    }

    // Two-character shift operators
    if (c === '<' && source[i + 1] === '<') {
      push('LSHIFT', '<<', startLine, startCol);
      i += 2;
      col += 2;
      continue;
    }
    if (c === '>' && source[i + 1] === '>') {
      push('RSHIFT', '>>', startLine, startCol);
      i += 2;
      col += 2;
      continue;
    }

    // Numbers (decimal or 0x-hex)
    if (c >= '0' && c <= '9') {
      const start = i;
      if (c === '0' && (source[i + 1] === 'x' || source[i + 1] === 'X')) {
        i += 2;
        col += 2;
        while (i < len && /[0-9a-fA-F]/.test(source[i])) {
          i++;
          col++;
        }
      } else {
        while (i < len && /[0-9]/.test(source[i])) {
          i++;
          col++;
        }
      }
      push('NUMBER', source.slice(start, i), startLine, startCol);
      continue;
    }

    // Identifier or keyword
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < len && /[A-Za-z0-9_]/.test(source[i])) {
        i++;
        col++;
      }
      const text = source.slice(start, i);
      const kw = KEYWORDS[text.toUpperCase()];
      push(kw ?? 'IDENT', text, startLine, startCol);
      continue;
    }

    errors.push({ line: startLine, column: startCol, message: `Unexpected character '${c}'` });
    i++;
    col++;
  }

  push('EOF', '', line, col);
  return { tokens, errors };
}

export function parseNumber(token: Token): number {
  if (token.value.startsWith('0x') || token.value.startsWith('0X')) {
    return parseInt(token.value.slice(2), 16);
  }
  return parseInt(token.value, 10);
}
