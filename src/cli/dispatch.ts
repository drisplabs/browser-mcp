import { VERSION } from '../shared/version.js';
import { runInstall, type InstallDeps } from '../install/index.js';

export interface DispatchDeps extends InstallDeps {
  runInstall?: (argv: string[]) => Promise<void>;
}

export interface DispatchResult {
  handled: boolean;
}

export async function dispatch(argv: string[], deps?: DispatchDeps): Promise<DispatchResult> {
  const verb = argv[0];

  if (verb === '--version') {
    process.stderr.write(`${VERSION}\n`);
    process.exit(0);
    return { handled: true };
  }

  if (verb === '--help') {
    process.stderr.write(
      'Usage: agent-web-interface [command]\n\n' +
        'Commands:\n' +
        '  install --harness <harness>   Register MCP server and place skill\n' +
        '\n' +
        'Supported harnesses: claude-code\n' +
        '\n' +
        'Server mode (default, no command):\n' +
        '  --transport stdio|http        Transport mode (default: stdio)\n' +
        '  --port <n>                    HTTP port (default: 3000)\n'
    );
    process.exit(0);
    return { handled: true };
  }

  if (verb === 'install') {
    const installFn = deps?.runInstall ?? ((a: string[]) => runInstall(a, deps));
    await installFn(argv);
    return { handled: true };
  }

  return { handled: false };
}
