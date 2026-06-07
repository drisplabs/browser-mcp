import type { InstallScope, ServerCommand } from './harness-adapter.js';

export type BrowserMode = 'auto' | 'user' | 'persistent' | 'isolated';

export interface ParsedInstallFlags {
  harnesses: string[];
  scope: InstallScope;
  dryRun: boolean;
  yes: boolean;
  pin?: string;
  browserMode: BrowserMode;
  headless: boolean;
  cdpUrl?: string;
}

const ALL_HARNESSES = ['claude-code', 'cursor', 'vscode', 'claude-desktop'];

function parseBrowserMode(value: string): BrowserMode {
  if (['auto', 'user', 'persistent', 'isolated'].includes(value)) {
    return value as BrowserMode;
  }
  return 'auto';
}

export function parseInstallFlags(argv: string[]): ParsedInstallFlags {
  const flags: ParsedInstallFlags = {
    harnesses: [],
    scope: 'project',
    dryRun: false,
    yes: false,
    browserMode: 'auto',
    headless: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--harness': {
        const val = argv[++i] ?? '';
        flags.harnesses = val === 'all' ? ALL_HARNESSES : val.split(',').filter(Boolean);
        break;
      }
      case '--scope': {
        const val = argv[++i] ?? 'project';
        if (val === 'user' || val === 'global') {
          flags.scope = val as InstallScope;
        } else {
          flags.scope = 'project';
        }
        break;
      }
      case '--global':
        flags.scope = 'global';
        break;
      case '--project':
        flags.scope = 'project';
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--yes':
      case '-y':
        flags.yes = true;
        break;
      case '--pin':
        flags.pin = argv[++i];
        break;
      case '--browser-mode': {
        const val = argv[++i] ?? 'auto';
        flags.browserMode = parseBrowserMode(val);
        break;
      }
      case '--headless':
        flags.headless = true;
        break;
      case '--cdp-url':
        flags.cdpUrl = argv[++i];
        break;
    }
  }

  return flags;
}

export function buildServerCommand(flags: ParsedInstallFlags): ServerCommand {
  const packageSpec = flags.pin ? `agent-web-interface@${flags.pin}` : 'agent-web-interface@latest';
  const args = ['-y', packageSpec];

  if (flags.browserMode !== 'auto') {
    args.push('--mode', flags.browserMode);
  }
  if (flags.headless) {
    args.push('--headless');
  }
  if (flags.cdpUrl) {
    args.push('--cdp-url', flags.cdpUrl);
  }

  return { command: 'npx', args };
}
