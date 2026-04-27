/**
 * Monaco language definitions for MAL and IJVM. Registered once at app start.
 *
 * We use Monaco's Monarch tokenizer (regex-based) — adequate for syntax
 * highlighting; semantic checking happens via our own assemblers.
 */

import type { Monaco } from '@monaco-editor/react';

let registered = false;

export function registerMonacoLanguages(monaco: Monaco): void {
  if (registered) return;
  registered = true;

  // ─── MAL (microcode) ──────────────────────────────────────────────
  monaco.languages.register({ id: 'mal' });
  monaco.languages.setMonarchTokensProvider('mal', {
    defaultToken: '',
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\b(rd|wr|fetch|goto|if)\b/, 'keyword'],
        [/\b(AND|OR)\b/, 'keyword.operator'],
        [
          /\b(MAR|MDR|PC|MBR|MBRU|SP|LV|CPP|TOS|OPC|H)\b/,
          'variable.predefined',
        ],
        [/\b(N|Z)\b/, 'constant'],
        [/0x[0-9a-fA-F]+/, 'number.hex'],
        [/-?\d+/, 'number'],
        [/[A-Za-z_][A-Za-z0-9_]*/, 'identifier'],
        [/[=;:,()]/, 'delimiter'],
        [/<<|>>/, 'operator'],
        [/[-+~]/, 'operator'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration('mal', {
    comments: { lineComment: '//' },
    brackets: [['(', ')']],
    autoClosingPairs: [{ open: '(', close: ')' }],
  });

  // ─── IJVM (macrocode) ─────────────────────────────────────────────
  const IJVM_MNEMONICS = [
    'NOP',
    'BIPUSH',
    'LDC_W',
    'ILOAD',
    'ISTORE',
    'POP',
    'DUP',
    'SWAP',
    'IADD',
    'ISUB',
    'IAND',
    'IOR',
    'IFEQ',
    'IFLT',
    'IF_ICMPEQ',
    'GOTO',
    'IINC',
    'INVOKEVIRTUAL',
    'IRETURN',
    'WIDE',
    'IN',
    'OUT',
    'ERR',
    'HALT',
  ];

  monaco.languages.register({ id: 'ijvm' });
  monaco.languages.setMonarchTokensProvider('ijvm', {
    defaultToken: '',
    keywords: IJVM_MNEMONICS,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/^\s*[A-Za-z_][A-Za-z0-9_]*\s*:/, 'type.identifier'], // labels
        [
          /[A-Za-z_][A-Za-z0-9_]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier',
            },
          },
        ],
        [/0x[0-9a-fA-F]+/, 'number.hex'],
        [/-?\d+/, 'number'],
        [/[,:]/, 'delimiter'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration('ijvm', {
    comments: { lineComment: '//' },
  });
}
