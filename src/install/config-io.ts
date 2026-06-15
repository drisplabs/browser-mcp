import { readFile, writeFile, rename, copyFile, stat, mkdir } from 'node:fs/promises';
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

export async function writeFileAtomic(
  path: string,
  content: string,
  opts?: { dryRun?: boolean }
): Promise<WriteResult> {
  if (opts?.dryRun) {
    return { changed: true, dryRun: true };
  }

  const dir = dirname(path);
  await mkdir(dir, { recursive: true });

  let hasExistingFile = false;
  try {
    const existing = await readFile(path, 'utf-8');
    if (existing === content) {
      return { changed: false, dryRun: false };
    }
    hasExistingFile = true;
  } catch {
    // File does not exist or cannot be read — proceed with the atomic write.
  }

  // Backup pre-existing file
  if (hasExistingFile) {
    try {
      await stat(path);
      await copyFile(path, path + '.bak');
    } catch {
      // File disappeared between read and backup — no backup needed.
    }
  }

  // Atomic write: temp file → rename
  const tmp = join(
    dir,
    `.awi-tmp-${Date.now()}-${Math.floor(Math.random() * 0xffffff).toString(16)}`
  );
  await writeFile(tmp, content, 'utf-8');
  await rename(tmp, path);

  return { changed: true, dryRun: false };
}

export async function writeJsonAtomic(
  path: string,
  data: Record<string, unknown>,
  opts?: { dryRun?: boolean }
): Promise<WriteResult> {
  return writeFileAtomic(path, JSON.stringify(data, null, 2) + '\n', opts);
}
