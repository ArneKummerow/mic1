import { describe, it, expect } from 'vitest';
import { assembleIJVM } from './assembler';

function expectNoErrors(r: ReturnType<typeof assembleIJVM>): void {
  if (r.errors.length > 0) {
    throw new Error(
      `Errors:\n${r.errors.map((e) => `  ${e.line}:${e.column} ${e.message}`).join('\n')}`,
    );
  }
}

describe('IJVM assembler: simple programs', () => {
  it('assembles BIPUSH + IADD + HALT', () => {
    const r = assembleIJVM(`
      BIPUSH 5
      BIPUSH 7
      IADD
      HALT
    `);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0x10, 5, 0x10, 7, 0x60, 0xff]);
  });

  it('encodes negative BIPUSH as a two\'s-complement byte', () => {
    const r = assembleIJVM(`BIPUSH -1\nHALT`);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0x10, 0xff, 0xff]);
  });

  it('rejects BIPUSH out of range', () => {
    const r = assembleIJVM(`BIPUSH 200`);
    expect(r.errors.some((e) => /out of range/.test(e.message))).toBe(true);
  });

  it('encodes ILOAD with unsigned byte index', () => {
    const r = assembleIJVM(`ILOAD 0\nILOAD 200\nHALT`);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0x15, 0, 0x15, 200, 0xff]);
  });

  it('encodes IINC with two operands separated by comma', () => {
    const r = assembleIJVM(`IINC 3, -2`);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0x84, 3, 0xfe]);
  });

  it('encodes LDC_W with 16-bit unsigned operand big-endian', () => {
    const r = assembleIJVM(`LDC_W 0x1234`);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0x13, 0x12, 0x34]);
  });
});

describe('IJVM assembler: labels and branches', () => {
  it('resolves a forward GOTO label', () => {
    const r = assembleIJVM(`
      GOTO end
      BIPUSH 99
      end:
        HALT
    `);
    expectNoErrors(r);
    // GOTO at byte 0, target at byte 5. Offset = 5 - 0 = 5.
    expect(r.bytes[0]).toBe(0xa7);
    expect((r.bytes[1] << 8) | r.bytes[2]).toBe(5);
    expect(r.labels.get('end')).toBe(5);
  });

  it('resolves a backward branch (negative offset)', () => {
    const r = assembleIJVM(`
      loop:
        BIPUSH 1
        GOTO loop
    `);
    expectNoErrors(r);
    // BIPUSH at 0, GOTO at 2, target at 0. Offset = 0 - 2 = -2 → 0xFFFE.
    expect(r.bytes[2]).toBe(0xa7);
    const off = (r.bytes[3] << 8) | r.bytes[4];
    expect(off).toBe(0xfffe);
  });

  it('IFEQ encodes the same way', () => {
    const r = assembleIJVM(`
      IFEQ skip
      BIPUSH 9
      skip:
        HALT
    `);
    expectNoErrors(r);
    expect(r.bytes[0]).toBe(0x99);
    expect((r.bytes[1] << 8) | r.bytes[2]).toBe(5);
  });

  it('reports unknown label', () => {
    const r = assembleIJVM(`GOTO nowhere`);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Unknown label 'nowhere'/);
  });

  it('reports duplicate label', () => {
    const r = assembleIJVM(`
      foo: BIPUSH 1
      foo: BIPUSH 2
    `);
    expect(r.errors.some((e) => /Duplicate label 'foo'/.test(e.message))).toBe(true);
  });

  it('allows label on its own line', () => {
    const r = assembleIJVM(`
      start:
      BIPUSH 1
      GOTO start
    `);
    expectNoErrors(r);
    expect(r.labels.get('start')).toBe(0);
  });
});

describe('IJVM assembler: comments and whitespace', () => {
  it('strips // line comments', () => {
    const r = assembleIJVM(`
      // top
      BIPUSH 1     // trailing
      // mid
      HALT
    `);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0x10, 1, 0xff]);
  });

  it('handles blank and indented lines', () => {
    const r = assembleIJVM(`\n\n   BIPUSH 0\n\n   HALT\n`);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0x10, 0, 0xff]);
  });
});

describe('IJVM assembler: error reporting', () => {
  it('reports unknown mnemonic', () => {
    const r = assembleIJVM(`FROBNICATE`);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Unknown mnemonic/);
  });

  it('reports operand count mismatch', () => {
    const r = assembleIJVM(`BIPUSH`);
    expect(r.errors.some((e) => /1 operand/.test(e.message))).toBe(true);
  });
});

