/**
 * Monaco bootstrap. By default `@monaco-editor/react` loads Monaco from a
 * CDN (jsdelivr) at runtime — convenient, but it means a network hit and a
 * silent blank editor when the CDN is slow or blocked. We have the
 * `monaco-editor` package installed locally, so we point the loader at it
 * and ship Monaco in our own bundle.
 *
 * Also wires up the Vite-friendly web-worker pattern so Monaco's tokenizer
 * and language workers load correctly.
 */

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

let initialized = false;

export function setupMonaco(): void {
  if (initialized) return;
  initialized = true;

  // Our two languages are Monarch-only, so the editor worker is sufficient
  // — no JSON / TS / CSS / HTML workers are needed.
  self.MonacoEnvironment = {
    getWorker() {
      return new editorWorker();
    },
  };

  loader.config({ monaco });
}
