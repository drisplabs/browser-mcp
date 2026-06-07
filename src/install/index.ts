import { runClaudeCodeInstall, type CommandRunner } from './harness/claude-code.js';

export type { CommandRunner };

export interface InstallDeps {
  claudeCodeRunner?: CommandRunner;
}

const SUPPORTED_HARNESSES = ['claude-code'] as const;
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

  if (!harness) {
    process.stderr.write(
      'Usage: agent-web-interface install --harness <harness>\n' +
        `Supported harnesses: ${SUPPORTED_HARNESSES.join(', ')}\n`
    );
    process.exit(1);
    return;
  }

  switch (harness) {
    case 'claude-code':
      await runClaudeCodeInstall({ runner: deps?.claudeCodeRunner });
      break;
  }
}
