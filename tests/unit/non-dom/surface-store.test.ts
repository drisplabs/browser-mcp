/**
 * NonDomSurfaceStore unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSurface,
  setSurface,
  clearSurface,
  updateInputValue,
  buildDialogSurface,
  buildFilePickerSurface,
  buildFilePickerSurfaceForInput,
  isNonDomEid,
  getSurfaceControl,
} from '../../../src/non-dom/surface-store.js';
import type { PendingDialog } from '../../../src/non-dom/dialog-manager.js';

// A minimal fake Page object for WeakMap keying
function makeFakePage(): object {
  return {};
}

describe('isNonDomEid', () => {
  it('returns true for nd- prefixed EIDs', () => {
    expect(isNonDomEid('nd-dialog-ok')).toBe(true);
    expect(isNonDomEid('nd-picker-path')).toBe(true);
    expect(isNonDomEid('nd-')).toBe(true);
  });

  it('returns false for normal EIDs', () => {
    expect(isNonDomEid('eid-abc123')).toBe(false);
    expect(isNonDomEid('rd-abc123')).toBe(false);
    expect(isNonDomEid('')).toBe(false);
  });
});

describe('Surface store (WeakMap)', () => {
  let page: object;

  beforeEach(() => {
    page = makeFakePage();
  });

  it('returns null when no surface is set', () => {
    expect(getSurface(page as never)).toBeNull();
  });

  it('stores and retrieves a surface', () => {
    const surface = buildDialogSurface({ type: 'alert', message: 'Hi', defaultValue: '', url: '' });
    setSurface(page as never, surface);
    expect(getSurface(page as never)).toBe(surface);
  });

  it('clears the surface', () => {
    setSurface(
      page as never,
      buildDialogSurface({ type: 'alert', message: 'Hi', defaultValue: '', url: '' })
    );
    clearSurface(page as never);
    expect(getSurface(page as never)).toBeNull();
  });

  it('isolates surfaces per page', () => {
    const page2 = makeFakePage();
    const surface1 = buildDialogSurface({ type: 'alert', message: '1', defaultValue: '', url: '' });
    const surface2 = buildDialogSurface({
      type: 'confirm',
      message: '2',
      defaultValue: '',
      url: '',
    });
    setSurface(page as never, surface1);
    setSurface(page2 as never, surface2);
    expect(getSurface(page as never)?.dialogMessage).toBe('1');
    expect(getSurface(page2 as never)?.dialogMessage).toBe('2');
  });
});

describe('buildDialogSurface', () => {
  const dialog = (type: PendingDialog['type'], msg = 'msg', def = ''): PendingDialog => ({
    type,
    message: msg,
    defaultValue: def,
    url: 'https://example.com',
  });

  it('alert → single OK button', () => {
    const surface = buildDialogSurface(dialog('alert'));
    expect(surface.kind).toBe('dialog');
    expect(surface.blocking).toBe(true);
    expect(surface.dialogType).toBe('alert');
    expect(surface.controls).toHaveLength(1);
    expect(surface.controls[0].eid).toBe('nd-dialog-ok');
    expect(surface.controls[0].kind).toBe('button');
  });

  it('confirm → Accept + Dismiss buttons', () => {
    const surface = buildDialogSurface(dialog('confirm', 'Sure?'));
    expect(surface.controls).toHaveLength(2);
    expect(surface.controls.map((c) => c.eid)).toEqual(['nd-dialog-ok', 'nd-dialog-dismiss']);
    expect(surface.dialogMessage).toBe('Sure?');
  });

  it('prompt → input + Submit + Cancel', () => {
    const surface = buildDialogSurface(dialog('prompt', 'Enter value:', 'default'));
    expect(surface.controls).toHaveLength(3);
    const [input, ok, cancel] = surface.controls;
    expect(input.eid).toBe('nd-dialog-input');
    expect(input.kind).toBe('input');
    expect(input.value).toBe('default');
    expect(ok.eid).toBe('nd-dialog-ok');
    expect(cancel.eid).toBe('nd-dialog-dismiss');
    expect(surface.dialogDefaultValue).toBe('default');
  });

  it('beforeunload → Stay on Page + Leave', () => {
    const surface = buildDialogSurface(dialog('beforeunload'));
    const labels = surface.controls.map((c) => c.label);
    expect(labels).toContain('Stay on Page');
    expect(labels).toContain('Leave');
    expect(surface.controls.map((c) => c.eid)).toEqual(['nd-dialog-ok', 'nd-dialog-dismiss']);
  });
});

describe('buildFilePickerSurface', () => {
  it('returns a file-picker surface with 3 controls', () => {
    const surface = buildFilePickerSurface(42, 'selectSingle');
    expect(surface.kind).toBe('file-picker');
    expect(surface.blocking).toBe(true);
    expect(surface.pickerBackendNodeId).toBe(42);
    expect(surface.pickerMode).toBe('selectSingle');
    expect(surface.controls).toHaveLength(3);
    const eids = surface.controls.map((c) => c.eid);
    expect(eids).toContain('nd-picker-path');
    expect(eids).toContain('nd-picker-choose');
    expect(eids).toContain('nd-picker-cancel');
  });

  it('save mode labels the confirm button "Save"', () => {
    const surface = buildFilePickerSurface(0, 'save');
    const choose = surface.controls.find((c) => c.eid === 'nd-picker-choose')!;
    expect(choose.label).toBe('Save');
  });

  it('multiple mode labels the path input for multiple paths', () => {
    const surface = buildFilePickerSurface(0, 'selectMultiple');
    const path = surface.controls.find((c) => c.eid === 'nd-picker-path')!;
    expect(path.label).toMatch(/paths/i);
  });

  it('handles undefined backendNodeId and mode', () => {
    const surface = buildFilePickerSurface(undefined, undefined);
    expect(surface.pickerBackendNodeId).toBeUndefined();
    expect(surface.pickerMode).toBeUndefined();
  });
});

describe('buildFilePickerSurfaceForInput', () => {
  it('creates selectSingle surface for single-file inputs', () => {
    const surface = buildFilePickerSurfaceForInput(99, false);
    expect(surface.pickerMode).toBe('selectSingle');
    expect(surface.pickerBackendNodeId).toBe(99);
  });

  it('creates selectMultiple surface for multi-file inputs', () => {
    const surface = buildFilePickerSurfaceForInput(99, true);
    expect(surface.pickerMode).toBe('selectMultiple');
  });
});

describe('updateInputValue', () => {
  let page: object;

  beforeEach(() => {
    page = makeFakePage();
    const surface = buildDialogSurface({
      type: 'prompt',
      message: 'Enter:',
      defaultValue: 'hello',
      url: '',
    });
    setSurface(page as never, surface);
  });

  it('appends text when clear=false', () => {
    const ok = updateInputValue(page as never, 'nd-dialog-input', ' world', false);
    expect(ok).toBe(true);
    const surface = getSurface(page as never)!;
    const ctrl = surface.controls.find((c) => c.eid === 'nd-dialog-input')!;
    expect(ctrl.value).toBe('hello world');
  });

  it('replaces text when clear=true', () => {
    updateInputValue(page as never, 'nd-dialog-input', 'new', true);
    const surface = getSurface(page as never)!;
    const ctrl = surface.controls.find((c) => c.eid === 'nd-dialog-input')!;
    expect(ctrl.value).toBe('new');
  });

  it('returns false for unknown EID', () => {
    const ok = updateInputValue(page as never, 'nd-dialog-ok', 'x', false);
    expect(ok).toBe(false);
  });

  it('returns false when no surface is active', () => {
    const fresh = makeFakePage();
    const ok = updateInputValue(fresh as never, 'nd-dialog-input', 'x', false);
    expect(ok).toBe(false);
  });
});

describe('getSurfaceControl', () => {
  let page: object;

  beforeEach(() => {
    page = makeFakePage();
    setSurface(
      page as never,
      buildDialogSurface({ type: 'confirm', message: 'Sure?', defaultValue: '', url: '' })
    );
  });

  it('returns the control by EID', () => {
    const ctrl = getSurfaceControl(page as never, 'nd-dialog-ok');
    expect(ctrl).not.toBeNull();
    expect(ctrl?.label).toBe('Accept');
  });

  it('returns null for unknown EID', () => {
    expect(getSurfaceControl(page as never, 'nd-picker-path')).toBeNull();
  });

  it('returns null when no surface is active', () => {
    const fresh = makeFakePage();
    expect(getSurfaceControl(fresh as never, 'nd-dialog-ok')).toBeNull();
  });
});
