# The skill is one portable, tool-gating-free document delivered to every harness

The agent-web-interface skill was a Claude-Code Agent Skill whose frontmatter gated tools via `allowed-tools: mcp__agent-web-interface__*`. To let `agent-web-interface install` deliver the same guidance to every harness, we drop `allowed-tools` from the canonical `SKILL.md` and treat it as a single portable document. Each harness adapter re-wraps the identical body for its native format and location — Claude Code skill (`.claude/skills/…/SKILL.md`), Cursor rule (`.cursor/rules/agent-web-interface.mdc`), and VS Code (GitHub Copilot instructions, `.github/instructions/agent-web-interface.instructions.md`). Claude Desktop has no filesystem drop and is skipped with a note.

We considered keeping the gated Claude-only skill and authoring separate per-harness guidance, but that means three documents drifting out of sync as the tool set evolves, for weaker payoff. A single source with mechanical per-harness wrapping keeps the prose canonical.

## Consequences

- Removing `allowed-tools` changes the published skill's Claude Code behavior: when active it no longer restricts the agent to the browser tools. This is intended — portability over gating.
- Editing the canonical `SKILL.md` invalidates `skills-lock.json`'s `computedHash`; it must be regenerated so the external `npx skills` consumers stay valid.
- Cursor/VS Code receive the skill as a rule/instructions file; Claude Desktop receives the MCP server only.
