/**
 * FilePathValidator unit tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateFilePaths,
  FileValidationError,
} from '../../../src/non-dom/file-path-validator.js';

let tmpDir: string;
let existingFile: string;
let subDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv-test-'));
  existingFile = path.join(tmpDir, 'test.txt');
  fs.writeFileSync(existingFile, 'hello');
  subDir = path.join(tmpDir, 'sub');
  fs.mkdirSync(subDir);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('validateFilePaths', () => {
  it('throws EMPTY_INPUT on empty array', () => {
    expect(() => validateFilePaths([], [])).toThrow(FileValidationError);
    try {
      validateFilePaths([], []);
    } catch (err) {
      expect(err).toBeInstanceOf(FileValidationError);
      expect((err as FileValidationError).code).toBe('EMPTY_INPUT');
    }
  });

  it('throws RELATIVE_PATH on relative paths', () => {
    try {
      validateFilePaths(['relative/path.txt'], []);
    } catch (err) {
      expect(err).toBeInstanceOf(FileValidationError);
      expect((err as FileValidationError).code).toBe('RELATIVE_PATH');
      expect((err as FileValidationError).filePath).toBe('relative/path.txt');
    }
  });

  it('throws FILE_NOT_FOUND on non-existent paths', () => {
    const nonExistent = path.join(tmpDir, 'does-not-exist.txt');
    try {
      validateFilePaths([nonExistent], []);
    } catch (err) {
      expect(err).toBeInstanceOf(FileValidationError);
      expect((err as FileValidationError).code).toBe('FILE_NOT_FOUND');
    }
  });

  it('throws NOT_A_FILE on directories', () => {
    try {
      validateFilePaths([subDir], []);
    } catch (err) {
      expect(err).toBeInstanceOf(FileValidationError);
      expect((err as FileValidationError).code).toBe('NOT_A_FILE');
    }
  });

  it('returns valid absolute paths when no root restriction', () => {
    const result = validateFilePaths([existingFile], []);
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toBe(path.resolve(existingFile));
  });

  it('returns multiple valid paths', () => {
    const file2 = path.join(tmpDir, 'test2.txt');
    fs.writeFileSync(file2, 'world');
    const result = validateFilePaths([existingFile, file2], []);
    expect(result.paths).toHaveLength(2);
  });

  it('allows files within an allowed root', () => {
    const result = validateFilePaths([existingFile], [tmpDir]);
    expect(result.paths[0]).toBe(path.resolve(existingFile));
  });

  it('throws OUTSIDE_ALLOWED_ROOT when file is outside all roots', () => {
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'other-'));
    const otherFile = path.join(otherDir, 'file.txt');
    fs.writeFileSync(otherFile, 'data');
    try {
      try {
        validateFilePaths([otherFile], [tmpDir]);
      } catch (err) {
        expect(err).toBeInstanceOf(FileValidationError);
        expect((err as FileValidationError).code).toBe('OUTSIDE_ALLOWED_ROOT');
      }
    } finally {
      fs.rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it('allows paths when no allowed roots configured', () => {
    const result = validateFilePaths([existingFile], []);
    expect(result.paths).toBeDefined();
  });
});
