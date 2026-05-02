import { useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useAppStore } from '../store';
import { registerMonacoLanguages } from './monacoLanguages';
import { monacoThemeName, cssFontSize } from './monacoSetup';
import styles from './CodeEditor.module.css';

function fmtByteAddr(addr: number): string {
  return addr.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Map an IJVM byte address to the µaddress where Main1 dispatches its
 * handler — i.e. the opcode value itself. We use this so a breakpoint set
 * in the IJVM editor's gutter triggers when the µprogram dispatches that
 * opcode (the natural "stop here" point for an IJVM-level breakpoint).
 *
 * Returns `null` when the byte at `addr` isn't a known opcode (e.g. it's
 * an operand byte) — in which case clicking does nothing.
 */
function ijvmAddressToBreakpointMpc(
  addr: number,
  bytes: Uint8Array,
): number | null {
  if (addr < 0 || addr >= bytes.length) return null;
  // The handler entry sits at MPC = opcode byte.
  const opcode = bytes[addr];
  if (opcode === undefined) return null;
  return opcode;
}

export function MacrocodeEditor(): JSX.Element {
  const macrocode = useAppStore((s) => s.macrocode);
  const setMacrocode = useAppStore((s) => s.setMacrocode);
  const ijvmAssembly = useAppStore((s) => s.ijvmAssembly);
  const breakpoints = useAppStore((s) => s.breakpoints);
  const toggleBreakpoint = useAppStore((s) => s.toggleBreakpoint);
  // Highlight the IJVM instruction whose handler is currently active. This is
  // pinned at the address of the last opcode dispatched by Main1 — using
  // `machine.PC` directly would mis-highlight mid-handler when PC walks past
  // the operand bytes.
  const currentPc = useAppStore((s) => s.currentOpcodeAddress);
  const theme = useAppStore((s) => s.uiPrefs.theme);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const bpDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const assemblyRef = useRef<typeof ijvmAssembly>(ijvmAssembly);
  assemblyRef.current = ijvmAssembly;

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    monaco.editor.setTheme(monacoThemeName(theme));
  }, [theme]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !ijvmAssembly) return;
    const model = editor.getModel();
    if (!model) return;
    const markers: editor.IMarkerData[] = ijvmAssembly.errors.map((e) => ({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: e.line,
      startColumn: e.column,
      endLineNumber: e.line,
      endColumn: e.column + 1,
      message: e.message,
    }));
    monaco.editor.setModelMarkers(model, 'ijvm', markers);

    editor.updateOptions({
      lineNumbers: (n: number) => {
        const a = assemblyRef.current?.addressByLine.get(n);
        return a !== undefined ? fmtByteAddr(a) : '';
      },
    });
  }, [ijvmAssembly]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !ijvmAssembly) return;
    const line = ijvmAssembly.lineByAddress.get(currentPc);
    const decorations = decorationsRef.current;
    if (!decorations) return;
    if (line === undefined) {
      decorations.set([]);
      return;
    }
    decorations.set([
      {
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'mic1-current-line',
          glyphMarginClassName: 'mic1-current-glyph',
        },
      },
    ]);
    editor.revealLineInCenterIfOutsideViewport(line);
  }, [currentPc, ijvmAssembly]);

  // Render breakpoint glyphs for any IJVM line whose opcode-dispatch
  // µaddress currently has a breakpoint.
  useEffect(() => {
    const decorations = bpDecorationsRef.current;
    if (!decorations || !ijvmAssembly) return;
    const items: editor.IModelDeltaDecoration[] = [];
    for (const [line, byteAddr] of ijvmAssembly.addressByLine) {
      const mpc = ijvmAddressToBreakpointMpc(byteAddr, ijvmAssembly.bytes);
      if (mpc === null || !breakpoints.has(mpc)) continue;
      items.push({
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1,
        },
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'mic1-bp-glyph',
          glyphMarginHoverMessage: {
            value: `Breakpoint on opcode dispatch (µaddress 0x${mpc.toString(16).toUpperCase().padStart(3, '0')})`,
          },
        },
      });
    }
    decorations.set(items);
  }, [breakpoints, ijvmAssembly]);

  const handleMount: React.ComponentProps<typeof Editor>['onMount'] = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    registerMonacoLanguages(monaco);
    monaco.editor.setTheme(monacoThemeName(theme));
    decorationsRef.current = ed.createDecorationsCollection();
    bpDecorationsRef.current = ed.createDecorationsCollection();

    ed.onMouseDown((e) => {
      const t = e.target.type;
      const onGutter =
        t === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        t === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
      if (!onGutter) return;
      const lineNumber = e.target.position?.lineNumber;
      if (lineNumber === undefined) return;
      const ija = assemblyRef.current;
      if (!ija) return;
      const byteAddr = ija.addressByLine.get(lineNumber);
      if (byteAddr === undefined) return;
      const mpc = ijvmAddressToBreakpointMpc(byteAddr, ija.bytes);
      if (mpc === null) return;
      toggleBreakpoint(mpc);
    });

    ed.updateOptions({
      lineNumbers: (n: number) => {
        const a = assemblyRef.current?.addressByLine.get(n);
        return a !== undefined ? fmtByteAddr(a) : '';
      },
    });
  };

  return (
    <div className="panel">
      <div className={styles.editorWrap}>
        {ijvmAssembly && ijvmAssembly.errors.length > 0 && (
          <span className={styles.errorBadge}>
            {ijvmAssembly.errors.length} error{ijvmAssembly.errors.length === 1 ? '' : 's'}
          </span>
        )}
        <Editor
          language="ijvm"
          value={macrocode}
          onChange={(v) => setMacrocode(v ?? '')}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: cssFontSize('--fs-md', 13),
            lineNumbers: 'on',
            lineNumbersMinChars: 6,
            glyphMargin: true,
            folding: false,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'line',
            tabSize: 2,
            automaticLayout: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
          }}
        />
      </div>
    </div>
  );
}
