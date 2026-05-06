import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { OPCODES_BY_BYTE, instructionSize } from '../engine/ijvm/opcodes';
import styles from './MemoryView.module.css';

type FollowTarget = 'none' | 'PC' | 'SP' | 'LV' | 'CPP';

const ROW_BYTES = 16;
const ROW_HEIGHT = 18; // px — must match `.gridRow { height: … }` in CSS
const OVERSCAN_ROWS = 6;
const WIDE_OPCODE = 0xc4;

const FOLLOW_HINT: Record<FollowTarget, string> = {
  none: 'Manual scrolling — view does not move on its own',
  PC: 'Program Counter — current IJVM instruction',
  SP: 'Stack Pointer — top word of the operand stack',
  LV: 'Local Variable frame base — args/locals of the active method',
  CPP: 'Constant Pool Pointer — base of the constant pool',
};

function fmtHex(n: number, width: number): string {
  return ((n >>> 0) & ((1 << (width * 4)) - 1))
    .toString(16)
    .padStart(width, '0')
    .toUpperCase();
}

/**
 * Total byte length of the IJVM instruction at `addr`. Returns `1` if the
 * byte isn't a known opcode (e.g. PC currently sits on an operand byte
 * mid-execution, or on data) — caller will only highlight that one byte.
 *
 * `WIDE` (0xC4) is a prefix that doubles the size of any `ubyte` operand of
 * the following instruction; `sbyte`/`uword` operands keep their natural
 * size in this simulator (matches the WIDE handlers in defaultMicrocode.ts).
 */
function instructionByteLength(memory: Uint8Array, addr: number): number {
  const op = memory[addr];
  if (op === undefined) return 1;
  const info = OPCODES_BY_BYTE.get(op);
  if (!info) return 1;
  if (op !== WIDE_OPCODE) return instructionSize(info);

  const next = memory[addr + 1];
  if (next === undefined) return 1;
  const nextInfo = OPCODES_BY_BYTE.get(next);
  if (!nextInfo) return 2; // WIDE + unknown byte: highlight just the prefix pair
  let len = 2; // WIDE byte + opcode byte
  for (const k of nextInfo.operandKinds) {
    len += k === 'ubyte' ? 2 : k === 'sbyte' ? 1 : 2;
  }
  return len;
}

