/**
 * FileInputResolver
 *
 * Resolves a targeted element to its real <input type="file"> and sets files
 * via CDP DOM.setFileInputFiles, then dispatches input/change events.
 */

import type { CdpClient } from '../cdp/cdp-client.interface.js';

export class FileInputNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileInputNotFoundError';
  }
}

export interface FileInputTarget {
  backendNodeId: number;
  objectId: string;
  allowsMultiple: boolean;
}

const FIND_FILE_INPUT_FUNCTION = `function() {
  const el = this.nodeType === 3 ? this.parentElement : this;
  if (!el) return null;

  if (el.matches && el.matches('input[type="file"]')) return el;

  if (el.querySelector) {
    const input = el.querySelector('input[type="file"]');
    if (input) return input;
  }

  if (el.tagName === 'LABEL' && el.htmlFor) {
    const target = el.ownerDocument.getElementById(el.htmlFor);
    if (target && target.matches('input[type="file"]')) return target;
  }

  const enclosingLabel = el.closest ? el.closest('label') : null;
  if (enclosingLabel) {
    if (enclosingLabel.htmlFor) {
      const target = enclosingLabel.ownerDocument.getElementById(enclosingLabel.htmlFor);
      if (target && target.matches('input[type="file"]')) return target;
    }
    const nested = enclosingLabel.querySelector('input[type="file"]');
    if (nested) return nested;
  }

  const parent = el.parentElement;
  if (parent) {
    const siblingInputs = Array.from(parent.querySelectorAll('input[type="file"]'));
    if (siblingInputs.length === 1) return siblingInputs[0];
  }

  return null;
}`;

function hasBooleanAttribute(attributes: string[] | undefined, name: string): boolean {
  if (!attributes) return false;
  for (let i = 0; i < attributes.length; i += 2) {
    if (attributes[i] === name) return true;
  }
  return false;
}

/**
 * Resolve a targeted element to its real file input.
 */
export async function resolveFileInputTarget(
  cdp: CdpClient,
  backendNodeId: number
): Promise<FileInputTarget> {
  const { object } = await cdp.send('DOM.resolveNode', { backendNodeId });
  const objectId = object.objectId;

  if (!objectId) {
    throw new FileInputNotFoundError('Could not resolve target element to a JavaScript object.');
  }

  const findResult = await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: FIND_FILE_INPUT_FUNCTION,
    returnByValue: false,
  });

  if (
    findResult.result.type === 'undefined' ||
    findResult.result.subtype === 'null' ||
    !findResult.result.objectId
  ) {
    throw new FileInputNotFoundError(
      'No file input found at or within the targeted element. ' +
        'Target a file input directly, a label associated with one, ' +
        'or a container that holds a hidden file input.'
    );
  }

  const { node } = await cdp.send('DOM.describeNode', { objectId: findResult.result.objectId });
  const fileInputBackendNodeId = node.backendNodeId;

  if (!fileInputBackendNodeId) {
    throw new FileInputNotFoundError(
      'Could not obtain backend node ID for the resolved file input.'
    );
  }

  return {
    backendNodeId: fileInputBackendNodeId,
    objectId: findResult.result.objectId,
    allowsMultiple: hasBooleanAttribute(node.attributes, 'multiple'),
  };
}

/**
 * Resolve a targeted element to the backend node ID of its real file input.
 */
export async function resolveFileInputBackendNodeId(
  cdp: CdpClient,
  backendNodeId: number
): Promise<number> {
  return (await resolveFileInputTarget(cdp, backendNodeId)).backendNodeId;
}

/**
 * Upload files to the file input associated with the given backend node.
 *
 * Resolution strategy (in order):
 * 1. The node itself is input[type=file]
 * 2. A descendant input[type=file] is found
 * 3. If the node is a <label for="...">, resolve its associated input
 *
 * After setting files, dispatches bubbling input + change events so that
 * React/Vue/Angular frameworks register the upload.
 *
 * @throws FileInputNotFoundError when no reachable file input is found
 */
export async function resolveAndUploadFiles(
  cdp: CdpClient,
  backendNodeId: number,
  absoluteFiles: string[]
): Promise<void> {
  const fileInput = await resolveFileInputTarget(cdp, backendNodeId);

  // Step 4: Set files via CDP (works headless/headed, local/CI)
  await cdp.send('DOM.setFileInputFiles', {
    backendNodeId: fileInput.backendNodeId,
    files: absoluteFiles,
  });

  // Step 5: Dispatch bubbling input + change events so frameworks register the upload
  await cdp.send('Runtime.callFunctionOn', {
    objectId: fileInput.objectId,
    functionDeclaration: `function() {
      this.dispatchEvent(new Event('input', { bubbles: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
    returnByValue: true,
  });
}
