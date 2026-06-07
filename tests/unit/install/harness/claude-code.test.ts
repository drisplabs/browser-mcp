import { describe, it, expect, vi } from 'vitest';
import {
  runClaudeCodeInstall,
  type CommandRunner,
} from '../../../../src/install/harness/claude-code.js';

describe('runClaudeCodeInstall', () => {
  it('invokes claude mcp add with the correct argv', async () => {
    const calls: [string, string[]][] = [];
    const runner: CommandRunner = (cmd, args) => {
      calls.push([cmd, args]);
      return Promise.resolve(0);
    };
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await runClaudeCodeInstall({ runner });

    expect(calls).toHaveLength(1);
    const [cmd, args] = calls[0];
    expect(cmd).toBe('claude');
    expect(args).toEqual([
      'mcp',
      'add',
      'agent-web-interface',
      'npx',
      '-y',
      'agent-web-interface@latest',
    ]);
    stderrSpy.mockRestore();
  });

  it('exits non-zero with actionable message when claude is not found (ENOENT)', async () => {
    const runner: CommandRunner = () => {
      const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      return Promise.reject(err);
    };
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never);
    const stderrChunks: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
        return true;
      });

    await runClaudeCodeInstall({ runner });

    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderrOutput = stderrChunks.join('');
    expect(stderrOutput).toMatch(/claude/i);
    expect(stderrOutput).toMatch(/not found|not installed|install/i);
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('exits non-zero when claude CLI returns non-zero exit code', async () => {
    const runner: CommandRunner = () => Promise.resolve(2);
    const exitSpy = vi.spyOn(process, 'exit').mockReturnValue(undefined as never);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await runClaudeCodeInstall({ runner });

    expect(exitSpy).toHaveBeenCalledWith(2);
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('does not write to stdout', async () => {
    const runner: CommandRunner = () => Promise.resolve(0);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await runClaudeCodeInstall({ runner });

    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