describe('IJVM assembler: source map', () => {
  it('records line ↔ address mapping', () => {
    const r = assembleIJVM(`
      BIPUSH 1
      BIPUSH 2
      IADD
      HALT
    `);
    expectNoErrors(r);
    // Lines 2,3,4,5 → addresses 0,2,4,5.
    expect(r.addressByLine.get(2)).toBe(0);
    expect(r.addressByLine.get(3)).toBe(2);
    expect(r.addressByLine.get(4)).toBe(4);
    expect(r.addressByLine.get(5)).toBe(5);
    expect(r.lineByAddress.get(0)).toBe(2);
    expect(r.lineByAddress.get(4)).toBe(4);
  });
});

describe('IJVM assembler: directives — .constant', () => {
  it('binds .constant name and resolves it as a 16-bit pool index in LDC_W', () => {
    const r = assembleIJVM(`
      .constant FOO 0xCAFE
      LDC_W FOO
      HALT
    `);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0x13, 0x00, 0x00, 0xff]);
    expect(r.constants.length).toBe(1);
    expect(r.constants[0]).toBe(0xcafe | 0);
    expect(r.constantEntries[0].name).toBe('FOO');
    expect(r.constantEntries[0].index).toBe(0);
  });

  it('accepts .const as an alias for .constant', () => {
    const r = assembleIJVM(`
      .const A 1
      .const B 2
      LDC_W B
      HALT
    `);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0x13, 0x00, 0x01, 0xff]);
    expect(r.constants[0]).toBe(1);
    expect(r.constants[1]).toBe(2);
  });

  it('rejects duplicate constant names', () => {
    const r = assembleIJVM(`
      .constant DUP 1
      .constant DUP 2
    `);
    expect(r.errors.some((e) => /Duplicate constant 'DUP'/.test(e.message))).toBe(true);
  });

  it('reports unknown constant in LDC_W', () => {
    const r = assembleIJVM(`LDC_W NOPE\nHALT`);
    expect(r.errors.some((e) => /Unknown constant 'NOPE'/.test(e.message))).toBe(true);
  });

  it('preserves negative 32-bit constants as int32', () => {
    const r = assembleIJVM(`
      .const NEG -1
      LDC_W NEG
      HALT
    `);
    expectNoErrors(r);
    expect(r.constants[0]).toBe(-1);
  });
});

describe('IJVM assembler: directives — .method / .var / .args', () => {
  it('emits a 4-byte prologue and binds method name as constant', () => {
    const r = assembleIJVM(`
      .method foo()
        IRETURN
      .end-method
    `);
    expectNoErrors(r);
    // Prologue: argsCount=1 (just OBJREF), localsCount=0; then IRETURN (0xAC).
    expect([...r.bytes]).toEqual([0x00, 0x01, 0x00, 0x00, 0xac]);
    expect(r.methods.has('foo')).toBe(true);
    expect(r.methods.get('foo')!.argsCount).toBe(1);
    expect(r.methods.get('foo')!.localsCount).toBe(0);
    expect(r.methods.get('foo')!.prologueAddress).toBe(0);
    // Method registers a constant pool entry whose value is the prologue addr.
    expect(r.constantEntries[0].name).toBe('foo');
    expect(r.constantEntries[0].isMethod).toBe(true);
    expect(r.constants[0]).toBe(0);
  });

  it('counts named args (incl OBJREF) and locals separately', () => {
    const r = assembleIJVM(`
      .method bar(p1, p2)
        .var v1
        .var v2
        .var v3
        IRETURN
      .end-method
    `);
    expectNoErrors(r);
    expect(r.methods.get('bar')!.argsCount).toBe(3); // OBJREF + p1 + p2
    expect(r.methods.get('bar')!.localsCount).toBe(3);
    expect([...r.bytes.slice(0, 4)]).toEqual([0x00, 0x03, 0x00, 0x03]);
  });

  it('resolves named args and vars in ILOAD/ISTORE/IINC', () => {
    const r = assembleIJVM(`
      .method foo(p1)
        .var v1
        ILOAD p1
        ISTORE v1
        IINC v1, 5
        IRETURN
      .end-method
    `);
    expectNoErrors(r);
    // Prologue (4 bytes), then ILOAD 1 (p1), ISTORE 2 (v1), IINC 2,5, IRETURN.
    expect([...r.bytes]).toEqual([
      0x00, 0x02, 0x00, 0x01, // prologue: args=2, locals=1
      0x15, 0x01,             // ILOAD p1 (LV[1])
      0x36, 0x02,             // ISTORE v1 (LV[2])
      0x84, 0x02, 0x05,       // IINC v1, 5
      0xac,                   // IRETURN
    ]);
  });

  it('resolves method name as constant pool index in INVOKEVIRTUAL', () => {
    const r = assembleIJVM(`
      .method foo()
        IRETURN
      .end-method
      .method bar()
        INVOKEVIRTUAL foo
        IRETURN
      .end-method
    `);
    expectNoErrors(r);
    // foo prologue + IRETURN at 0..4. bar prologue at 5..8, INVOKEVIRTUAL at 9.
    // foo's constant pool index = 0, bar's = 1.
    expect(r.bytes[9]).toBe(0xb6); // INVOKEVIRTUAL
    expect((r.bytes[10] << 8) | r.bytes[11]).toBe(0); // refers to foo (pool idx 0)
  });

  it('errors on .var outside of .method', () => {
    const r = assembleIJVM(`.var foo`);
    expect(r.errors.some((e) => /\.var outside of \.method/.test(e.message))).toBe(true);
  });

  it('errors on duplicate local within a method', () => {
    const r = assembleIJVM(`
      .method m(x)
        .var x
        IRETURN
      .end-method
    `);
    expect(r.errors.some((e) => /Duplicate local 'x'/.test(e.message))).toBe(true);
  });

  it('errors on unknown local in ILOAD inside a method', () => {
    const r = assembleIJVM(`
      .method m()
        ILOAD nope
        IRETURN
      .end-method
    `);
    expect(r.errors.some((e) => /Unknown local 'nope'/.test(e.message))).toBe(true);
  });

  it('errors on unclosed .method', () => {
    const r = assembleIJVM(`
      .method orphan()
        IRETURN
    `);
    expect(r.errors.some((e) => /missing \.end-method/.test(e.message))).toBe(true);
  });

  it('errors on duplicate method name', () => {
    const r = assembleIJVM(`
      .method foo()
        IRETURN
      .end-method
      .method foo()
        IRETURN
      .end-method
    `);
    expect(r.errors.some((e) => /Duplicate (method|constant) 'foo'/.test(e.message))).toBe(true);
  });

  it('.args N validates against the method header', () => {
    const ok = assembleIJVM(`
      .method m(a, b)
        .args 3
        IRETURN
      .end-method
    `);
    expectNoErrors(ok);
    const bad = assembleIJVM(`
      .method m(a, b)
        .args 5
        IRETURN
      .end-method
    `);
    expect(bad.errors.some((e) => /\.args 5 disagrees/.test(e.message))).toBe(true);
  });

  it('numeric ILOAD index inside .method validates against declared count', () => {
    const r = assembleIJVM(`
      .method m(a)
        .var b
        ILOAD 9
        IRETURN
      .end-method
    `);
    expect(r.errors.some((e) => /Local index 9 exceeds 2/.test(e.message))).toBe(true);
  });
});

