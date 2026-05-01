/**
 * Hover + completion providers for the MAL and IJVM Monaco languages.
 *
 * Hover content is sourced from the engine reference (mirrors what's in
 * docs/MIC1_REFERENCE.md). Completion lists pull live label / constant /
 * method names from the most recent assembly results in the store, plus a
 * curated set of snippets for common patterns (pop / advance-and-fetch /
 * conditional branch — the bit-8 layout is non-obvious).
 */
import type { Monaco } from '@monaco-editor/react';
import type { editor as monacoEditor, languages, IRange } from 'monaco-editor';
import { useAppStore } from '../store';
import { OPCODES, OPCODES_BY_MNEMONIC } from '../engine/ijvm';

// ─── MAL reference content ────────────────────────────────────────────

const MAL_REGISTER_INFO: Record<string, string> = {
  MAR: '**MAR** — Memory Address Register. Word-addressed for `rd`/`wr`. Not on the B-bus (cannot be read back via the ALU).',
  MDR: '**MDR** — Memory Data Register. 32-bit register for word reads/writes.',
  PC: '**PC** — Program Counter. Byte-addressed; `fetch` reads `[PC]` into MBR.',
  MBR: '**MBR** — Memory Buffer Register. 8-bit; sign-extended onto the B-bus.',
  MBRU: '**MBRU** — Same hardware as MBR but zero-extended onto the B-bus (unsigned read).',
  SP: '**SP** — Stack Pointer. Word index into memory; points at the top of the operand stack.',
  LV: '**LV** — Local Variable frame base (word index).',
  CPP: '**CPP** — Constant Pool Pointer (word index).',
  TOS: '**TOS** — Top Of Stack. Caches the word at `[SP]` to avoid repeated reads.',
  OPC: '**OPC** — Old PC / scratch register.',
  H: '**H** — A-input of the ALU. The *only* register on the A-bus.',
};

const MAL_KEYWORD_INFO: Record<string, string> = {
  rd: '**rd** — Read word at `[MAR]` (word-addressed) into `MDR`. Issued this cycle, available in MDR at the start of the next cycle.',
  wr: '**wr** — Write `MDR` to `[MAR]`. Issued this cycle, committed at the start of the next.',
  fetch: '**fetch** — Read byte at `[PC]` (byte-addressed) into `MBR`. 1-cycle delay.',
  AND: '**AND** — Bitwise AND of the A-bus and B-bus inputs (`H AND R`).',
  OR: '**OR** — Bitwise OR of the A-bus and B-bus inputs (`H OR R`).',
  goto: '**goto** *target* — Set `NEXT_ADDRESS`.\n\n• `goto Label` — unconditional jump.\n• `goto (MBR)` — set `JMPC`; OR opcode into NEXT_ADDR (the IJVM dispatch trick).\n• `goto (MBR OR Base)` — same with a non-zero base (e.g. for the `WIDE` prefix dispatch at `0x100`).',
  if: '**if (N|Z) goto** *Label* — Conditional via JAM. The taken-target *must* live in `0x100..0x1FF`; the fall-through microinstruction sits at `Label & 0xFF` in the lower half. The hardware OR\'s bit 8 into MPC when the flag is set.',
  N: '**N flag** — ALU output is negative. Drives `JAMN`.',
  Z: '**Z flag** — ALU output is zero. Drives `JAMZ`.',
};

const MAL_NUMBER_INFO: Record<string, string> = {
  '0': 'ALU constant `0` (`F0=1, F1=1, ENA=0, ENB=0`).',
  '1': 'ALU constant `1` (`F0=1, F1=1, ENA=0, ENB=0, INC=1`).',
  '-1': 'ALU constant `-1` (`F0=1, F1=1, ENA=0, ENB=0, INVA=1`).',
};

// Snippet bodies — `${1:placeholder}` syntax is Monaco's tab-stop format.
interface Snippet {
  label: string;
  description: string;
  body: string;
}

