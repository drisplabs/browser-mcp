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
  // Step 1: Resolve the targeted node to a JS object
  const { object } = await cdp.send('DOM.resolveNode', { backendNodeId });
  const objectId = object.objectId;

  if (!objectId) {
    throw new FileInputNotFoundError('Could not resolve target element to a JavaScript object.');
  }

  // Step 2: Find the real file input (self, descendant, or label target)
  const findResult = await cdp.send('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      // Self check
      if (this.matches && this.matches('input[type="file"]')) return this;
      // Descendant check
      if (this.querySelector) {
        const input = this.querySelector('input[type="file"]');
        if (input) return input;
      }
      // Label[for] check
      if (this.tagName === 'LABEL' && this.htmlFor) {
        const target = document.getElementById(this.htmlFor);
        if (target && target.matches('input[type="file"]')) return target;
      }
      return null;
    }`,
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

  const fileInputObjectId = findResult.result.objectId;

  // Step 3: Get the backend node ID of the resolved file input
  const { node } = await cdp.send('DOM.describeNode', { objectId: fileInputObjectId });

  const fileInputBackendNodeId = node.backendNodeId;
  if (!fileInputBackendNodeId) {
    throw new FileInputNotFoundError(
      'Could not obtain backend node ID for the resolved file input.'
    );
  }

  // Step 4: Set files via CDP (works headless/headed, local/CI)
  await cdp.send('DOM.setFileInputFiles', {
    backendNodeId: fileInputBackendNodeId,
    files: absoluteFiles,
  });

  // Step 5: Dispatch bubbling input + change events so frameworks register the upload
  await cdp.send('Runtime.callFunctionOn', {
    objectId: fileInputObjectId,
    functionDeclaration: `function() {
      this.dispatchEvent(new Event('input', { bubbles: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
    returnByValue: true,
  });
}
