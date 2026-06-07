import type { HarnessAdapter, InstallScope } from './harness-adapter.js';
import type { BrowserMode } from './flags.js';

export interface InteractiveChoices {
  harnesses: HarnessAdapter[];
  scope: InstallScope;
  browserMode: BrowserMode;
  confirmed: boolean;
}

export async function promptInstall(
  detected: HarnessAdapter[],
  all: readonly HarnessAdapter[]
): Promise<InteractiveChoices | null> {
  // Dynamic import — @clack/prompts must never be statically imported on the server path
  const { intro, multiselect, select, confirm, outro, isCancel } = await import('@clack/prompts');

  intro('agent-web-interface install');

  const harnessResult = await multiselect<string>({
    message: 'Which AI tools do you want to register the MCP server in?',
    options: all.map((a) => ({
      value: a.id,
      label: a.label,
      hint: detected.some((d) => d.id === a.id) ? 'detected' : undefined,
    })),
    initialValues: detected.map((d) => d.id),
    required: true,
  });
  if (isCancel(harnessResult)) {
    outro('Cancelled.');
    return null;
  }

  const selectedIds = harnessResult;
  const selectedAdapters = selectedIds
    .map((id) => all.find((a) => a.id === id))
    .filter((a): a is HarnessAdapter => a != null);

  const scopeResult = await select<InstallScope>({
    message: 'Install scope',
    options: [
      {
        value: 'project' as InstallScope,
        label: 'Project (recommended) — writes to .mcp.json / .vscode/mcp.json in cwd',
      },
      { value: 'user' as InstallScope, label: 'User — writes to ~/.cursor/mcp.json etc.' },
    ],
  });
  if (isCancel(scopeResult)) {
    outro('Cancelled.');
    return null;
  }

  const browserModeResult = await select<BrowserMode>({
    message: 'Browser mode',
    options: [
      { value: 'auto' as BrowserMode, label: 'auto (default) — uses system browser' },
      { value: 'user' as BrowserMode, label: 'user — reuses your browser profile' },
      {
        value: 'persistent' as BrowserMode,
        label: 'persistent — dedicated profile, persists between sessions',
      },
      {
        value: 'isolated' as BrowserMode,
        label: 'isolated — fresh incognito profile each time',
      },
    ],
  });
  if (isCancel(browserModeResult)) {
    outro('Cancelled.');
    return null;
  }

  const scope = scopeResult;
  const browserMode = browserModeResult;

  const confirmResult = await confirm({
    message: `Apply to ${selectedAdapters.map((a) => a.label).join(', ')} with scope=${scope} and mode=${browserMode}?`,
  });
  if (isCancel(confirmResult) || !confirmResult) {
    outro('Cancelled.');
    return null;
  }

  return {
    harnesses: selectedAdapters,
    scope,
    browserMode,
    confirmed: true,
  };
}
