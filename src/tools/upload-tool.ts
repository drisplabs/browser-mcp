/**
 * Upload Tool
 *
 * Sets files on a (possibly indirectly targeted) file input via CDP.
 * Never opens the native OS file picker.
 */

import { validateFilePaths, FileValidationError } from '../non-dom/file-path-validator.js';
import { resolveAndUploadFiles, FileInputNotFoundError } from '../non-dom/file-input-resolver.js';
import { getOrCreateDialogManager } from '../non-dom/dialog-manager.js';
import { UploadInputSchema } from './tool-schemas.js';
import { prepareActionContext } from './action-context.js';
import { executeAction } from './execute-action.js';
import type { ToolContext } from './tool-context.types.js';
import type { UploadOutput } from './tool-schemas.js';

/** Configured allowed roots for file uploads. Empty = no restriction. */
const ALLOWED_ROOTS: string[] = process.env.UPLOAD_ALLOWED_ROOTS
  ? process.env.UPLOAD_ALLOWED_ROOTS.split(':').filter(Boolean)
  : [];

/**
 * Upload one or more files to a file input.
 *
 * Validates paths, resolves the real <input type="file">, sets files via CDP,
 * and dispatches input/change events for framework compatibility.
 */
export async function upload(rawInput: unknown, ctx: ToolContext): Promise<UploadOutput> {
  const input = UploadInputSchema.parse(rawInput);
  const { handleRef, pageId, captureSnapshot } = await prepareActionContext(input.page_id, ctx);

  // Validate file paths (pure, no CDP)
  let validatedPaths: string[];
  try {
    const result = validateFilePaths(input.files, ALLOWED_ROOTS);
    validatedPaths = result.paths;
  } catch (err) {
    if (err instanceof FileValidationError) {
      throw new Error(`Upload validation failed: ${err.message}`);
    }
    throw err;
  }

  // Resolve the target element
  const snap = ctx.requireSnapshot(pageId);
  const node = ctx.resolveElementByEid(pageId, input.eid, snap);

  // Check multiple-file constraint: only allow multiple files when the node explicitly
  // has the 'multiple' attribute. Absence of the node in snapshot is treated as single-file.
  const snapNode = snap.nodes.find((n) => n.node_id === node.node_id);
  const allowsMultiple =
    snapNode !== undefined &&
    (snapNode.attributes as Record<string, unknown> | undefined)?.multiple !== undefined;

  if (!allowsMultiple && validatedPaths.length > 1) {
    throw new Error(
      `This file input does not allow multiple files (it lacks the 'multiple' attribute). ` +
        `Provide exactly one file path.`
    );
  }

  // Execute the upload as an action (captures snapshot + state_response)
  const result = await executeAction(
    handleRef.current,
    async () => {
      try {
        await resolveAndUploadFiles(handleRef.current.cdp, node.backend_node_id, validatedPaths);
      } catch (err) {
        if (err instanceof FileInputNotFoundError) {
          throw new Error(
            `${err.message}\n\n` +
              'Tip: Use the snapshot or get_element to verify the element is a file input ' +
              'or contains one. If the upload button opens a picker, target the hidden ' +
              '<input type="file"> directly or its container.'
          );
        }
        throw err;
      }
    },
    ctx,
    captureSnapshot
  );

  ctx.getSnapshotStore().store(pageId, result.snapshot);

  // Append pending dialog info if any
  const dialogManager = getOrCreateDialogManager(handleRef.current.page);
  const pending = dialogManager.getPendingDialog();

  if (pending) {
    return `${result.state_response}\n<pending_dialog type="${pending.type}" message="${escapeXml(pending.message)}" />`;
  }

  return result.state_response;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
