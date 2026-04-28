import { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import styles from './MemoryView.module.css';

type FollowTarget = 'PC' | 'SP' | 'LV' | 'CPP' | 'fixed';

const ROW_BYTES = 16;
const ROWS_VISIBLE = 24; // window of bytes shown

function fmtHex(n: number, width: number): string {
  return ((n >>> 0) & ((1 << (width * 4)) - 1))
    .toString(16)
    .padStart(width, '0')
    .toUpperCase();
}

export function MemoryView(): JSX.Element {
  const machine = useAppStore((s) => s.machine);
  // Subscribe to tick so the byte cells update when memory mutates (the
  // Uint8Array reference is stable, so otherwise React wouldn't re-render).
  useAppStore((s) => s.tick);

  const [follow, setFollow] = useState<FollowTarget>('PC');
  const [fixedAddr, setFixedAddr] = useState(0);

  const followAddr = useMemo((): number => {
    switch (follow) {
      case 'PC':
        return machine.PC;
      case 'SP':
        return machine.SP * 4;
      case 'LV':
        return machine.LV * 4;
      case 'CPP':
        return machine.CPP * 4;
      case 'fixed':
        return fixedAddr;
    }
  }, [follow, fixedAddr, machine.PC, machine.SP, machine.LV, machine.CPP]);

  const startRow = Math.max(0, Math.floor(followAddr / ROW_BYTES) - Math.floor(ROWS_VISIBLE / 2));
  const startAddr = startRow * ROW_BYTES;

  const pcByte = machine.PC;
  const marByte = machine.MAR * 4;

  return (
    <div className="panel">
      <div className={styles.miniToolbar}>
        <span className={styles.followControl}>
          follow:
          <select
            className={styles.followSelect}
            value={follow}
            onChange={(e) => setFollow(e.target.value as FollowTarget)}
          >
            <option value="PC">PC</option>
            <option value="SP">SP</option>
            <option value="LV">LV</option>
            <option value="CPP">CPP</option>
            <option value="fixed">fixed</option>
          </select>
          {follow === 'fixed' && (
            <input
              className={`mono ${styles.fixedInput}`}
              value={'0x' + fmtHex(fixedAddr, 4)}
              onChange={(e) => {
                const v = parseInt(e.target.value.replace(/^0x/i, ''), 16);
                if (!Number.isNaN(v)) setFixedAddr(v);
              }}
            />
          )}
        </span>
      </div>
      <div className={styles.body}>
        <div className={styles.gridSection}>
          <div className={`mono ${styles.gridHeader}`}>
            <span className={styles.addrCol}></span>
            {Array.from({ length: ROW_BYTES }, (_, i) => (
              <span key={i} className={styles.byteCol}>
                {fmtHex(i, 1)}
              </span>
            ))}
            <span className={styles.asciiCol}>ASCII</span>
          </div>
          {Array.from({ length: ROWS_VISIBLE }, (_, i) => {
            const rowAddr = startAddr + i * ROW_BYTES;
            return (
              <div key={rowAddr} className={`mono ${styles.gridRow}`}>
                <span className={styles.addrCol}>{fmtHex(rowAddr, 4)}</span>
                {Array.from({ length: ROW_BYTES }, (_, j) => {
                  const addr = rowAddr + j;
                  if (addr >= machine.memory.length) {
                    return <span key={j} className={styles.byteCol}>··</span>;
                  }
                  const byte = machine.memory[addr];
                  const cellClass = [
                    styles.byteCol,
                    addr === pcByte && styles.pcByte,
                    addr >= marByte && addr < marByte + 4 && styles.marByte,
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <span key={j} className={cellClass}>
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
        </div>
      </div>
    </div>
  );
}
