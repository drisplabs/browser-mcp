# Rename to `@drisp/browser-mcp` under the Drisp family

The package `agent-web-interface` is renamed to **`@drisp/browser-mcp`**, joining the Drisp product family (`@drisp/cli`, the agent runtime) as a peer product. The MCP server id becomes `drisp-browser`, the env-var prefix becomes `DRISP_BROWSER_`, and the repo moves to `drisplabs/browser-mcp`. The rename is done with back-compat: the old npm package and the old `AWI_` env prefix keep working during a transition.

## Why rename at all

"Agent Web Interface" mis-signals the product. "web interface" reads as *a website/UI where a human talks to an agent* — the opposite of what this is: an MCP server that lets an **agent** drive a browser. The agent is the *user* of the tool, not the audience. Readers, npm search, and MCP registries all inherit that confusion.

## Why not the obvious fixes

A brand-collision audit rejected the intuitive replacements. The AI-browser space is a red ocean and the "agent + browser + generic suffix" zone is already owned:

- **"Agent Browser Interface" — rejected (blocking).** Collides with Vercel Labs' `agent-browser` (~38k⭐, npm `agent-browser`, 73 dependents, `agent-browser.dev`) — same niche *and* same "compact snapshot with stable element refs" feature — and with Bright Data's commercial "Agent Browser" product. The acronym "ABI" is unusable (Application Binary Interface / Ethereum contract ABI, both in our audience). And "Interface" repeats the exact misread that sank "Web Interface."
- **Standalone brandable names — rejected (occupied or invisible).** WebGrip (weak meaning), SnapDriver (NetApp SnapDrive), Browser Bridge, BrowserPilot, Anchor Browser ($6M-seed cloud browser), PageLens, Glimpse, SnapDOM, PageSense, Cortex, Helm — all taken in dev tooling.
- **Any single category-descriptor name — rejected (strategic).** Renaming one generic descriptor to another buys neither clarity nor differentiation; it just moves one seat over in a full room, SEO-buried behind Vercel.

## The decision: house brand + surface-based package

`drisp.dev` / `@drisp` / `drisplabs` is a brand we already own (Drisp Labs, the agent runtime). Bringing the browser tool under it separates the two jobs a name must do: **the scope carries identity, the package carries the keywords.** The confusion evaporates — nobody reads `@drisp/browser-mcp` as a chat UI — and we inherit the brand instead of building recognition from zero.

The browser tool is a **peer** in a planned family of surfaces the agent controls — mobile, desktop, TV. That makes the naming axis the *surface*, not the feature, so names must be parallel and swappable:

```
@drisp/browser-mcp   @drisp/mobile-mcp   @drisp/desktop-mcp   @drisp/tv-mcp
```

This is why a feature sub-brand (Vision / Snapshot / Perception) was rejected as the head noun: the semantic-snapshot differentiator is a *horizontal* capability spanning every surface, so it cannot name one vertical. It belongs in the tagline, not the package name.

### Why `browser-mcp` and not `browser`, `mcp`, or `server-browser`

