import { spawn } from 'node:child_process';

export type CommandRunner = (cmd: string, args: string[]) => Promise<number>;

export interface ClaudeCodeInstallDeps {
  runner?: CommandRunner;
}

const SERVER_NAME = 'agent-web-interface';
const CLAUDE_MCP_ADD_ARGS = ['mcp', 'add', SERVER_NAME, 'npx', '-y', 'agent-web-interface@latest'];

function makeDefaultRunner(): CommandRunner {
  return (cmd, args) =>
    new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: 'inherit' });
      child.on('close', (code) => resolve(code ?? 0));
      child.on('error', reject);
    });
}

function isNotFound(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException;
  return e.code === 'ENOENT' || /ENOENT|not found|command not found/i.test(e.message ?? '');
}

export async function runClaudeCodeInstall(deps?: ClaudeCodeInstallDeps): Promise<void> {
  const run = deps?.runner ?? makeDefaultRunner();

  try {
    const exitCode = await run('claude', CLAUDE_MCP_ADD_ARGS);
    if (exitCode !== 0) {
      process.stderr.write(`claude mcp add exited with code ${exitCode}\n`);
      process.exit(exitCode);
      return;
    }
    process.stderr.write(`✓ agent-web-interface registered in Claude Code\n`);
  } catch (err) {
    if (isNotFound(err)) {
      process.stderr.write(
        'Error: The `claude` CLI was not found on PATH.\n' +
          'Install Claude Code from https://claude.ai/code, then re-run:\n' +
          '  agent-web-interface install --harness claude-code\n' +
          'Alternatively, use the .mcp.json fallback (available in a future update).\n'
      );
    } else {
      const msg = (err as Error).message ?? String(err);
      process.stderr.write(`Error registering with Claude Code: ${msg}\n`);
    }
    process.exit(1);
  }
}
