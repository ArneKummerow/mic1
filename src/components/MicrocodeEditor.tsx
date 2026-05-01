import { useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useAppStore } from '../store';
import { registerMonacoLanguages } from './monacoLanguages';
import styles from './CodeEditor.module.css';

const MONACO_THEME = 'mic1-dark';

function defineTheme(monaco: Monaco): void {
  monaco.editor.defineTheme(MONACO_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7480', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'f0883e' },
      { token: 'keyword.operator', foreground: 'f0883e' },
      { token: 'variable.predefined', foreground: '58a6ff' },
      { token: 'constant', foreground: 'f0e442' },
      { token: 'number', foreground: '94de4a' },
      { token: 'number.hex', foreground: '94de4a' },
      { token: 'type.identifier', foreground: 'cc79a7', fontStyle: 'bold' },
      { token: 'operator', foreground: 'e6edf3' },
    ],
    colors: {
      'editor.background': '#161b22',
      'editor.foreground': '#e6edf3',
      'editorLineNumber.foreground': '#6b7480',
      'editorLineNumber.activeForeground': '#9da7b0',
      'editor.selectionBackground': '#2a313a',
      'editor.lineHighlightBackground': '#1f242c',
    },
  });
}

function fmtMpc(addr: number): string {
  return addr.toString(16).toUpperCase().padStart(3, '0');
}

export function MicrocodeEditor(): JSX.Element {
  const microcode = useAppStore((s) => s.microcode);
  const setMicrocode = useAppStore((s) => s.setMicrocode);
  const microAssembly = useAppStore((s) => s.microAssembly);
  const breakpoints = useAppStore((s) => s.breakpoints);
  const toggleBreakpoint = useAppStore((s) => s.toggleBreakpoint);
  // Highlight the microinstruction whose execution is shown in the data path
  // (the just-executed cycle), falling back to MPC before the first step.
  const currentMpc = useAppStore((s) => s.lastTrace?.mpcBefore ?? s.machine.MPC);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const bpDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  // Latest assembly result, in a ref so the static `lineNumbers` callback
  // reads fresh data without re-creating the editor instance.
  const assemblyRef = useRef<typeof microAssembly>(microAssembly);
  assemblyRef.current = microAssembly;

  // Push assembler errors into Monaco as squiggle markers.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !microAssembly) return;
    const model = editor.getModel();
    if (!model) return;
    const markers: editor.IMarkerData[] = microAssembly.errors.map((e) => ({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: e.line,
      startColumn: e.column,
      endLineNumber: e.line,
      endColumn: e.column + 1,
      message: e.message,
    }));
    monaco.editor.setModelMarkers(model, 'mal', markers);

    // Force the gutter to re-render with the new address mapping.
    editor.updateOptions({
      lineNumbers: (n: number) => {
        const a = assemblyRef.current?.addressByLine.get(n);
        return a !== undefined ? fmtMpc(a) : '';
      },
    });
  }, [microAssembly]);

  // Highlight the source line corresponding to the current MPC.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !microAssembly) return;
    const line = microAssembly.lineByAddress.get(currentMpc);
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
  }, [currentMpc, microAssembly]);

  // Render breakpoint glyphs in the gutter for every line whose µaddress
  // currently has a breakpoint set.
  useEffect(() => {
    const decorations = bpDecorationsRef.current;
    if (!decorations || !microAssembly) return;
    const items: editor.IModelDeltaDecoration[] = [];
    for (const addr of breakpoints) {
      // Find the line for this address (lineByAddress maps the *first* line
      // of a multi-line emission, which is the right anchor for a glyph).
      const line = microAssembly.lineByAddress.get(addr);
      if (line === undefined) continue;
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
          glyphMarginHoverMessage: { value: `Breakpoint at µaddress 0x${fmtMpc(addr)}` },
        },
      });
    }
    decorations.set(items);
  }, [breakpoints, microAssembly]);

  const handleMount: React.ComponentProps<typeof Editor>['onMount'] = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    registerMonacoLanguages(monaco);
    defineTheme(monaco);
    monaco.editor.setTheme(MONACO_THEME);
    decorationsRef.current = ed.createDecorationsCollection();
    bpDecorationsRef.current = ed.createDecorationsCollection();

    // Toggle breakpoints when the user clicks the glyph margin (or the
    // line-number column — both feel natural for "break here").
    ed.onMouseDown((e) => {
      const t = e.target.type;
      const onGutter =
        t === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        t === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
      if (!onGutter) return;
      const lineNumber = e.target.position?.lineNumber;
      if (lineNumber === undefined) return;
      const addr = assemblyRef.current?.addressByLine.get(lineNumber);
      if (addr === undefined) return;
      toggleBreakpoint(addr);
    });

    // Custom gutter content: show the assembled µaddress in hex instead of
    // raw line numbers. Lines that don't emit a microinstruction render
    // empty (their stock line number is uninteresting).
    ed.updateOptions({
      lineNumbers: (n: number) => {
        const a = assemblyRef.current?.addressByLine.get(n);
        return a !== undefined ? fmtMpc(a) : '';
      },
    });
  };

  return (
    <div className="panel">
      <div className={styles.editorWrap}>
        {microAssembly && microAssembly.errors.length > 0 && (
          <span className={styles.errorBadge}>
            {microAssembly.errors.length} error{microAssembly.errors.length === 1 ? '' : 's'}
          </span>
        )}
        <Editor
          language="mal"
          value={microcode}
          onChange={(v) => setMicrocode(v ?? '')}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'on',
            lineNumbersMinChars: 5,
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
