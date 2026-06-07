import { describe, it, expect, vi } from 'vitest';
import { dispatch } from '../../../src/cli/dispatch.js';

describe('dispatch', () => {
  it('returns handled=false for empty argv (server path)', async () => {
    const result = await dispatch([]);
    expect(result.handled).toBe(false);
  });

  it('returns handled=false for unknown verb', async () => {
    const result = await dispatch(['unknown-verb']);
    expect(result.handled).toBe(false);
  });

  it('returns handled=false for server flags', async () => {
    const result = await dispatch(['--transport', 'stdio']);
    expect(result.handled).toBe(false);
  });

  it('handles install verb by calling runInstall', async () => {
    const runInstallFn = vi.fn().mockResolvedValue(undefined);
    const result = await dispatch(['install', '--harness', 'claude-code'], {
      runInstall: runInstallFn as (argv: string[]) => Promise<void>,
    });
    expect(result.handled).toBe(true);
    expect(runInstallFn).toHaveBeenCalledWith(['install', '--harness', 'claude-code']);
  });

  it('handles --version flag', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const result = await dispatch(['--version']);
    expect(result.handled).toBe(true);
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('handles --help flag', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const result = await dispatch(['--help']);
    expect(result.handled).toBe(true);
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('does not write to stdout on server path', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await dispatch([]);
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it('does not write to stdout for server flags', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await dispatch(['--transport', 'stdio']);
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });
});
