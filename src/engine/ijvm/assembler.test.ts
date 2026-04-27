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
