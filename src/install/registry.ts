import type { HarnessAdapter } from './harness-adapter.js';
import { ClaudeCodeAdapter } from './harness/claude-code.js';
import { CursorAdapter } from './harness/cursor.js';
import { VSCodeAdapter } from './harness/vscode.js';
import { ClaudeDesktopAdapter } from './harness/claude-desktop.js';

export const ALL_ADAPTERS: readonly HarnessAdapter[] = [
  new ClaudeCodeAdapter(),
  new CursorAdapter(),
  new VSCodeAdapter(),
  new ClaudeDesktopAdapter(),
];

export function getAdapter(id: string): HarnessAdapter | undefined {
  return ALL_ADAPTERS.find((a) => a.id === id);
}

export async function detectAdapters(): Promise<HarnessAdapter[]> {
  const results = await Promise.allSettled(ALL_ADAPTERS.map((a) => a.detect()));
  return ALL_ADAPTERS.filter((_, i) => {
    const r = results[i];
    return r.status === 'fulfilled' && r.value;
  });
}
