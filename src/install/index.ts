import { ClaudeCodeAdapter, type CommandRunner } from './harness/claude-code.js';
import { CursorAdapter } from './harness/cursor.js';
import { VSCodeAdapter } from './harness/vscode.js';
import { ClaudeDesktopAdapter } from './harness/claude-desktop.js';

export type { CommandRunner };

export interface InstallDeps {
  claudeCodeRunner?: CommandRunner;
}

const SUPPORTED_HARNESSES = ['claude-code', 'cursor', 'vscode', 'claude-desktop'] as const;
type SupportedHarness = (typeof SUPPORTED_HARNESSES)[number];

function parseHarness(argv: string[]): SupportedHarness | undefined {
  const idx = argv.indexOf('--harness');
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  if (SUPPORTED_HARNESSES.includes(value as SupportedHarness)) {
    return value as SupportedHarness;
  }
  return undefined;
}

export async function runInstall(argv: string[], deps?: InstallDeps): Promise<void> {
  const harness = parseHarness(argv);
  const dryRun = argv.includes('--dry-run');

  if (!harness) {
    process.stderr.write(
      'Usage: agent-web-interface install --harness <harness>\n' +
        `Supported harnesses: ${SUPPORTED_HARNESSES.join(', ')}\n`
    );
    process.exit(1);
    return;
  }

  try {
    let message: string;
    switch (harness) {
      case 'claude-code': {
        const adapter = new ClaudeCodeAdapter({ runner: deps?.claudeCodeRunner });
        const result = await adapter.apply({ scope: 'project', dryRun });
        message = result.message;
        break;
      }
      case 'cursor': {
        const adapter = new CursorAdapter();
        const result = await adapter.apply({ scope: 'project', dryRun });
        message = result.message;
        break;
      }
      case 'vscode': {
        const adapter = new VSCodeAdapter();
        const result = await adapter.apply({ scope: 'project', dryRun });
        message = result.message;
        break;
      }
      case 'claude-desktop': {
        const adapter = new ClaudeDesktopAdapter();
        const result = await adapter.apply({ scope: 'global', dryRun });
        message = result.message;
        break;
      }
    }
    process.stderr.write(message + '\n');
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
  }
}
