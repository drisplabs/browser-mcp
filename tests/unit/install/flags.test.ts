import { describe, it, expect } from 'vitest';
import { parseInstallFlags, buildServerCommand } from '../../../src/install/flags.js';

describe('parseInstallFlags()', () => {
  it('defaults to empty harnesses, project scope, no flags', () => {
    const flags = parseInstallFlags([]);
    expect(flags.harnesses).toEqual([]);
    expect(flags.scope).toBe('project');
    expect(flags.dryRun).toBe(false);
    expect(flags.yes).toBe(false);
    expect(flags.browserMode).toBe('auto');
    expect(flags.headless).toBe(false);
    expect(flags.pin).toBeUndefined();
    expect(flags.cdpUrl).toBeUndefined();
  });

  it('parses --harness as a single id', () => {
    const flags = parseInstallFlags(['--harness', 'cursor']);
    expect(flags.harnesses).toEqual(['cursor']);
  });

  it('parses --harness as comma-separated ids', () => {
    const flags = parseInstallFlags(['--harness', 'cursor,vscode']);
    expect(flags.harnesses).toEqual(['cursor', 'vscode']);
  });

  it('--harness all expands to all harness ids', () => {
    const flags = parseInstallFlags(['--harness', 'all']);
    expect(flags.harnesses).toContain('claude-code');
    expect(flags.harnesses).toContain('cursor');
    expect(flags.harnesses).toContain('vscode');
    expect(flags.harnesses).toContain('claude-desktop');
    expect(flags.harnesses.length).toBe(4);
  });

  it('parses --scope user', () => {
    const flags = parseInstallFlags(['--scope', 'user']);
    expect(flags.scope).toBe('user');
  });

  it('parses --scope global', () => {
    const flags = parseInstallFlags(['--scope', 'global']);
    expect(flags.scope).toBe('global');
  });

  it('--global sets scope to global', () => {
    const flags = parseInstallFlags(['--global']);
    expect(flags.scope).toBe('global');
  });

  it('--project sets scope to project', () => {
    const flags = parseInstallFlags(['--global', '--project']);
    expect(flags.scope).toBe('project');
  });

  it('parses --dry-run', () => {
    const flags = parseInstallFlags(['--dry-run']);
    expect(flags.dryRun).toBe(true);
  });

  it('parses --yes and -y', () => {
    expect(parseInstallFlags(['--yes']).yes).toBe(true);
    expect(parseInstallFlags(['-y']).yes).toBe(true);
  });

  it('parses --pin to exact version', () => {
    const flags = parseInstallFlags(['--pin', '1.2.3']);
    expect(flags.pin).toBe('1.2.3');
  });

  it('parses --browser-mode', () => {
    expect(parseInstallFlags(['--browser-mode', 'persistent']).browserMode).toBe('persistent');
    expect(parseInstallFlags(['--browser-mode', 'isolated']).browserMode).toBe('isolated');
    expect(parseInstallFlags(['--browser-mode', 'user']).browserMode).toBe('user');
  });

  it('unknown --browser-mode falls back to auto', () => {
    const flags = parseInstallFlags(['--browser-mode', 'bogus']);
    expect(flags.browserMode).toBe('auto');
  });

  it('parses --headless', () => {
    const flags = parseInstallFlags(['--headless']);
    expect(flags.headless).toBe(true);
  });

  it('parses --cdp-url', () => {
    const flags = parseInstallFlags(['--cdp-url', 'http://localhost:9222']);
    expect(flags.cdpUrl).toBe('http://localhost:9222');
  });
});

describe('buildServerCommand()', () => {
  it('uses @latest when no pin', () => {
    const flags = parseInstallFlags([]);
    const cmd = buildServerCommand(flags);
    expect(cmd.args).toContain('@drisp/browser-mcp@latest');
  });

  it('uses pinned version when --pin is set', () => {
    const flags = parseInstallFlags(['--pin', '1.2.3']);
    const cmd = buildServerCommand(flags);
    expect(cmd.args).toContain('@drisp/browser-mcp@1.2.3');
    expect(cmd.args).not.toContain('@drisp/browser-mcp@latest');
  });

  it('adds --mode arg when browser-mode is not auto', () => {
    const flags = parseInstallFlags(['--browser-mode', 'persistent']);
    const cmd = buildServerCommand(flags);
    expect(cmd.args).toContain('--mode');
    expect(cmd.args).toContain('persistent');
  });

  it('does not add --mode when browser-mode is auto', () => {
    const flags = parseInstallFlags([]);
    const cmd = buildServerCommand(flags);
    expect(cmd.args).not.toContain('--mode');
  });

  it('adds --headless flag when set', () => {
    const flags = parseInstallFlags(['--headless']);
    const cmd = buildServerCommand(flags);
    expect(cmd.args).toContain('--headless');
  });

  it('adds --cdp-url when set', () => {
    const flags = parseInstallFlags(['--cdp-url', 'http://localhost:9222']);
    const cmd = buildServerCommand(flags);
    expect(cmd.args).toContain('--cdp-url');
    expect(cmd.args).toContain('http://localhost:9222');
  });
});
