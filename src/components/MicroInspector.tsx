/**
 * Microinstruction Inspector — renders the *current* control word (the
 * microinstruction at `lastTrace.mpcBefore`, falling back to `machine.MPC`
 * before any step has run) using the bit-level view shared with
 * ControlStoreView.
 *
 * Pairs with the data-path SVG: that view shows flow through the buses;
 * this one shows what the current control bits actually encode.
 */
import { useAppStore } from '../store';
import { BitFieldHeader, BitFieldRow, BIT_FIELDS_WIDTH } from './BitView';
import styles from './MicroInspector.module.css';

function fmtMpc(addr: number): string {
  return '0x' + addr.toString(16).padStart(3, '0').toUpperCase();
}

export function MicroInspector(): JSX.Element {
  const mpc = useAppStore((s) => s.lastTrace?.mpcBefore ?? s.machine.MPC);
  const instr = useAppStore((s) => s.machine.controlStore[mpc]);

  return (
    <div className="panel">
      <div className={styles.header}>
        <span className={styles.title}>Current µinstruction</span>
        <span className={`mono ${styles.addr}`}>{fmtMpc(mpc)}</span>
        {instr?.label && <span className={styles.label}>{instr.label}</span>}
        {!instr && <span className={styles.empty}>(no µinstruction at this address)</span>}
      </div>
      <div className={styles.body}>
        <div className={styles.bitsScroll}>
          <div style={{ width: BIT_FIELDS_WIDTH }}>
            <BitFieldHeader />
            <div className={styles.bitsRow}>
              <BitFieldRow instr={instr} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
