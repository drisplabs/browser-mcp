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
