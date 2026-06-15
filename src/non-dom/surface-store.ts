/**
 * NonDomSurfaceStore
 *
 * Per-page store for active non-DOM surfaces (JavaScript dialogs, file pickers).
 * Surfaces are stored in a WeakMap keyed by the Puppeteer Page object so they
 * are automatically garbage-collected when the page closes.
 *
 * Synthetic element IDs use the "nd-" prefix so action tools can route them
 * internally without a second targeting model.
 */

import type { Page } from 'puppeteer-core';
import type { DialogType, PendingDialog, FileChooserState } from './dialog-manager.js';

// ============================================================================
// Types
// ============================================================================

export type NonDomControlKind = 'button' | 'input' | 'text';
export type NonDomSurfaceKind = 'dialog' | 'file-picker';

export interface NonDomControl {
  /** Synthetic EID — always starts with "nd-" */
  eid: string;
  /** Control kind (matches snapshot kinds) */
  kind: NonDomControlKind;
  /** Human-readable label */
  label: string;
  /** Current typed value (inputs only) */
  value?: string;
  /** Placeholder hint */
  placeholder?: string;
}

export interface NonDomSurface {
  /** Surface category */
  kind: NonDomSurfaceKind;
  /** Always true — non-DOM surfaces in this implementation are blocking */
  blocking: true;
  /** Actionable controls with synthetic EIDs */
  controls: NonDomControl[];

  // Dialog-specific context
  dialogType?: DialogType;
  dialogMessage?: string;
  dialogDefaultValue?: string;

  // File-picker-specific context
  /** CDP mode: selectSingle | selectMultiple | save */
  pickerMode?: string;
  /** CDP backend node ID of the file input (for DOM.setFileInputFiles) */
  pickerBackendNodeId?: number;
}

// ============================================================================
// Per-page store
// ============================================================================

const store = new WeakMap<object, NonDomSurface>();

/** Return the active non-DOM surface for a page, or null if none. */
export function getSurface(page: Page): NonDomSurface | null {
  return store.get(page) ?? null;
}

/** Set the active non-DOM surface for a page. */
export function setSurface(page: Page, surface: NonDomSurface): void {
  store.set(page, surface);
}

/** Clear the active non-DOM surface (after the agent resolves it). */
export function clearSurface(page: Page): void {
  store.delete(page);
}

/**
 * Update the value of a writable input control on the active surface.
 * Returns true if the control was found and updated, false otherwise.
 */
export function updateInputValue(page: Page, eid: string, text: string, clear: boolean): boolean {
  const surface = store.get(page);
  if (!surface) return false;
  const ctrl = surface.controls.find((c) => c.eid === eid && c.kind === 'input');
  if (!ctrl) return false;
  ctrl.value = clear ? text : (ctrl.value ?? '') + text;
  return true;
}

// ============================================================================
// Surface builders
// ============================================================================

/**
 * Build a dialog surface from a pending JavaScript dialog.
 *
 * Controls by dialog type:
 * - alert:       OK button
 * - confirm:     Accept + Dismiss buttons
 * - prompt:      text input + Submit + Cancel buttons
 * - beforeunload: Stay on Page + Leave buttons
 */
export function buildDialogSurface(dialog: PendingDialog): NonDomSurface {
  const controls: NonDomControl[] = [];

  switch (dialog.type) {
    case 'alert':
      controls.push({ eid: 'nd-dialog-ok', kind: 'button', label: 'OK' });
      break;

    case 'confirm':
      controls.push({ eid: 'nd-dialog-ok', kind: 'button', label: 'Accept' });
      controls.push({ eid: 'nd-dialog-dismiss', kind: 'button', label: 'Dismiss' });
      break;

    case 'prompt':
      controls.push({
        eid: 'nd-dialog-input',
        kind: 'input',
        label: 'Prompt response',
        value: dialog.defaultValue || '',
        placeholder: 'Type your response here',
      });
      controls.push({ eid: 'nd-dialog-ok', kind: 'button', label: 'Submit' });
      controls.push({ eid: 'nd-dialog-dismiss', kind: 'button', label: 'Cancel' });
      break;

    case 'beforeunload':
      controls.push({ eid: 'nd-dialog-ok', kind: 'button', label: 'Stay on Page' });
      controls.push({ eid: 'nd-dialog-dismiss', kind: 'button', label: 'Leave' });
      break;
  }

  return {
    kind: 'dialog',
    blocking: true,
    controls,
    dialogType: dialog.type,
    dialogMessage: dialog.message,
    dialogDefaultValue: dialog.defaultValue,
  };
}

/**
 * Build a file-picker surface from a file chooser event.
 *
 * Controls:
 * - File path input (nd-picker-path) — accepts absolute browser-host path(s)
 * - Choose/Save button (nd-picker-choose)
 * - Cancel button (nd-picker-cancel)
 *
 * Mode "selectMultiple" allows newline-separated paths.
 * Mode "save" uses "Save" label instead of "Choose".
 */
export function buildFilePickerSurface(
  backendNodeId: number | undefined,
  mode: string | undefined
): NonDomSurface {
  const isMultiple = mode === 'selectMultiple';
  const isSave = mode === 'save';

  return {
    kind: 'file-picker',
    blocking: true,
    controls: [
      {
        eid: 'nd-picker-path',
        kind: 'input',
        label: isMultiple ? 'File paths (one per line)' : 'File path',
        value: '',
        placeholder: isMultiple
          ? 'Absolute paths on browser host, one per line'
          : 'Absolute path on browser host (e.g. /home/user/file.txt)',
      },
      {
        eid: 'nd-picker-choose',
        kind: 'button',
        label: isSave ? 'Save' : 'Choose',
      },
      {
        eid: 'nd-picker-cancel',
        kind: 'button',
        label: 'Cancel',
      },
    ],
    pickerMode: mode,
    pickerBackendNodeId: backendNodeId,
  };
}

/**
 * Build a file-picker surface from a direct file input node.
 * Used when the agent clicks an input[type=file] directly.
 */
export function buildFilePickerSurfaceForInput(
  backendNodeId: number,
  allowsMultiple: boolean
): NonDomSurface {
  return buildFilePickerSurface(backendNodeId, allowsMultiple ? 'selectMultiple' : 'selectSingle');
}

/**
 * Check if an EID is a synthetic non-DOM control identifier.
 */
export function isNonDomEid(eid: string): boolean {
  return eid.startsWith('nd-');
}

/**
 * Get a control from the active surface by EID.
 */
export function getSurfaceControl(page: Page, eid: string): NonDomControl | null {
  const surface = store.get(page);
  if (!surface) return null;
  return surface.controls.find((c) => c.eid === eid) ?? null;
}

// Re-export FileChooserState type for callers
export type { FileChooserState };
