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

export function MacrocodeEditor(): JSX.Element {
  const macrocode = useAppStore((s) => s.macrocode);
  const setMacrocode = useAppStore((s) => s.setMacrocode);
  const ijvmAssembly = useAppStore((s) => s.ijvmAssembly);
  // Macro-code breakpoints are byte-address-specific: hitting one pauses
  // execution only when Main1 dispatches the IJVM instruction at *this*
  // call site, not at every other instance of the same opcode in the
  // program. (Use the microcode editor's gutter for "stop at every X
  // dispatch" — a µ-breakpoint on the opcode handler does that.)
  const macroBreakpoints = useAppStore((s) => s.macroBreakpoints);
  const toggleMacroBreakpoint = useAppStore((s) => s.toggleMacroBreakpoint);
  // Highlight the IJVM instruction whose handler is currently active. This is
  // pinned at the address of the last opcode dispatched by Main1 — using
  // `machine.PC` directly would mis-highlight mid-handler when PC walks past
  // the operand bytes.
  const currentPc = useAppStore((s) => s.currentOpcodeAddress);
  const theme = useAppStore((s) => s.uiPrefs.theme);
  const wordWrap = useAppStore((s) => s.uiPrefs.editorWordWrap);
  const codeJump = useAppStore((s) => s.uiPrefs.editorCodeJump);

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
  }, [ijvmAssembly]);

  // Custom gutter renderer: show the byte address in hex instead of raw
  // line numbers. Passed via the `options` prop so it survives the
  // re-applied options reconciliation that @monaco-editor/react performs
  // on every re-render — otherwise toggling state like word-wrap or
  // breakpoints would revert the gutter to plain line numbers.
  const lineNumbersFn = useRef((n: number): string => {
    const a = assemblyRef.current?.addressByLine.get(n);
    return a !== undefined ? fmtByteAddr(a) : '';
  }).current;

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
    if (codeJump) editor.revealLineInCenterIfOutsideViewport(line);
  }, [currentPc, ijvmAssembly, codeJump]);

  // Render breakpoint glyphs for any IJVM line whose byte address is in
  // the macro-breakpoint set.
  useEffect(() => {
    const decorations = bpDecorationsRef.current;
    if (!decorations || !ijvmAssembly) return;
    const items: editor.IModelDeltaDecoration[] = [];
    for (const [line, byteAddr] of ijvmAssembly.addressByLine) {
      if (!macroBreakpoints.has(byteAddr)) continue;
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
            value: `Breakpoint at byte 0x${fmtByteAddr(byteAddr)} — pauses only at this call site`,
          },
        },
      });
    }
    decorations.set(items);
  }, [macroBreakpoints, ijvmAssembly]);

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
      toggleMacroBreakpoint(byteAddr);
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
            lineNumbers: lineNumbersFn,
            lineNumbersMinChars: 6,
            glyphMargin: true,
            folding: false,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'line',
            tabSize: 2,
            wordWrap: wordWrap ? 'on' : 'off',
            automaticLayout: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
          }}
        />
      </div>
    </div>
  );
}
