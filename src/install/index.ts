import type { HarnessAdapter, ApplyResult } from './harness-adapter.js';
import type { CommandRunner } from './harness/claude-code.js';
import { parseInstallFlags, buildServerCommand } from './flags.js';
import { ALL_ADAPTERS, detectAdapters, getAdapter } from './registry.js';

export type { CommandRunner };

export interface InstallDeps {
  claudeCodeRunner?: CommandRunner;
  isTTY?: boolean;
  cwd?: string;
  homeDir?: string;
}

interface HarnessResult {
  adapter: HarnessAdapter;
  result?: ApplyResult;
  error?: string;
}

function printSummaryTable(results: HarnessResult[]): void {
  process.stderr.write('\n');
  process.stderr.write('  Harness          Status\n');
  process.stderr.write('  ───────────────  ─────────────────────────────────────────\n');
  for (const { adapter, result, error } of results) {
    const label = adapter.label.padEnd(15);
    if (error) {
      process.stderr.write(`  ${label}  ✗ ${error}\n`);
    } else if (result) {
      const status = result.dryRun ? `(dry-run) ${result.message}` : result.message;
      const skillNote = !adapter.supportsSkill ? ' (no skill placement)' : '';
      process.stderr.write(`  ${label}  ${status}${skillNote}\n`);
    }
  }
  process.stderr.write('\n');
}

async function printClackSummary(results: HarnessResult[]): Promise<boolean> {
  const { log, outro } = await import('@clack/prompts');
  for (const { adapter, result, error } of results) {
    if (error) {
      log.error(`${adapter.label}: ${error}`);
    } else if (result) {
      const msg = result.dryRun ? `(dry-run) ${result.message}` : result.message;
      const skillNote = !adapter.supportsSkill ? ' · no skill placement' : '';
      if (result.changed && !result.dryRun) {
        log.success(`${adapter.label}: ${msg}${skillNote}`);
      } else {
        log.info(`${adapter.label}: ${msg}${skillNote}`);
      }
    }
  }
  const anyFailed = results.some((r) => r.error != null);
  outro(anyFailed ? 'Done (with errors — see above).' : 'All done!');
  return anyFailed;
}

async function applyAdapters(
  adapters: HarnessAdapter[],
  flags: ReturnType<typeof parseInstallFlags>,
  deps: InstallDeps
): Promise<HarnessResult[]> {
  const resolvedCommand = buildServerCommand(flags);
  const results: HarnessResult[] = [];

  for (const adapter of adapters) {
    const scope =
      adapter.scopes.includes('global' as never) && !adapter.scopes.includes(flags.scope as never)
        ? 'global'
        : flags.scope;
    try {
      const result = await adapter.apply({
        scope,
        dryRun: flags.dryRun,
        cwd: deps.cwd,
        homeDir: deps.homeDir,
        resolvedCommand,
      });
      results.push({ adapter, result });
    } catch (err) {
      results.push({ adapter, error: (err as Error).message ?? String(err) });
    }
  }

  return results;
}

export async function runInstall(argv: string[], deps: InstallDeps = {}): Promise<void> {
  const flags = parseInstallFlags(argv);
  const isTTY = deps.isTTY ?? process.stdout.isTTY;

  // Non-interactive path: --harness specified or --yes
  if (flags.harnesses.length > 0 || flags.yes || !isTTY) {
    if (flags.harnesses.length === 0) {
      process.stderr.write(
        'Usage: agent-web-interface install --harness <id|all|csv>\n' +
          `Available harnesses: ${ALL_ADAPTERS.map((a) => a.id).join(', ')}\n` +
          'Hint: use --harness all to install to all detected harnesses\n'
      );
      process.exit(1);
      return;
    }

    const adapters = flags.harnesses
      .map((id) => getAdapter(id))
      .filter((a): a is HarnessAdapter => {
        if (a == null) {
          process.stderr.write(`Unknown harness: ${a ?? '?'}\n`);
          return false;
        }
        return true;
      });

    const results = await applyAdapters(adapters, flags, deps);
    printSummaryTable(results);
    const anyFailed = results.some((r) => r.error != null);
    if (anyFailed) process.exit(1);
    return;
  }

  // Interactive path (TTY, no --harness)
  const { promptInstall } = await import('./interactive.js');
  const detected = await detectAdapters();
  const choices = await promptInstall(detected, ALL_ADAPTERS);
  if (!choices) return; // cancelled

  const results = await applyAdapters(
    choices.harnesses,
    { ...flags, browserMode: choices.browserMode, scope: choices.scope },
    deps
  );
  const anyFailed = await printClackSummary(results);
  if (anyFailed) process.exit(1);
}