const MAL_SNIPPETS: readonly Snippet[] = [
  {
    label: 'pop',
    description: 'Pop into MDR while decrementing SP — read TOS-1 into MDR.',
    body: 'MAR = SP = SP - 1; rd',
  },
  {
    label: 'push',
    description: 'Allocate the new TOS slot at SP+1 (write-side pop pattern).',
    body: 'MAR = SP = SP + 1',
  },
  {
    label: 'advance',
    description: 'Advance PC and pre-fetch the next opcode.',
    body: 'PC = PC + 1; fetch',
  },
  {
    label: 'finish',
    description: 'Pre-fetch next opcode + return to Main1 (typical handler tail).',
    body: 'PC = PC + 1; fetch; goto Main1',
  },
  {
    label: 'if-z',
    description: 'Conditional branch on Z (taken target must live in 0x100..0x1FF).',
    body: 'H = ${1:A_REG}; if (Z) goto ${2:T}',
  },
  {
    label: 'if-n',
    description: 'Conditional branch on N.',
    body: 'H = ${1:A_REG}; if (N) goto ${2:T}',
  },
  {
    label: 'dispatch',
    description: 'IJVM opcode dispatch — load opcode into MBR via fetch and goto (MBR).',
    body: 'goto (MBR)',
  },
  {
    label: 'shift-hi',
    description: 'Assemble a 16-bit operand high byte: `H = MBRU << 8`.',
    body: 'H = MBRU << 8',
  },
  {
    label: 'shift-low',
    description: 'OR the second operand byte into H (low byte).',
    body: 'H = MBRU OR H',
  },
];

// ─── IJVM reference content ───────────────────────────────────────────

const IJVM_OPCODE_DESC: Record<string, string> = {
  NOP: 'Do nothing.',
  BIPUSH: 'Push a sign-extended byte.',
  LDC_W: 'Push a word from the constant pool at the given 16-bit index.',
  ILOAD: 'Push local variable `LV[i]`. Operand is a 1-byte unsigned index (or 2 bytes after `WIDE`).',
  ISTORE: 'Pop into local variable `LV[i]`.',
  POP: 'Discard the top stack word.',
  DUP: 'Duplicate the top stack word.',
  SWAP: 'Swap the top two stack words.',
  IADD: 'Pop a, b; push a + b.',
  ISUB: 'Pop a, b; push b − a.',
  IAND: 'Pop a, b; push a AND b.',
  IOR: 'Pop a, b; push a OR b.',
  IFEQ: 'Pop v; branch if v == 0 (signed 16-bit PC-relative offset).',
  IFLT: 'Pop v; branch if v < 0.',
  IF_ICMPEQ: 'Pop a, b; branch if a == b.',
  GOTO: 'Unconditional 16-bit signed PC-relative branch.',
  IINC: '`LV[i] += c` where `c` is a sign-extended byte.',
  INVOKEVIRTUAL: 'Call a method via constant-pool index. Caller must have pushed OBJREF + args.',
  IRETURN: 'Pop return value, restore caller PC/LV/SP, push the return value.',
  WIDE: 'Prefix — widens the next ILOAD/ISTORE/IINC to a 16-bit local-variable index.',
  IN: 'Push a byte from the console input buffer; stalls (waiting-for-input) when the buffer is empty.',
  OUT: 'Pop a byte and append it to the console output.',
  ERR: 'Error halt (self-loop).',
  HALT: 'Normal halt (self-loop).',
};

const IJVM_DIRECTIVE_INFO: Record<string, string> = {
  '.method': '`**.method** name(p1, p2, ...)` — Start a method body. Lays out a 4-byte prologue (argsCount, localsCount) and binds `name` as a constant-pool entry whose value is the prologue\'s byte address. Close with `.end-method`.',
  '.end-method': 'Close the current `.method` block.',
  '.var': '`**.var** name` — Declare a named local variable inside `.method`. Indices auto-assigned after the implicit OBJREF slot and named parameters.',
  '.args': '`**.args** N` — Optional explicit args count (including OBJREF); validated against the `.method` header.',
  '.const': '`**.const** name value` — Define a 32-bit constant pool entry, named for use as a `LDC_W` / `INVOKEVIRTUAL` index.',
  '.constant': 'Alias for `.const` (Tanenbaum textbook spelling).',
};

// ─── Helpers ──────────────────────────────────────────────────────────

