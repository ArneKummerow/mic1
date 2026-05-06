import { useMemo } from 'react';
import { useAppStore } from '../store';
import type { RegisterName } from '../engine/types';
import styles from './RegisterPanel.module.css';

const REGISTER_DISPLAY_ORDER: readonly RegisterName[] = [
  'MAR',
  'MDR',
  'PC',
  'MBR',
  'SP',
  'LV',
  'CPP',
  'TOS',
  'OPC',
  'H',
];

function fmtHex32(n: number): string {
  return '0x' + ((n >>> 0).toString(16).padStart(8, '0').toUpperCase());
}

function fmtHex8(n: number): string {
  return '0x' + ((n & 0xff).toString(16).padStart(2, '0').toUpperCase());
}

// Registers that get a per-name accent color so they're visually linked to
// their counterparts in the data path, memory view, and stack view. Other
// registers (MDR/MBR/OPC/H) aren't memory-associated and stay neutral.
const REG_COLOR_VAR: Partial<Record<RegisterName, string>> = {
  PC: 'var(--reg-pc)',
  MAR: 'var(--reg-mar)',
  SP: 'var(--reg-sp)',
  LV: 'var(--reg-lv)',
  CPP: 'var(--reg-cpp)',
  TOS: 'var(--reg-tos)',
};

export function RegisterPanel(): JSX.Element {
  const machine = useAppStore((s) => s.machine);
  const lastTrace = useAppStore((s) => s.lastTrace);
  const microAssembly = useAppStore((s) => s.microAssembly);

  const writtenThisStep = useMemo(
    () => new Set(lastTrace?.cBusTargets ?? []),
    [lastTrace],
  );

  const mpc = machine.MPC;
  const currentInstr = machine.controlStore[mpc];
  const mpcLabel = currentInstr?.label ?? null;

  // Reverse-lookup: try to find the label closest to MPC for context.
  const fallbackLabel = useMemo(() => {
    if (mpcLabel) return mpcLabel;
    if (!microAssembly) return null;
    let best: string | null = null;
    let bestAddr = -1;
    for (const [name, addr] of microAssembly.labels) {
      if (addr <= mpc && addr > bestAddr) {
        best = name;
        bestAddr = addr;
      }
    }
    return best;
  }, [mpc, mpcLabel, microAssembly]);

  return (
    <div className="panel">
      <div className={styles.body}>
        <div className={styles.mpcRow}>
          <span className={styles.mpcLabel}>MPC</span>
          <span className={`mono ${styles.mpcValue}`}>0x{mpc.toString(16).padStart(3, '0').toUpperCase()}</span>
          {fallbackLabel && <span className={styles.mpcSymbol}>{fallbackLabel}</span>}
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Reg</th>
              <th>Hex</th>
              <th>Dec</th>
            </tr>
          </thead>
          <tbody>
            {REGISTER_DISPLAY_ORDER.map((name) => {
              const value = machine[name];
              const flash = writtenThisStep.has(name as Exclude<RegisterName, 'MBR'>);
              const isMbr = name === 'MBR';
              return (
                <tr key={name} className={flash ? styles.flash : undefined}>
                  <td
                    className={styles.regName}
                    style={REG_COLOR_VAR[name] ? { color: REG_COLOR_VAR[name] } : undefined}
                  >
                    {name}
                  </td>
                  <td className={`mono ${styles.regHex}`}>
                    {isMbr ? fmtHex8(value) : fmtHex32(value)}
                  </td>
                  <td className={`mono ${styles.regDec}`}>
                    {isMbr ? (value & 0xff).toString() : (value | 0).toString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
