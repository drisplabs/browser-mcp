export interface ServerCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export type InstallScope = 'project' | 'user' | 'global';

export interface ApplyOpts {
  scope: InstallScope;
  dryRun?: boolean;
  cwd?: string;
  homeDir?: string;
  resolvedCommand?: ServerCommand;
}

export interface ApplyResult {
  changed: boolean;
  dryRun: boolean;
  message: string;
}

export interface StatusOpts {
  scope: InstallScope;
  cwd?: string;
  homeDir?: string;
}

export interface HarnessStatus {
  configured: boolean;
  message: string;
}

export interface HarnessAdapter {
  readonly id: string;
  readonly label: string;
  readonly supportsSkill: boolean;
  readonly scopes: readonly InstallScope[];
  readonly serverCommand: ServerCommand;
  detect(): Promise<boolean>;
  apply(opts: ApplyOpts): Promise<ApplyResult>;
  status(opts: StatusOpts): Promise<HarnessStatus>;
}
