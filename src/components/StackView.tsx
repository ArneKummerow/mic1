import { useAppStore } from '../store';
import styles from './StackView.module.css';

const WORDS_TO_SHOW = 24;

function fmtHex(n: number, width: number): string {
  return ((n >>> 0) & ((1 << (width * 4)) - 1))
    .toString(16)
    .padStart(width, '0')
    .toUpperCase();
}

function readWord(memory: Uint8Array, byteAddr: number): number {
  if (byteAddr < 0 || byteAddr + 3 >= memory.length) return 0;
  return (
    ((memory[byteAddr] << 24) |
      (memory[byteAddr + 1] << 16) |
      (memory[byteAddr + 2] << 8) |
      memory[byteAddr + 3]) |
    0
  );
}

/**
 * Operand-stack view. Renders WORDS_TO_SHOW words from SP downward, with
 * the cached TOS register surfacing as the top entry. LV is highlighted as
 * the local-variable frame base.
 */
export function StackView(): JSX.Element {
  const machine = useAppStore((s) => s.machine);
  // Subscribe to tick so the values refresh when memory mutates (the
  // Uint8Array reference is stable, so otherwise React wouldn't re-render).
  useAppStore((s) => s.tick);

  const sp = machine.SP;
  const lv = machine.LV;

  const rows: { wordAddr: number; value: number; tag: string }[] = [];
  for (let i = 0; i < WORDS_TO_SHOW; i++) {
    const w = sp - i;
    if (w < 0) break;
    const tag = w === sp ? 'TOS' : w === lv ? 'LV' : '';
    const value = w === sp ? machine.TOS : readWord(machine.memory, w * 4);
    rows.push({ wordAddr: w, value, tag });
  }

  return (
    <div className="panel">
      <div className={styles.body}>
        {rows.length === 0 ? (
          <div className={styles.empty}>(stack empty)</div>
        ) : (
          rows.map(({ wordAddr, value, tag }) => (
            <div
              key={wordAddr}
              className={`${styles.row} ${tag === 'TOS' ? styles.tosRow : ''} ${tag === 'LV' ? styles.lvRow : ''}`}
            >
              <span className={`mono ${styles.addr}`}>[{fmtHex(wordAddr, 4)}]</span>
              <span className={`mono ${styles.value}`}>{(value | 0).toString()}</span>
              {tag && <span className={styles.tag}>{tag}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
