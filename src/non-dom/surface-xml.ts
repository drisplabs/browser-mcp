/**
 * NonDomSurface XML Renderer
 *
 * Renders an active non-DOM surface as XML that is appended to normal state
 * responses so agents perceive the surface as part of the page state.
 *
 * Format (dialog):
 *   <non_dom kind="dialog" modal="true" dialog_type="alert" message="...">
 *     <ctrl eid="nd-dialog-ok" kind="button" label="OK" />
 *   </non_dom>
 *   <dom_blocked reason="dialog" />
 *
 * Format (file-picker):
 *   <non_dom kind="file-picker" modal="true" mode="selectSingle">
 *     <ctrl eid="nd-picker-path" kind="input" label="File path" placeholder="..." />
 *     <ctrl eid="nd-picker-choose" kind="button" label="Choose" />
 *     <ctrl eid="nd-picker-cancel" kind="button" label="Cancel" />
 *   </non_dom>
 *   <dom_blocked reason="file-picker" />
 *
 * Format (permission):
 *   <non_dom kind="permission" modal="true" permissions="camera,microphone" origin="https://example.com">
 *     <ctrl eid="nd-permission-allow" kind="button" label="Allow" />
 *     <ctrl eid="nd-permission-deny" kind="button" label="Block" />
 *   </non_dom>
 *   <dom_blocked reason="permission" />
 */

import { escapeXml } from '../lib/text-utils.js';
import type { NonDomSurface, NonDomControl } from './surface-store.js';

/**
 * Render a non-DOM surface to an XML string.
 * The string is appended after the closing </state> tag in the state response.
 */
export function renderNonDomSurface(surface: NonDomSurface): string {
  const lines: string[] = [];

  if (surface.kind === 'dialog') {
    const typeAttr = surface.dialogType ? ` dialog_type="${escapeXml(surface.dialogType)}"` : '';
    const msgAttr = surface.dialogMessage ? ` message="${escapeXml(surface.dialogMessage)}"` : '';
    lines.push(`<non_dom kind="dialog" modal="true"${typeAttr}${msgAttr}>`);
    for (const ctrl of surface.controls) {
      lines.push(`  ${renderControl(ctrl)}`);
    }
    lines.push('</non_dom>');
    lines.push('<dom_blocked reason="dialog" />');
  } else if (surface.kind === 'permission') {
    const permsAttr = surface.permissionTypes?.length
      ? ` permissions="${escapeXml(surface.permissionTypes.join(','))}"`
      : '';
    const originAttr = surface.permissionOrigin
      ? ` origin="${escapeXml(surface.permissionOrigin)}"`
      : '';
    lines.push(`<non_dom kind="permission" modal="true"${permsAttr}${originAttr}>`);
    for (const ctrl of surface.controls) {
      lines.push(`  ${renderControl(ctrl)}`);
    }
    lines.push('</non_dom>');
    lines.push('<dom_blocked reason="permission" />');
  } else {
    // file-picker
    const modeAttr = surface.pickerMode ? ` mode="${escapeXml(surface.pickerMode)}"` : '';
    lines.push(`<non_dom kind="file-picker" modal="true"${modeAttr}>`);
    for (const ctrl of surface.controls) {
      lines.push(`  ${renderControl(ctrl)}`);
    }
    lines.push('</non_dom>');
    lines.push('<dom_blocked reason="file-picker" />');
  }

  return lines.join('\n');
}

function renderControl(ctrl: NonDomControl): string {
  const attrs: string[] = [
    `eid="${escapeXml(ctrl.eid)}"`,
    `kind="${ctrl.kind}"`,
    `label="${escapeXml(ctrl.label)}"`,
  ];
  if (ctrl.value !== undefined && ctrl.value !== '') {
    attrs.push(`value="${escapeXml(ctrl.value)}"`);
  }
  if (ctrl.placeholder) {
    attrs.push(`placeholder="${escapeXml(ctrl.placeholder)}"`);
  }
  return `<ctrl ${attrs.join(' ')} />`;
}

/**
 * Build a get_element-style response for a synthetic non-DOM control.
 * Used by getNodeDetails when the requested eid starts with "nd-".
 */
export function renderNonDomControlDetails(eid: string, surface: NonDomSurface): string {
  const ctrl = surface.controls.find((c) => c.eid === eid);
  if (!ctrl) {
    return `<error>Non-DOM control "${escapeXml(eid)}" not found in active surface.</error>`;
  }

  // Build surfaceDesc as raw text — escapeXml is applied once when embedding in XML below.
  let surfaceDesc: string;
  if (surface.kind === 'dialog') {
    surfaceDesc = `JavaScript ${surface.dialogType ?? 'dialog'}: "${surface.dialogMessage ?? ''}"`;
  } else if (surface.kind === 'permission') {
    const perms = surface.permissionTypes?.join(', ') ?? '';
    surfaceDesc = `Permission request (${perms}) from ${surface.permissionOrigin ?? 'page'}`;
  } else {
    surfaceDesc = `File picker (${surface.pickerMode ?? 'selectSingle'})`;
  }

  const lines: string[] = [
    `<node eid="${escapeXml(eid)}" kind="${ctrl.kind}" region="non_dom" x="0" y="0" w="0" h="0" synthetic="true">`,
    `  ${escapeXml(ctrl.label)}`,
    `  <surface kind="${escapeXml(surface.kind)}">${escapeXml(surfaceDesc)}</surface>`,
    `  <hint>This is a synthetic non-DOM control. Use click to activate buttons; use type to fill inputs. The control lives on a blocking non-DOM surface — resolve it before interacting with page elements.</hint>`,
  ];

  if (ctrl.value !== undefined) {
    lines.push(`  <attrs value="${escapeXml(ctrl.value)}" />`);
  }
  if (ctrl.placeholder) {
    lines.push(`  <attrs placeholder="${escapeXml(ctrl.placeholder)}" />`);
  }

  lines.push('</node>');
  return lines.join('\n');
}