describe('IJVM assembler: WIDE prefix folding', () => {
  it('WIDE ILOAD widens the index operand to 16 bits', () => {
    const r = assembleIJVM(`WIDE\nILOAD 300\nHALT`);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0xc4, 0x15, 0x01, 0x2c, 0xff]);
  });

  it('WIDE ISTORE widens the index operand to 16 bits', () => {
    const r = assembleIJVM(`WIDE\nISTORE 0x0102\nHALT`);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0xc4, 0x36, 0x01, 0x02, 0xff]);
  });

  it('WIDE IINC widens the index but keeps the const as a signed byte', () => {
    const r = assembleIJVM(`WIDE\nIINC 0x0102, -1\nHALT`);
    expectNoErrors(r);
    expect([...r.bytes]).toEqual([0xc4, 0x84, 0x01, 0x02, 0xff, 0xff]);
  });

  it('WIDE without ILOAD/ISTORE/IINC reports an error', () => {
    const r = assembleIJVM(`WIDE\nIADD\nHALT`);
    expect(r.errors.some((e) => /WIDE must be followed by/i.test(e.message))).toBe(true);
  });

  it('WIDE at the very end reports an error', () => {
    const r = assembleIJVM(`WIDE`);
    expect(r.errors.some((e) => /WIDE not followed by/i.test(e.message))).toBe(true);
  });

  it('WIDE ILOAD with named local resolves to a 16-bit index', () => {
    const r = assembleIJVM(`
      .method m()
        .var x
        WIDE
        ILOAD x
        IRETURN
      .end-method
    `);
    expectNoErrors(r);
    // Prologue (4 bytes) + WIDE (1) + ILOAD (1) + 2-byte idx + IRETURN
    // x is the 1st named var → LV[1].
    expect([...r.bytes]).toEqual([
      0x00, 0x01, 0x00, 0x01, // prologue: argsCount=1, locals=1
      0xc4, 0x15, 0x00, 0x01, // WIDE ILOAD x (idx=1)
      0xac,                    // IRETURN
    ]);
  });
});

describe('IJVM assembler: source map with directives', () => {
  it('records line ↔ address for .method prologue', () => {
    const r = assembleIJVM(`
      .method m()
        IRETURN
      .end-method
    `);
    expectNoErrors(r);
    // Line 2 (the .method line) maps to the prologue's address (0).
    expect(r.addressByLine.get(2)).toBe(0);
    // Line 3 (IRETURN) maps past the 4-byte prologue (4).
    expect(r.addressByLine.get(3)).toBe(4);
  });
});
