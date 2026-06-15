/**
 * Download Tool
 *
 * Configure download behavior and directory for the session.
 */

import { DownloadManager } from '../non-dom/download-manager.js';
import { SetDownloadBehaviorInputSchema } from './tool-schemas.js';
import { prepareActionContext } from './action-context.js';
import type { ToolContext } from './tool-context.types.js';
import type { SetDownloadBehaviorOutput } from './tool-schemas.js';

/** Per-page download managers keyed by page object reference */
const downloadManagers = new WeakMap<object, DownloadManager>();

/**
 * Configure download routing for the current browser session.
 *
 * Downloads will be saved to the specified directory and tracked
 * so subsequent actions can observe what was downloaded.
 */
export async function setDownloadBehavior(
  rawInput: unknown,
  ctx: ToolContext
): Promise<SetDownloadBehaviorOutput> {
  const input = SetDownloadBehaviorInputSchema.parse(rawInput);
  const { handleRef } = await prepareActionContext(input.page_id, ctx);

  const manager = new DownloadManager(input.download_path);
  await manager.attach(handleRef.current.cdp);
  downloadManagers.set(handleRef.current.page, manager);

  return (
    `<result><status>ok</status>` +
    `<download_path>${escapeXml(input.download_path)}</download_path>` +
    `<message>Downloads will be saved to ${escapeXml(input.download_path)}</message></result>`
  );
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
