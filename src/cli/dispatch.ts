import { VERSION } from '../shared/version.js';
import { runInstall, type InstallDeps } from '../install/index.js';
import { runDoctor } from '../install/doctor.js';

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
        '  install [flags]               Register MCP server and place skill\n' +
        '  doctor                        Show per-harness installation status\n' +
        '\n' +
        'Install flags:\n' +
        '  --harness <id|all|csv>        claude-code, cursor, vscode, claude-desktop, all\n' +
        '  --scope project|user          Config scope (default: project)\n' +
        '  --global                      Alias for --scope global\n' +
        '  --project                     Alias for --scope project\n' +
        '  --browser-mode <mode>         auto (default), user, persistent, isolated\n' +
        '  --headless                    Launch browser headless\n' +
        '  --cdp-url <url>               Connect to existing Chrome DevTools endpoint\n' +
        '  --pin <version>               Register exact version instead of @latest\n' +
        '  --dry-run                     Preview changes without writing files\n' +
        '  --yes, -y                     Skip interactive prompts\n' +
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

  if (verb === 'doctor') {
    await runDoctor();
    return { handled: true };
  }

  return { handled: false };
}
