import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useAppStore } from '../store';
import { IJVM_SAMPLES } from '../engine/ijvm';
import { DEFAULT_MICROCODE } from '../engine/defaultMicrocode';
import { importTextFile, exportTextFile } from '../utils/fileIO';
import { Dropdown, MenuItem, MenuSeparator, MenuGroupLabel } from './Dropdown';

const MAL_SPEC = { extension: '.mal', description: 'MAL microcode', mime: 'text/plain' } as const;
const IJVM_SPEC = { extension: '.ijvm', description: 'IJVM macrocode', mime: 'text/plain' } as const;

export function FileMenu(): JSX.Element {
  const [shareLabel, setShareLabel] = useState<'Copy share link' | 'Copied!'>(
    'Copy share link',
  );

  const handleImport = async (): Promise<void> => {
    const result = await importTextFile([MAL_SPEC, IJVM_SPEC]);
    if (!result) return;
    const lower = result.name.toLowerCase();
    const isMal = lower.endsWith('.mal');
    const isIjvm = lower.endsWith('.ijvm');
    if (!isMal && !isIjvm) {
      alert(`Unrecognised extension: ${result.name}\n\nExpected .mal or .ijvm.`);
      return;
    }
    const target = isMal ? 'microcode (MAL)' : 'macrocode (IJVM)';
    if (!confirm(`Replace the current ${target} with the contents of "${result.name}"?`)) return;
    if (isMal) useAppStore.setState({ microcode: result.text });
    else useAppStore.setState({ macrocode: result.text });
    useAppStore.getState().reset();
  };

  const handleExportMal = async (): Promise<void> => {
    await exportTextFile('microcode.mal', useAppStore.getState().microcode, MAL_SPEC);
  };

  const handleExportIjvm = async (): Promise<void> => {
    await exportTextFile('program.ijvm', useAppStore.getState().macrocode, IJVM_SPEC);
  };

  const handleShare = async (): Promise<void> => {
    await useAppStore.getState().copyShareUrl();
    setShareLabel('Copied!');
    setTimeout(() => setShareLabel('Copy share link'), 1500);
  };

  const handleResetDefaults = (): void => {
    if (
      confirm(
        'Replace the current microcode and macrocode with the bundled defaults? Your changes will be lost.',
      )
    ) {
      useAppStore.getState().resetToDefaults();
    }
  };

  const handleSample = (id: string): void => {
    const sample = IJVM_SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    const currentMicrocode = useAppStore.getState().microcode;
    const microcodeIsCustom = currentMicrocode !== DEFAULT_MICROCODE;
    const microcodeNote = microcodeIsCustom
      ? '\n\nYour MAL microcode will also be reset to the bundled default ' +
        '(samples are designed to run against it — using stale or stripped-down ' +
        'microcode causes runtime errors when a sample dispatches to an opcode the ' +
        'microcode does not implement).'
      : '';
    if (
      confirm(
        `Load the "${sample.label}" sample?\n\n${sample.description}${microcodeNote}\n\nYour current IJVM source will be replaced.`,
      )
    ) {
      useAppStore.setState({
        microcode: DEFAULT_MICROCODE,
        macrocode: sample.source,
      });
      useAppStore.getState().reset();
    }
  };

  return (
    <Dropdown
      label="File"
      icon={<FileText size={14} />}
      title="Import / export, samples, defaults, share"
    >
      {({ close }) => (
        <>
          <MenuItem
            onClick={() => {
              close();
              void handleImport();
            }}
          >
            Import .mal / .ijvm…
          </MenuItem>
          <MenuItem
            onClick={() => {
              close();
              void handleExportMal();
            }}
          >
            Export microcode (.mal)
          </MenuItem>
          <MenuItem
            onClick={() => {
              close();
              void handleExportIjvm();
            }}
          >
            Export macrocode (.ijvm)
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              void handleShare();
              // Don't close immediately — let the user see the "Copied!" flash.
              setTimeout(close, 1200);
            }}
          >
            {shareLabel}
          </MenuItem>
          <MenuItem
            onClick={() => {
              close();
              handleResetDefaults();
            }}
          >
            Restore defaults
          </MenuItem>
          <MenuSeparator />
          <MenuGroupLabel>Load sample</MenuGroupLabel>
          {IJVM_SAMPLES.map((s) => (
            <MenuItem
              key={s.id}
              onClick={() => {
                close();
                handleSample(s.id);
              }}
            >
              {s.label}
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}
