import type { InstallScope } from './harness-adapter.js';
import { ClaudeCodeAdapter } from './harness/claude-code.js';
import { CursorAdapter } from './harness/cursor.js';
import { VSCodeAdapter } from './harness/vscode.js';
import { ClaudeDesktopAdapter } from './harness/claude-desktop.js';

export interface DoctorOpts {
  cwd?: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

function buildAdapters(opts: DoctorOpts) {
  return [
    new ClaudeCodeAdapter(),
    new CursorAdapter(),
    new VSCodeAdapter(),
    new ClaudeDesktopAdapter({ homeDir: opts.homeDir, platform: opts.platform }),
  ];
}

export async function runDoctor(opts: DoctorOpts = {}): Promise<void> {
  const { cwd = process.cwd(), homeDir, platform } = opts;
  const adapters = buildAdapters({ homeDir, platform });

  process.stdout.write('\n  agent-web-interface status\n\n');
  process.stdout.write('  Harness          MCP    Skill\n');
  process.stdout.write('  ───────────────  ─────  ─────\n');

  for (const adapter of adapters) {
    const label = adapter.label.padEnd(15);
    const scope: InstallScope = adapter.scopes.includes('global' as never) ? 'global' : 'project';

    const mcpStatus = await adapter.status({ scope, cwd, homeDir });
    const mcpIcon = mcpStatus.configured ? '✓' : '✗';

    if (!adapter.supportsSkill) {
      process.stdout.write(`  ${label}  ${mcpIcon}      MCP-only\n`);
    } else {
      process.stdout.write(`  ${label}  ${mcpIcon}\n`);
    }
  }

  process.stdout.write('\n');
}
