/**
 * Cross-browser file import / export helpers.
 *
 * Prefers the File System Access API (showOpenFilePicker / showSaveFilePicker)
 * when available — that gives a real OS file dialog and remembers the file
 * handle for re-saving. Falls back to a hidden `<input type="file">` for read,
 * and a temporary download anchor for write, which works everywhere else
 * including Firefox and `file://` contexts.
 */

export interface FileSpec {
  /** e.g. ".mal", ".ijvm". Leading dot required. */
  extension: string;
  /** Human-readable description for the picker, e.g. "MAL microcode". */
  description: string;
  /** MIME type. Plain text is fine for our use cases. */
  mime: string;
}

interface ShowOpenFilePicker {
  (opts: {
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
    multiple?: boolean;
  }): Promise<FileSystemFileHandle[]>;
}

interface ShowSaveFilePicker {
  (opts: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }): Promise<FileSystemFileHandle>;
}

interface WindowWithFSA extends Window {
  showOpenFilePicker?: ShowOpenFilePicker;
  showSaveFilePicker?: ShowSaveFilePicker;
}

function fsaWindow(): WindowWithFSA {
  return window as WindowWithFSA;
}

/**
 * Opens a file picker, returns the picked file's name and text content.
 * Returns null if the user cancels.
 */
export async function importTextFile(specs: FileSpec[]): Promise<{ name: string; text: string } | null> {
  const w = fsaWindow();
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const [handle] = await w.showOpenFilePicker({
        multiple: false,
        types: specs.map((s) => ({
          description: s.description,
          accept: { [s.mime]: [s.extension] },
        })),
      });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text() };
    } catch (err) {
      // AbortError = user cancelled; anything else, fall through to fallback.
      if (err instanceof DOMException && err.name === 'AbortError') return null;
    }
  }

  // Fallback: hidden <input type="file">.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = specs.map((s) => s.extension).join(',');
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then((text) => resolve({ name: file.name, text }));
    });
    // If the user cancels, no `change` event fires; resolve(null) on focus
    // return to keep the promise from hanging.
    const onFocus = (): void => {
      window.removeEventListener('focus', onFocus);
      // Give the change event a chance to fire first.
      setTimeout(() => {
        if (!input.files?.length) resolve(null);
      }, 250);
    };
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
    input.remove();
  });
}

/**
 * Saves `text` to a file. Uses the FS Access API's "Save As" dialog when
 * available, otherwise falls back to a download anchor with the suggested
 * name.
 */
export async function exportTextFile(suggestedName: string, text: string, spec: FileSpec): Promise<void> {
  const w = fsaWindow();
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: spec.description, accept: { [spec.mime]: [spec.extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Other errors: fall through to anchor fallback.
    }
  }

  const blob = new Blob([text], { type: spec.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
