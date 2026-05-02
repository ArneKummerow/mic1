/**
 * MAL formatter — re-emits a MAL source with column-aligned label,
 * assignments, memory ops, and goto/if columns. Comments and blank lines
 * are preserved.
 *
 * The formatter is best-effort: lines that fail to parse are passed through
 * verbatim (so the user can still format a partially-broken file without
 * losing their work).
 */

import { lex } from './lexer';
import { parse, type Expr, type GotoTarget, type ParsedLine, type Statement } from './parser';

interface FormattedLine {
  /** Label column text (e.g. `Main1` or `iadd1 = 0x60`). Empty if none. */
  label: string;
  /** Joined assignment statements (e.g. `MAR = SP = SP - 1`). */
  assigns: string;
  /** Joined memory ops (e.g. `rd; wr; fetch`, but typically just one). */
  mem: string;
  /** Goto / if-goto clause. */
  jump: string;
  /** Trailing `// ...` comment, including the leading `//`. Empty if none. */
  comment: string;
}

const SHIFT_SUFFIX = { NONE: '', SLL8: ' << 8', SRA1: ' >> 1' } as const;

function renderTarget(t: GotoTarget): string {
  if (t.kind === 'label') return t.name;
  if (t.kind === 'addr') return formatHexNum(t.value);
  // mbr
  if (t.orLabel) return `(MBR OR ${t.orLabel})`;
  if (t.orAddress !== undefined) return `(MBR OR ${formatHexNum(t.orAddress)})`;
  return '(MBR)';
}

function formatHexNum(n: number): string {
  if (n < 0) return n.toString(10);
  // Match the convention of the in-tree microcode: lowercase hex, no padding.
  return `0x${n.toString(16)}`;
}

function renderExpr(expr: Expr): string {
  switch (expr.kind) {
    case 'num':
      return expr.value.toString(10);
    case 'reg':
      return expr.name;
    case 'unary':
      return `${expr.op}${renderExpr(expr.arg)}`;
    case 'binary': {
      const op = expr.op === 'AND' ? 'AND' : expr.op === 'OR' ? 'OR' : expr.op;
      return `${renderExpr(expr.left)} ${op} ${renderExpr(expr.right)}`;
    }
  }
}

function renderAssign(stmt: Extract<Statement, { kind: 'assign' }>): string {
  const targets = stmt.targets.join(' = ');
  const expr = renderExpr(stmt.expr);
  return `${targets} = ${expr}${SHIFT_SUFFIX[stmt.shifter]}`;
}

function renderJump(stmt: Statement): string {
  if (stmt.kind === 'goto') return `goto ${renderTarget(stmt.target)}`;
  if (stmt.kind === 'if') {
    const flag = (stmt.negated ? '~' : '') + stmt.flag;
    const main = `if (${flag}) goto ${renderTarget(stmt.target)}`;
    return stmt.elseTarget ? `${main}; else goto ${renderTarget(stmt.elseTarget)}` : main;
  }
  return '';
}

function buildLabelText(parsed: ParsedLine): string {
  if (!parsed.label) return '';
  if (parsed.explicitAddress !== undefined) {
    return `${parsed.label} = ${formatHexNum(parsed.explicitAddress)}`;
  }
  return parsed.label;
}

function splitComment(line: string): { body: string; comment: string } {
  const idx = line.indexOf('//');
  if (idx === -1) return { body: line, comment: '' };
  return { body: line.slice(0, idx), comment: line.slice(idx) };
}

function buildFormattedLine(parsed: ParsedLine, comment: string): FormattedLine {
  const assigns: string[] = [];
  const mems: string[] = [];
  let jump = '';
  for (const s of parsed.statements) {
    if (s.kind === 'assign') assigns.push(renderAssign(s));
    else if (s.kind === 'mem') mems.push(s.op);
    else jump = renderJump(s);
  }
  return {
    label: buildLabelText(parsed),
    assigns: assigns.join('; '),
    mem: mems.join('; '),
    jump,
    comment: comment.trim(),
  };
}

function joinFormatted(
  f: FormattedLine,
  widths: { label: number; assigns: number; mem: number; jump: number },
): string {
  // Determine which statement groups are present so we can place `;`
  // separators *only* between groups that actually carry text. Padding
  // happens by widening the trailing whitespace of each cell.
  const lastNonEmpty = f.jump
    ? 'jump'
    : f.mem
      ? 'mem'
      : f.assigns
        ? 'assigns'
        : null;

  const cells: string[] = [];
  cells.push(f.label.padEnd(widths.label));
  // Statements: each cell is value + `;` (if not last) padded to width.
  cells.push(padCell(f.assigns, widths.assigns, lastNonEmpty !== 'assigns' && f.assigns !== ''));
  cells.push(padCell(f.mem, widths.mem, lastNonEmpty !== 'mem' && f.mem !== ''));
  cells.push(padCell(f.jump, widths.jump, false));

  const text = cells.join('  ').trimEnd();
  if (f.comment) {
    return text.length === 0 ? f.comment : `${text}  ${f.comment}`;
  }
  return text;
}

function padCell(value: string, width: number, withSemi: boolean): string {
  if (value === '') return ' '.repeat(width);
  const trail = withSemi ? ';' : '';
  return (value + trail).padEnd(width + trail.length);
}

/**
 * Format a MAL source string. Lines that cannot be parsed (or chunks of the
 * source containing parse errors) fall through unchanged so the user can
 * still format a partially-broken file.
 */
export function formatMal(source: string): string {
  const lines = source.split('\n');
  // Each entry mirrors a source line — either a formatted record, or a
  // raw passthrough string when the line had no statements / didn't parse.
  type Entry = { kind: 'formatted'; data: FormattedLine } | { kind: 'raw'; text: string };
  const entries: Entry[] = [];

  for (const rawLine of lines) {
    const trimmedRight = rawLine.replace(/\s+$/, '');
    if (trimmedRight.length === 0) {
      entries.push({ kind: 'raw', text: '' });
      continue;
    }
    const { body, comment } = splitComment(trimmedRight);
    if (body.trim().length === 0) {
      // Comment-only line — preserve the comment exactly (with original indent
      // stripped, so it aligns to column 0 when re-emitted).
      entries.push({ kind: 'raw', text: comment });
      continue;
    }
    // Parse this line in isolation. We do so by lexing the body alone — this
    // avoids cross-line dependencies and keeps line numbers tractable.
    const lexed = lex(body);
    const parsed = parse(lexed.tokens, lexed.errors);
    if (parsed.errors.length > 0 || parsed.lines.length === 0) {
      // Pass through unchanged (including any comment).
      entries.push({ kind: 'raw', text: trimmedRight.trimStart() });
      continue;
    }
    entries.push({
      kind: 'formatted',
      data: buildFormattedLine(parsed.lines[0], comment),
    });
  }

  // Compute column widths across all formatted lines.
  const widths = { label: 0, assigns: 0, mem: 0, jump: 0 };
  for (const e of entries) {
    if (e.kind !== 'formatted') continue;
    widths.label = Math.max(widths.label, e.data.label.length);
    widths.assigns = Math.max(widths.assigns, e.data.assigns.length);
    widths.mem = Math.max(widths.mem, e.data.mem.length);
    widths.jump = Math.max(widths.jump, e.data.jump.length);
  }

  // Render.
  const out = entries.map((e) =>
    e.kind === 'raw' ? e.text : joinFormatted(e.data, widths),
  );
  return out.join('\n');
}