Discoverability data (npm downloads, GitHub stars/repo counts, and npm's search-ranking model, mid-2026) drove the suffix:

- **Both "browser" and "mcp" are load-bearing name tokens.** npm ranks name-token matches above keyword matches, and the audience's literal query is `browser … mcp`. Every high-usage server in the category carries "mcp" in the *name* — `@playwright/mcp` (~24.9M/mo), `@modelcontextprotocol/server-puppeteer`, `@browsermcp/mcp`, `@agent-infra/mcp-server-browser`; none popular omits it.
- **"browser" is the strongest *ownable* head noun.** "playwright" is bigger but is Microsoft's scope; "puppeteer" is declining; "web" dilutes into web-framework noise. "browser" is what the tool drives and what the ecosystem searches ("browser mcp" ≈ 3,916 GitHub repos; `browser-use` is the #1 AI-browser repo at ~78.5k⭐).
- **`@drisp/mcp` was rejected** because, unlike `@playwright/mcp`, our scope doesn't imply a surface — it would drop the "browser" query token and burn the umbrella slot. `@drisp/mcp` is instead **reserved** for a future aggregator that fronts the whole family.
- **`@drisp/server-browser` was rejected** as off-convention (the `server-<cap>` form is specific to the modelcontextprotocol monorepo, a multi-server org scope).

Caveat: download counts are inflated by CI/agent installs, so they are treated as *relative* signal — but the naming pattern they reveal is unambiguous.

## Consequences

- **Back-compat is mandatory, not optional.** The old name is live in end-user configs (the installer writes it as an `mcpServers` key and as `npx agent-web-interface@latest`) and in `AWI_*` env vars users have set. The rename keeps the old npm package installable (deprecated, pointing to the new one) and honors `AWI_*` as a deprecated fallback, so no existing install breaks. This is the reason for the env-compat shim below rather than a hard cut.
- **`@drisp/mcp` is deliberately unclaimed** and must stay reserved for a future umbrella server.
- **Three steps live outside this repo** and are the maintainer's to perform; the code migration is inert until they happen.

## Migration checklist

### In-repo (code migration — separate change)

- **npm identity:** `package.json` `name` → `@drisp/browser-mcp`, `bin` key, `repository`/`bugs`/`homepage` URLs; `.claude-plugin/plugin.json` `name`; `skills-lock.json` id + `drisplabs/browser-mcp` slug + skillPath; `.github/workflows/release.yml` npm URL/install line; `Dockerfile`; `.mcp.json` dev key (and fix the stale absolute `cwd`).
- **MCP server id:** `src/index.ts` (`name: 'drisp-browser'`); installer `SERVER_NAME` and `@drisp/browser-mcp@latest` spec in `src/install/harness/{claude-code,vscode,claude-desktop,cursor}.ts`; user-facing strings in `src/install/{flags,doctor,interactive,index,skill-source}.ts`.
- **Env prefix back-compat:** add `src/shared/env-compat.ts` — `readEnv(name)` reads `DRISP_BROWSER_<name>` first, falls back to `AWI_<name>` with a one-time deprecation warning via the logging service. Replace the 9 direct `process.env.AWI_*` reads (`src/browser/browser-session-config.ts` ×5, `src/tools/interaction-tools.ts` ×3, `src/state/state-renderer.ts` ×1) and update the `resolveDownloadDir` error text.
- **Skill:** rename `skills/agent-web-interface/` → `skills/browser-mcp/`; update `SKILL.md` frontmatter/heading/prose.
- **Tests:** update the ~10 install/config test files and the 3 asserting the skill heading; update env-prefix tests to assert `DRISP_BROWSER_` **and** add a case proving `AWI_` still works.
- **Docs:** `README.md` (title, tagline, links, env examples), `CLAUDE.md`, `CONTEXT.md`, `CHANGELOG.md` (rename entry), `docs/**`, `commands/**`. Leave historical ADR/investigation references to the old name intact.

### External / manual (maintainer)

1. Publish `@drisp/browser-mcp`; then `npm deprecate agent-web-interface "renamed to @drisp/browser-mcp"`. Keep the old package installable for the transition.
2. Rename the GitHub repo `lespaceman/agent-web-interface` → `drisplabs/browser-mcp` (GitHub auto-redirects the old slug); update the git remote.
3. Acquire/redirect the domain from `agent-web-interface.com` to the Drisp property.

### Verification (after code migration)

- `npm run type-check && npm run lint && npm test` clean, including the `AWI_`-still-works back-compat case.
- `npm run build && npm run mcp:inspect` reports server name `drisp-browser`.
- `node dist/src/index.js install --harness all --dry-run` emits key `drisp-browser` and spec `@drisp/browser-mcp@latest`.
- Run once with `DRISP_BROWSER_HEADLESS=true` and once with legacy `AWI_HEADLESS=true`; both take effect, the legacy run logs the deprecation warning.
