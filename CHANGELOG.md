## [4.6.5] - 2026-07-04

- chore: add minimal Dockerfile for Glama introspection (#97)
- fix(ci): prettier-format package.json (em dash escaped by generator) (#98)
- chore(seo): point npm homepage at the site, sharpen keywords/description (#96)
- fix(ci): prettier-format non-DOM detection plan doc (#95)
- fix(#92): give the dialog safety net an owner and a caller (Slice 3)
- refactor(#92): trust file-chooser interception, drop speculative resolve (Slice 2)
- refactor(#92): fold permission detection into stabilization (Slice 1)
- feat: non-DOM surface model + tool-surface consolidation (#86–#90, #92) (#91)

## [4.6.4] - 2026-06-15

- fix(install): clean up interactive summary UX and repair three bugs (#84)

## [4.6.3] - 2026-06-07

- docs: update README quickstart to lead with install command + CHANGELOG (#83)
- Merge pull request #82 from lespaceman/feat/doctor-command
- feat: add doctor command — read-only per-harness status (#70)
- Merge pull request #81 from lespaceman/feat/interactive-install
- feat: interactive install flow + flag surface + adapter registry (#69)
- Merge pull request #80 from lespaceman/feat/claude-desktop-adapter
- feat: add ClaudeDesktopAdapter (global, OS-specific paths, MCP-only) (#68)
- Merge pull request #79 from lespaceman/feat/vscode-adapter
- feat: add VSCodeAdapter for servers/type:stdio MCP + instructions (#72)
- Merge pull request #78 from lespaceman/feat/cursor-adapter
- feat: add CursorAdapter for MCP + .mdc rule placement (#71)
- Merge pull request #77 from lespaceman/feat/skill-packaging
- feat(#67): portable skill packaging + Claude Code skill placement
- Merge pull request #76 from lespaceman/feat/config-io
- feat(#66): config-io + HarnessAdapter interface + Claude Code .mcp.json fallback
- Merge pull request #75 from lespaceman/feat/install-dispatch
- feat(#64): install dispatch + Claude Code MCP registration
- Merge pull request #74 from lespaceman/docs/install-design-docs
- docs: add install design docs (ADR-0002, ADR-0003, CONTEXT.md glossary)
- docs: add project context, ADR-0001, captcha findings, and non-DOM interaction PRD (#63)
- chore(skills): commit portable skills-lock.json, ignore .agents install dir (#62)
- chore(skill): optimize agent-web-interface description for triggering (#61)

## [Unreleased]

### Added

- `agent-web-interface install` — interactive installer that auto-detects Claude Code, Cursor, VS Code, and Claude Desktop; registers the MCP server and places the agent skill in one step
- `agent-web-interface doctor` — read-only status command showing per-harness MCP and skill installation state
- Install flags: `--harness` (id, `all`, or comma-separated), `--scope project|user`, `--global`, `--project`, `--browser-mode`, `--headless`, `--cdp-url`, `--pin`, `--dry-run`, `--yes`
- Cursor adapter: merges `mcpServers` into `.cursor/mcp.json` and places skill as `.cursor/rules/agent-web-interface.mdc`
- VS Code adapter: merges into `.vscode/mcp.json` under `servers` key (`type: "stdio"`); places skill as `.github/instructions/agent-web-interface.instructions.md`
- Claude Desktop adapter: always global, MCP-only (no skill placement), resolves OS-specific config path for macOS, Linux, and Windows
- `skills-lock.json` SHA-256 hash verification for skill integrity
- `--help` now documents all install flags and the `doctor` command

---

## [4.6.2] - 2026-06-07

- refactor: rename skill agent-web-interface-guide -> agent-web-interface
- feat: add agent-web-interface-guide skill for npx skills install
- docs: backfill detailed 4.6.0 changelog for browser-mode refactor
- Merge pull request #60 from lespaceman/feat/fingerprint-stealth
- fix(browser): address review on stealth
- feat(browser): add optional fingerprint-only stealth

# Changelog

## [4.6.1] - 2026-06-06

- Merge pull request #59 from lespaceman/fix/ci-format-and-security-audit
- fix(ci): format README and resolve security audit failures
- Merge pull request #58 from lespaceman/docs/improve-readme-positioning
- docs: improve README positioning and examples

## [4.6.0] - 2026-03-31

### Breaking Changes

- Remove `headless`, `isolated`, `auto_connect` params from `navigate` tool — browser config is now env-var only
- Remove `setBrowserConfig()`, `canReconfigure()`, `resetBrowser()`, `getBrowserConfig()` from SessionController/ToolContext

### Added

- `AWI_BROWSER_MODE` env var: `user` (connect to running Chrome), `persistent` (dedicated profile), `isolated` (temp profile)
- `AWI_HEADLESS` env var: run browser headless (for persistent/isolated modes)
- Auto fallback chain when `AWI_BROWSER_MODE` is unset: user → persistent → isolated

### Changed

- Redesign browser session management with explicit modes
- Navigate tool simplified to pure navigation (`url`, `page_id` only)
- Browser config is immutable infrastructure — set once at startup via env vars
- Navigate no longer needs `SKIP_BROWSER_INIT` exception
- Gate bringToFront behind BRING_TO_FRONT env var (default off)

## [4.5.1] - 2026-03-29

- Harden browser mode switching and auto-connect errors
- Merge pull request #57 from lespaceman/claude/plan-network-tools-mLeLo
- style: fix prettier formatting for CI
- chore: add pre-commit hooks with husky and lint-staged
- docs: update README to match current CLI and session architecture
- refactor: optimize network recorder with ring buffer and review cleanup
- fix: adapt network tools to ToolContext-based handler signature
- feat: add list_network_calls and search_network_calls tools
- Merge pull request #56 from lespaceman/claude/fix-ci-npm-release-bhST8
- fix: resolve security audit vulnerabilities (brace-expansion, path-to-regexp)
- fix: exclude integration tests from CI to prevent Chrome-dependent failures
