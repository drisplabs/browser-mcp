/**
 * FilePathValidator
 *
 * Pure validator for file paths used by the upload tool.
 * No CDP, no I/O beyond fs.stat.
 */

import fs from 'node:fs';
import path from 'node:path';

export type FileValidationErrorCode =
  | 'EMPTY_INPUT'
  | 'NON_STRING_PATH'
  | 'RELATIVE_PATH'
  | 'FILE_NOT_FOUND'
  | 'NOT_A_FILE'
  | 'OUTSIDE_ALLOWED_ROOT';

export class FileValidationError extends Error {
  readonly code: FileValidationErrorCode;
  readonly filePath?: string;

  constructor(code: FileValidationErrorCode, message: string, filePath?: string) {
    super(message);
    this.name = 'FileValidationError';
    this.code = code;
    this.filePath = filePath;
  }
}

export interface ValidatedPaths {
  paths: string[];
}

/**
 * Validate file paths for upload.
 *
 * - Rejects empty arrays
 * - Rejects non-string entries
 * - Rejects relative paths (paths must be absolute on the browser host)
 * - Rejects paths that do not exist or are not regular files
 * - Enforces allowed roots (if any configured)
 *
 * @param rawPaths - Raw path strings from the agent
 * @param allowedRoots - If non-empty, each path must be under one of these roots
 * @returns Validated absolute paths
 * @throws FileValidationError on the first invalid path
 */
export function validateFilePaths(rawPaths: string[], allowedRoots: string[]): ValidatedPaths {
  if (rawPaths.length === 0) {
    throw new FileValidationError('EMPTY_INPUT', 'At least one file path is required.');
  }

  const validated: string[] = [];

  for (const raw of rawPaths) {
    if (typeof raw !== 'string') {
      throw new FileValidationError(
        'NON_STRING_PATH',
        `Expected a string path, got ${typeof raw}.`
      );
    }

    if (!path.isAbsolute(raw)) {
      throw new FileValidationError(
        'RELATIVE_PATH',
        `Path must be absolute on the browser host: "${raw}". ` +
          'Files must exist on the host where Chrome runs. ' +
          'Stage files into an allowed root on the browser host before uploading.',
        raw
      );
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(raw);
    } catch {
      throw new FileValidationError(
        'FILE_NOT_FOUND',
        `File not found: "${raw}". ` +
          'If Chrome runs in a remote container, the path must resolve inside that container.',
        raw
      );
    }

    if (!stat.isFile()) {
      throw new FileValidationError(
        'NOT_A_FILE',
        `Path is not a regular file: "${raw}". Directories and special files are not accepted.`,
        raw
      );
    }

    if (allowedRoots.length > 0) {
      // Use realpathSync to dereference symlinks before checking roots — path.resolve alone
      // does not follow symlinks, so a symlink inside an allowed root pointing outside it
      // would bypass the guard.
      let realPath: string;
      try {
        realPath = fs.realpathSync(raw);
      } catch {
        realPath = path.resolve(raw);
      }
      const allowed = allowedRoots.some((root) => {
        let resolvedRoot: string;
        try {
          resolvedRoot = fs.realpathSync(root);
        } catch {
          resolvedRoot = path.resolve(root);
        }
        return realPath.startsWith(resolvedRoot + path.sep) || realPath === resolvedRoot;
      });
      if (!allowed) {
        throw new FileValidationError(
          'OUTSIDE_ALLOWED_ROOT',
          `File "${raw}" is outside the configured allowed roots: [${allowedRoots.join(', ')}]. ` +
            'Stage the file into an allowed root before uploading.',
          raw
        );
      }
    }

    validated.push(path.resolve(raw));
  }

  return { paths: validated };
}
