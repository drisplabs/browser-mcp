/**
 * NonDomSurface XML renderer unit tests
 */

import { describe, it, expect } from 'vitest';
import {
  renderNonDomSurface,
  renderNonDomControlDetails,
} from '../../../src/non-dom/surface-xml.js';
import {
  buildDialogSurface,
  buildFilePickerSurface,
  buildPermissionSurface,
} from '../../../src/non-dom/surface-store.js';
import type { PendingDialog } from '../../../src/non-dom/dialog-manager.js';

const alertDialog = (): PendingDialog => ({
  type: 'alert',
  message: 'Something happened',
  defaultValue: '',
  url: 'https://example.com',
});

const confirmDialog = (): PendingDialog => ({
  type: 'confirm',
  message: 'Are you sure?',
  defaultValue: '',
  url: 'https://example.com',
});

const promptDialog = (): PendingDialog => ({
  type: 'prompt',
  message: 'Enter name:',
  defaultValue: 'Alice',
  url: 'https://example.com',
});

describe('renderNonDomSurface — dialog', () => {
  it('renders alert dialog with OK button', () => {
    const surface = buildDialogSurface(alertDialog());
    const xml = renderNonDomSurface(surface);

    expect(xml).toContain('kind="dialog"');
    expect(xml).toContain('modal="true"');
    expect(xml).toContain('dialog_type="alert"');
    expect(xml).toContain('message="Something happened"');
    expect(xml).toContain('eid="nd-dialog-ok"');
    expect(xml).toContain('<dom_blocked reason="dialog" />');
  });

  it('renders confirm dialog with Accept and Dismiss buttons', () => {
    const surface = buildDialogSurface(confirmDialog());
    const xml = renderNonDomSurface(surface);

    expect(xml).toContain('eid="nd-dialog-ok"');
    expect(xml).toContain('eid="nd-dialog-dismiss"');
    expect(xml).not.toContain('eid="nd-dialog-input"');
  });

  it('renders prompt dialog with input and two buttons', () => {
    const surface = buildDialogSurface(promptDialog());
    const xml = renderNonDomSurface(surface);

    expect(xml).toContain('eid="nd-dialog-input"');
    expect(xml).toContain('kind="input"');
    expect(xml).toContain('value="Alice"');
    expect(xml).toContain('eid="nd-dialog-ok"');
    expect(xml).toContain('eid="nd-dialog-dismiss"');
  });

  it('escapes XML special characters in message', () => {
    const surface = buildDialogSurface({
      type: 'alert',
      message: '<script>alert("xss")</script>',
      defaultValue: '',
      url: '',
    });
    const xml = renderNonDomSurface(surface);

    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
  });

  it('omits value attribute when empty', () => {
    const surface = buildDialogSurface(alertDialog());
    const xml = renderNonDomSurface(surface);
    // OK button has no value
    expect(xml).not.toContain('value=""');
  });
});

describe('renderNonDomSurface — file-picker', () => {
  it('renders file-picker with path input and buttons', () => {
    const surface = buildFilePickerSurface(42, 'selectSingle');
    const xml = renderNonDomSurface(surface);

    expect(xml).toContain('kind="file-picker"');
    expect(xml).toContain('modal="true"');
    expect(xml).toContain('mode="selectSingle"');
    expect(xml).toContain('eid="nd-picker-path"');
    expect(xml).toContain('eid="nd-picker-choose"');
    expect(xml).toContain('eid="nd-picker-cancel"');
    expect(xml).toContain('<dom_blocked reason="file-picker" />');
  });

  it('includes placeholder on path input', () => {
    const surface = buildFilePickerSurface(0, 'selectSingle');
    const xml = renderNonDomSurface(surface);
    expect(xml).toContain('placeholder=');
  });

  it('omits mode attribute when mode is undefined', () => {
    const surface = buildFilePickerSurface(0, undefined);
    const xml = renderNonDomSurface(surface);
    expect(xml).not.toContain('mode=');
  });
});

describe('renderNonDomSurface — permission', () => {
  it('renders permission surface with Allow and Block buttons', () => {
    const surface = buildPermissionSurface(['geolocation'], 'https://example.com', 'req-1');
    const xml = renderNonDomSurface(surface);

    expect(xml).toContain('kind="permission"');
    expect(xml).toContain('modal="true"');
    expect(xml).toContain('permissions="geolocation"');
    expect(xml).toContain('origin="https://example.com"');
    expect(xml).toContain('eid="nd-permission-allow"');
    expect(xml).toContain('eid="nd-permission-deny"');
    expect(xml).toContain('<dom_blocked reason="permission" />');
  });

  it('joins multiple requested permissions with commas', () => {
    const surface = buildPermissionSurface(
      ['camera', 'microphone'],
      'https://meet.example.com',
      'req-2'
    );
    const xml = renderNonDomSurface(surface);
    expect(xml).toContain('permissions="camera,microphone"');
  });

  it('escapes XML special characters in origin', () => {
    const surface = buildPermissionSurface(['notifications'], 'https://x.com/?a=1&b=2', 'req-3');
    const xml = renderNonDomSurface(surface);
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('a=1&b=2');
  });
});

describe('renderNonDomControlDetails', () => {
  it('returns node with synthetic="true" for a dialog button', () => {
    const surface = buildDialogSurface(confirmDialog());
    const xml = renderNonDomControlDetails('nd-dialog-ok', surface);

    expect(xml).toContain('eid="nd-dialog-ok"');
    expect(xml).toContain('synthetic="true"');
    expect(xml).toContain('region="non_dom"');
    expect(xml).toContain('<hint>');
  });

  it('includes value attribute for prompt input with a value', () => {
    const surface = buildDialogSurface(promptDialog());
    // Set a value by finding the control (simulating updateInputValue)
    const input = surface.controls.find((c) => c.eid === 'nd-dialog-input')!;
    input.value = 'Bob';

    const xml = renderNonDomControlDetails('nd-dialog-input', surface);
    expect(xml).toContain('value="Bob"');
  });

  it('returns an error element for unknown EID', () => {
    const surface = buildDialogSurface(alertDialog());
    const xml = renderNonDomControlDetails('nd-unknown', surface);
    expect(xml).toContain('<error>');
    expect(xml).toContain('nd-unknown');
  });

  it('includes surface description in the output', () => {
    const surface = buildDialogSurface(confirmDialog());
    const xml = renderNonDomControlDetails('nd-dialog-ok', surface);
    expect(xml).toContain('confirm');
  });

  it('works for file-picker controls', () => {
    const surface = buildFilePickerSurface(1, 'selectSingle');
    const xml = renderNonDomControlDetails('nd-picker-path', surface);
    expect(xml).toContain('eid="nd-picker-path"');
    expect(xml).toContain('synthetic="true"');
  });

  it('works for permission controls and describes the request', () => {
    const surface = buildPermissionSurface(
      ['camera', 'microphone'],
      'https://example.com',
      'req-9'
    );
    const xml = renderNonDomControlDetails('nd-permission-allow', surface);
    expect(xml).toContain('eid="nd-permission-allow"');
    expect(xml).toContain('synthetic="true"');
    expect(xml).toContain('camera, microphone');
    expect(xml).toContain('https://example.com');
  });
});