export function MemoryView(): JSX.Element {
  const machine = useAppStore((s) => s.machine);
  const opcodeAddr = useAppStore((s) => s.currentOpcodeAddress);
  // Subscribe to tick so the byte cells update when memory mutates (the
  // Uint8Array reference is stable, so otherwise React wouldn't re-render).
  useAppStore((s) => s.tick);

  const [follow, setFollow] = useState<FollowTarget>('none');

  const followAddr = useMemo((): number | null => {
    switch (follow) {
      case 'none':
        return null;
      case 'PC':
        return machine.PC;
      case 'SP':
        return machine.SP * 4;
      case 'LV':
        return machine.LV * 4;
      case 'CPP':
        return machine.CPP * 4;
    }
  }, [follow, machine.PC, machine.SP, machine.LV, machine.CPP]);

  const totalRows = Math.ceil(machine.memory.length / ROW_BYTES);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (followAddr === null) return;
    const el = scrollRef.current;
    if (!el) return;
    const row = Math.floor(followAddr / ROW_BYTES);
    const target = row * ROW_HEIGHT - el.clientHeight / 2 + ROW_HEIGHT / 2;
    el.scrollTop = Math.max(0, target);
  }, [followAddr]);

  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const visibleCount = Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN_ROWS * 2;
  const lastRow = Math.min(totalRows, firstRow + visibleCount);

  const topPad = firstRow * ROW_HEIGHT;
  const bottomPad = (totalRows - lastRow) * ROW_HEIGHT;

  // Byte ranges to highlight. PC is single-byte (the literal PC position),
  // the "instruction" range covers all bytes of the IJVM op currently being
  // executed (anchored at `currentOpcodeAddress` so it stays stable while
  // PC walks across operand bytes), and SP/LV/CPP/MAR each cover the 4
  // bytes of the word they point at.
  const pcByte = machine.PC;
  const marByte = machine.MAR * 4;
  const spByte = machine.SP * 4;
  const lvByte = machine.LV * 4;
  const cppByte = machine.CPP * 4;
  const instrLen = instructionByteLength(machine.memory, opcodeAddr);
  const instrStart = opcodeAddr;
  const instrEnd = opcodeAddr + instrLen; // exclusive

  return (
    <div className="panel">
      <div className={styles.miniToolbar}>
        <span className={styles.followControl}>
          follow:
          <select
            className={styles.followSelect}
            value={follow}
            onChange={(e) => setFollow(e.target.value as FollowTarget)}
            title={FOLLOW_HINT[follow]}
          >
            {(Object.keys(FOLLOW_HINT) as FollowTarget[]).map((t) => (
              <option key={t} value={t} title={FOLLOW_HINT[t]}>
                {t}
              </option>
            ))}
          </select>
        </span>
      </div>
      <div className={styles.body}>
        <div className={`mono ${styles.gridHeader}`}>
          <span className={styles.addrCol}></span>
          {Array.from({ length: ROW_BYTES }, (_, i) => (
            <span key={i} className={styles.byteCol}>
              {fmtHex(i, 1)}
            </span>
          ))}
          <span className={styles.asciiCol}>ASCII</span>
        </div>
        <div
          ref={scrollRef}
          className={styles.gridSection}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div style={{ height: topPad }} />
          {Array.from({ length: lastRow - firstRow }, (_, i) => {
            const rowAddr = (firstRow + i) * ROW_BYTES;
            return (
              <div key={rowAddr} className={`mono ${styles.gridRow}`}>
                <span className={styles.addrCol}>{fmtHex(rowAddr, 4)}</span>
                {Array.from({ length: ROW_BYTES }, (_, j) => {
                  const addr = rowAddr + j;
                  if (addr >= machine.memory.length) {
                    return (
                      <span key={j} className={styles.byteCol}>
                        ··
                      </span>
                    );
                  }
                  const byte = machine.memory[addr];
                  const inWord = (base: number): boolean =>
                    addr >= base && addr < base + 4;
                  const inInstr = addr >= instrStart && addr < instrEnd;

                  // Tags drive both visual treatment and the hover label.
                  // Order here mirrors CSS declaration order: the LAST
                  // matching class in the stylesheet wins for `background`,
                  // so cell priority is encoded by the order of the rules
                  // below — see MemoryView.module.css.
                  const tags: string[] = [];
                  if (inWord(cppByte)) tags.push('CPP');
                  if (inWord(lvByte)) tags.push('LV');
                  if (inInstr) tags.push('PC instr');
                  if (inWord(spByte)) tags.push('SP');
                  if (inWord(marByte)) tags.push('MAR');
                  if (addr === pcByte) tags.push('PC');

                  // For continuous-bar look: mark the leftmost / rightmost
                  // cell of each contiguous highlighted run so we can round
                  // those outer corners only.
                  const highlighted = tags.length > 0;
                  const prevHighlighted =
                    j > 0 &&
                    (() => {
                      const a = addr - 1;
                      return (
                        a === pcByte ||
                        (a >= marByte && a < marByte + 4) ||
                        (a >= spByte && a < spByte + 4) ||
                        (a >= lvByte && a < lvByte + 4) ||
                        (a >= cppByte && a < cppByte + 4) ||
                        (a >= instrStart && a < instrEnd)
                      );
                    })();
                  const nextHighlighted =
                    j < ROW_BYTES - 1 &&
                    (() => {
                      const a = addr + 1;
                      return (
                        a === pcByte ||
                        (a >= marByte && a < marByte + 4) ||
                        (a >= spByte && a < spByte + 4) ||
                        (a >= lvByte && a < lvByte + 4) ||
                        (a >= cppByte && a < cppByte + 4) ||
                        (a >= instrStart && a < instrEnd)
                      );
                    })();

                  const cellClass = [
                    styles.byteCol,
                    tags.includes('CPP') && styles.cppByte,
                    tags.includes('LV') && styles.lvByte,
                    tags.includes('PC instr') && styles.pcRange,
                    tags.includes('SP') && styles.spByte,
                    tags.includes('MAR') && styles.marByte,
                    tags.includes('PC') && styles.pcByte,
                    highlighted && !prevHighlighted && styles.runStart,
                    highlighted && !nextHighlighted && styles.runEnd,
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <span
                      key={j}
                      className={cellClass}
                      title={tags.length > 0 ? tags.join(' / ') : undefined}
                    >
                      {fmtHex(byte, 2)}
                    </span>
                  );
                })}
                <span className={styles.asciiCol}>
                  {Array.from({ length: ROW_BYTES }, (_, j) => {
                    const addr = rowAddr + j;
                    const byte = machine.memory[addr];
                    if (byte === undefined) return ' ';
                    return byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '·';
                  }).join('')}
                </span>
              </div>
            );
          })}
          <div style={{ height: bottomPad }} />
        </div>
      </div>
    </div>
  );
}
