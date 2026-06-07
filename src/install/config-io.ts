import { readFile, writeFile, rename, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface MergeResult {
  merged: Record<string, unknown>;
  changed: boolean;
}

export interface WriteResult {
  changed: boolean;
  dryRun: boolean;
}

export async function readJsonConfig(path: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function mergeAtPath(
  existing: Record<string, unknown>,
  keyPath: string[],
  value: unknown
): MergeResult {
  const [head, ...tail] = keyPath;
  if (!head) return { merged: existing, changed: false };

  if (tail.length === 0) {
    const existingStr = JSON.stringify(existing[head]);
    const valueStr = JSON.stringify(value);
    if (existingStr === valueStr) {
      return { merged: existing, changed: false };
    }
    return { merged: { ...existing, [head]: value }, changed: true };
  }

  const existingChild = (existing[head] ?? {}) as Record<string, unknown>;
  const { merged: mergedChild, changed } = mergeAtPath(existingChild, tail, value);
  if (!changed) return { merged: existing, changed: false };

  return { merged: { ...existing, [head]: mergedChild }, changed: true };
}

export async function writeJsonAtomic(
  path: string,
  data: Record<string, unknown>,
  opts?: { dryRun?: boolean }
): Promise<WriteResult> {
  if (opts?.dryRun) {
    return { changed: true, dryRun: true };
  }

  const content = JSON.stringify(data, null, 2) + '\n';

  // Backup pre-existing file
  try {
    await stat(path);
    await copyFile(path, path + '.bak');
  } catch {
    // File does not exist — no backup needed
  }

  // Atomic write: temp file → rename
  const dir = dirname(path);
  const tmp = join(
    dir,
    `.awi-tmp-${Date.now()}-${Math.floor(Math.random() * 0xffffff).toString(16)}`
  );
  await writeFile(tmp, content, 'utf-8');
  await rename(tmp, path);

  return { changed: true, dryRun: false };
}
