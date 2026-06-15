/**
 * Dialog Tool
 *
 * Resolves a pending JavaScript dialog (alert/confirm/prompt/beforeunload).
 * After resolving, captures a fresh snapshot and returns the page state.
 */

import { getOrCreateDialogManager } from '../non-dom/dialog-manager.js';
import { clearSurface } from '../non-dom/surface-store.js';
import { HandleDialogInputSchema } from './tool-schemas.js';
import { prepareActionContext } from './action-context.js';
import { executeAction } from './execute-action.js';
import type { ToolContext } from './tool-context.types.js';
import type { HandleDialogOutput } from './tool-schemas.js';

/**
 * Accept or dismiss a pending JavaScript dialog.
 */
export async function handleDialog(
  rawInput: unknown,
  ctx: ToolContext
): Promise<HandleDialogOutput> {
  const input = HandleDialogInputSchema.parse(rawInput);
  const { handleRef, pageId, captureSnapshot } = await prepareActionContext(input.page_id, ctx);

  const dialogManager = getOrCreateDialogManager(handleRef.current.page);
  await dialogManager.attach(handleRef.current.cdp);
  const pending = dialogManager.getPendingDialog();

  if (!pending) {
    throw new Error(
      'No pending JavaScript dialog. ' +
        'Check the current page state — a dialog may have already been auto-dismissed ' +
        'or may not have appeared yet.'
    );
  }

  const result = await executeAction(
    handleRef.current,
    async () => {
      await dialogManager.resolveDialog(input.action, input.prompt_text);
      // Clear any active non-DOM surface so the next snapshot doesn't echo a stale dialog block.
      clearSurface(handleRef.current.page);
    },
    ctx,
    captureSnapshot
  );

  ctx.getSnapshotStore().store(pageId, result.snapshot);
  return result.state_response;
}
