import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import styles from './Console.module.css';

/**
 * Console panel — output buffer fed by the IJVM `OUT` instruction; input
 * buffer fed to `IN`.
 *
 * Both are wired through the memory-mapped I/O port at `MAR = -1`: `OUT`
 * writes the low byte of `MDR`, which the simulator drains into
 * `machine.consoleOutputBuffer` and the store appends to `consoleOutput`.
 * `IN` reads a byte from `machine.consoleInputBuffer`; if the buffer is
 * empty, the simulator stalls and the store transitions to
 * `'waiting-for-input'` until `appendConsoleInput` pushes a byte.
 */
export function Console(): JSX.Element {
  const consoleOutput = useAppStore((s) => s.consoleOutput);
  const consoleInput = useAppStore((s) => s.consoleInput);
  const waitingForInput = useAppStore((s) => s.mode === 'waiting-for-input');
  const clearConsoleOutput = useAppStore((s) => s.clearConsoleOutput);
  const appendConsoleInput = useAppStore((s) => s.appendConsoleInput);

  const [pending, setPending] = useState('');
  const outRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to the bottom on new output.
    const el = outRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [consoleOutput]);

  const submitInput = (s: string): void => {
    if (s.length === 0) return;
    appendConsoleInput(s + '\n');
    setPending('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitInput(pending);
    }
  };

  return (
    <div className="panel">
      <div className={styles.miniToolbar}>
        {waitingForInput && <span className={styles.waiting}>waiting for input…</span>}
        <button
          className={styles.clearBtn}
          onClick={clearConsoleOutput}
          title="Clear output"
          disabled={consoleOutput.length === 0}
        >
          clear
        </button>
      </div>
      <div className={styles.body}>
        <div className={`mono ${styles.output}`} ref={outRef}>
          {consoleOutput || <span className={styles.placeholderText}>(no output)</span>}
        </div>
        <div className={styles.inputRow}>
          <span className={styles.prompt}>›</span>
          <input
            type="text"
            className={`mono ${styles.input}`}
            value={pending}
            onChange={(e) => setPending(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type and press Enter to feed IJVM IN"
          />
        </div>
        {consoleInput.length > 0 && (
          <div className={styles.inputBuffer}>
            <span className={styles.bufferLabel}>buffer:</span>
            <span className={`mono ${styles.bufferText}`}>{JSON.stringify(consoleInput)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