function tokenAt(
  model: monacoEditor.ITextModel,
  position: { lineNumber: number; column: number },
): { word: string; range: IRange } | null {
  const w = model.getWordAtPosition(position);
  if (!w) {
    // Try to grab a directive-style token (`.method`, `.var`, …).
    const line = model.getLineContent(position.lineNumber);
    const match = line
      .slice(0, position.column)
      .match(/(\.[A-Za-z_-]+)$/);
    if (match) {
      const start = position.column - match[1].length;
      return {
        word: match[1],
        range: {
          startLineNumber: position.lineNumber,
          startColumn: start,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
      };
    }
    return null;
  }
  return {
    word: w.word,
    range: {
      startLineNumber: position.lineNumber,
      startColumn: w.startColumn,
      endLineNumber: position.lineNumber,
      endColumn: w.endColumn,
    },
  };
}

// ─── Provider registration ────────────────────────────────────────────

export function registerMonacoProviders(monaco: Monaco): void {
  registerMalProviders(monaco);
  registerIjvmProviders(monaco);
}

function registerMalProviders(monaco: Monaco): void {
  // Hover.
  monaco.languages.registerHoverProvider('mal', {
    provideHover: (model, position) => {
      const tok = tokenAt(model, position);
      if (!tok) return null;
      const w = tok.word;
      const upper = w.toUpperCase();
      const lower = w.toLowerCase();

      let body: string | undefined;
      if (MAL_REGISTER_INFO[upper]) body = MAL_REGISTER_INFO[upper];
      else if (MAL_KEYWORD_INFO[upper]) body = MAL_KEYWORD_INFO[upper];
      else if (MAL_KEYWORD_INFO[lower]) body = MAL_KEYWORD_INFO[lower];
      else if (MAL_NUMBER_INFO[w]) body = MAL_NUMBER_INFO[w];
      else {
        // Maybe it's a label — show its address if known.
        const labels = useAppStore.getState().microAssembly?.labels;
        const addr = labels?.get(w);
        if (addr !== undefined) {
          body = `**${w}** — microaddress \`0x${addr.toString(16).toUpperCase().padStart(3, '0')}\` (label).`;
        }
      }
      if (!body) return null;
      return {
        range: tok.range,
        contents: [{ value: body }],
      };
    },
  });

  // Completion.
  monaco.languages.registerCompletionItemProvider('mal', {
    triggerCharacters: [' ', '=', ';', '(', '\t'],
    provideCompletionItems: (model, position) => {
      const wordInfo = model.getWordUntilPosition(position);
      const range: IRange = {
        startLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: wordInfo.endColumn,
      };
      const Kind = monaco.languages.CompletionItemKind;
      const InsertRule = monaco.languages.CompletionItemInsertTextRule;

      const suggestions: languages.CompletionItem[] = [];

      // Registers.
      for (const [name, doc] of Object.entries(MAL_REGISTER_INFO)) {
        suggestions.push({
          label: name,
          kind: Kind.Variable,
          insertText: name,
          detail: 'register',
          documentation: { value: doc },
          range,
        });
      }

      // Keywords / mem ops.
      for (const [name, doc] of Object.entries(MAL_KEYWORD_INFO)) {
        suggestions.push({
          label: name,
          kind: Kind.Keyword,
          insertText: name,
          detail: 'keyword',
          documentation: { value: doc },
          range,
        });
      }

      // Labels from the most recent assembly.
      const microAssembly = useAppStore.getState().microAssembly;
      if (microAssembly) {
        for (const [label, addr] of microAssembly.labels) {
          suggestions.push({
            label,
            kind: Kind.Reference,
            insertText: label,
            detail: `µaddress 0x${addr.toString(16).toUpperCase().padStart(3, '0')}`,
            range,
          });
        }
      }

      // Snippets — common micro-programming patterns.
      for (const s of MAL_SNIPPETS) {
        suggestions.push({
          label: s.label,
          kind: Kind.Snippet,
          insertText: s.body,
          insertTextRules: InsertRule.InsertAsSnippet,
          detail: 'snippet',
          documentation: { value: s.description + '\n\n```mal\n' + s.body + '\n```' },
          range,
        });
      }

      return { suggestions };
    },
  });
}

function registerIjvmProviders(monaco: Monaco): void {
  // Hover — opcodes, .directives, locals/methods.
  monaco.languages.registerHoverProvider('ijvm', {
    provideHover: (model, position) => {
      const tok = tokenAt(model, position);
      if (!tok) return null;
      const w = tok.word;

      // Opcode mnemonic?
      const upper = w.toUpperCase();
      const op = OPCODES_BY_MNEMONIC.get(upper);
      if (op) {
        const operands = op.operandKinds.length === 0
          ? '_(no operands)_'
          : op.operandKinds.map((k) => `\`${k}\``).join(', ');
        return {
          range: tok.range,
          contents: [
            {
              value: `**${op.mnemonic}** — opcode \`0x${op.opcode.toString(16).toUpperCase().padStart(2, '0')}\``,
            },
            { value: IJVM_OPCODE_DESC[upper] ?? '' },
            { value: 'Operands: ' + operands },
          ],
        };
      }

      // Directive?
      const lower = w.toLowerCase();
      if (IJVM_DIRECTIVE_INFO[lower]) {
        return {
          range: tok.range,
          contents: [{ value: IJVM_DIRECTIVE_INFO[lower] }],
        };
      }

      // Constant / method / label name?
      const ijvm = useAppStore.getState().ijvmAssembly;
      if (ijvm) {
        const m = ijvm.methods.get(w);
        if (m) {
          return {
            range: tok.range,
            contents: [
              {
                value: `**${w}()** — method, prologue at byte \`0x${m.prologueAddress.toString(16).toUpperCase().padStart(4, '0')}\``,
              },
              {
                value: `args: ${m.argsCount} (incl. OBJREF) — ${m.args.join(', ') || '_(none)_'}\n\nlocals: ${m.localsCount} — ${m.vars.join(', ') || '_(none)_'}`,
              },
            ],
          };
        }
        const c = ijvm.constantEntries.find((e) => e.name === w);
        if (c) {
          return {
            range: tok.range,
            contents: [
              {
                value: `**${w}** — constant pool entry \`#${c.index}\`${c.isMethod ? ' (method address)' : ''}, value \`0x${(c.value >>> 0).toString(16).toUpperCase()}\` (${c.value | 0})`,
              },
            ],
          };
        }
        const labelAddr = ijvm.labels.get(w);
        if (labelAddr !== undefined) {
          return {
            range: tok.range,
            contents: [
              {
                value: `**${w}:** — label, byte \`0x${labelAddr.toString(16).toUpperCase().padStart(4, '0')}\``,
              },
            ],
          };
        }
      }

      return null;
    },
  });

  // Completion — opcodes, directives, labels, named constants/methods/locals.
  monaco.languages.registerCompletionItemProvider('ijvm', {
    triggerCharacters: [' ', '\t', '.', ','],
    provideCompletionItems: (model, position) => {
      const wordInfo = model.getWordUntilPosition(position);
      const range: IRange = {
        startLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: wordInfo.endColumn,
      };
      const Kind = monaco.languages.CompletionItemKind;
      const suggestions: languages.CompletionItem[] = [];

      // Opcodes.
      for (const op of OPCODES) {
        suggestions.push({
          label: op.mnemonic,
          kind: Kind.Function,
          insertText: op.mnemonic,
          detail: `opcode 0x${op.opcode.toString(16).toUpperCase().padStart(2, '0')}`,
          documentation: { value: IJVM_OPCODE_DESC[op.mnemonic] ?? '' },
          range,
        });
      }

      // Directives.
      for (const [name, doc] of Object.entries(IJVM_DIRECTIVE_INFO)) {
        suggestions.push({
          label: name,
          kind: Kind.Keyword,
          insertText: name,
          detail: 'directive',
          documentation: { value: doc },
          range,
        });
      }

      const ijvm = useAppStore.getState().ijvmAssembly;
      if (ijvm) {
        // Labels.
        for (const [label, addr] of ijvm.labels) {
          suggestions.push({
            label,
            kind: Kind.Reference,
            insertText: label,
            detail: `byte 0x${addr.toString(16).toUpperCase().padStart(4, '0')}`,
            range,
          });
        }
        // Constants / methods.
        for (const c of ijvm.constantEntries) {
          suggestions.push({
            label: c.name,
            kind: c.isMethod ? Kind.Method : Kind.Constant,
            insertText: c.name,
            detail: c.isMethod ? `method (CP #${c.index})` : `constant #${c.index} = ${c.value}`,
            range,
          });
        }
        // Locals (args + vars) of every method — useful inside the method body.
        for (const m of ijvm.methods.values()) {
          for (let i = 0; i < m.args.length; i++) {
            suggestions.push({
              label: m.args[i],
              kind: Kind.Variable,
              insertText: m.args[i],
              detail: `${m.name}() — arg LV[${i + 1}]`,
              range,
            });
          }
          for (let i = 0; i < m.vars.length; i++) {
            suggestions.push({
              label: m.vars[i],
              kind: Kind.Variable,
              insertText: m.vars[i],
              detail: `${m.name}() — var LV[${1 + m.args.length + i}]`,
              range,
            });
          }
        }
      }

      // De-dup by label (later same-named entries are dropped to keep the
      // first, most-specific one).
      const seen = new Set<string>();
      const deduped = suggestions.filter((s) => {
        const key = typeof s.label === 'string' ? s.label : s.label.label;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { suggestions: deduped };
    },
  });
}
