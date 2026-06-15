/**
 * Permission Tool
 *
 * Grant or deny browser permissions for the active origin.
 */

import { setPermissions } from '../non-dom/permission-manager.js';
import { GrantPermissionInputSchema } from './tool-schemas.js';
import { prepareActionContext } from './action-context.js';
import { executeAction } from './execute-action.js';
import type { ToolContext } from './tool-context.types.js';
import type { GrantPermissionOutput } from './tool-schemas.js';
import type { BrowserPermission } from '../non-dom/permission-manager.js';

/**
 * Grant or deny browser permissions for the active origin.
 */
export async function grantPermission(
  rawInput: unknown,
  ctx: ToolContext
): Promise<GrantPermissionOutput> {
  const input = GrantPermissionInputSchema.parse(rawInput);
  const { handleRef, pageId, captureSnapshot } = await prepareActionContext(input.page_id, ctx);

  // Determine origin: use supplied or derive from current page URL
  const origin = input.origin ?? new URL(handleRef.current.page.url()).origin;

  const result = await executeAction(
    handleRef.current,
    async () => {
      await setPermissions(
        handleRef.current.cdp,
        input.permissions as BrowserPermission[],
        origin,
        input.granted
      );
    },
    ctx,
    captureSnapshot
  );

  ctx.getSnapshotStore().store(pageId, result.snapshot);
  return result.state_response;
}
