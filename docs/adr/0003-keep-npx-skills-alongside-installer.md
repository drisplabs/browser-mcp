# Keep `npx skills` alongside the first-party installer

The new `agent-web-interface install` command registers the MCP server and places the skill in one step and becomes the canonical setup path in the README. The non-obvious decision recorded here is that we deliberately keep the older `npx skills add lespaceman/agent-web-interface` path — and its `skills-lock.json` and `.agents/` — working rather than deleting them once the first-party installer exists.

We keep it because that path belongs to the open skills ecosystem, which other agent runners we don't control rely on for discovery; removing it would break external consumers for no benefit. So two skill-install mechanisms coexist on purpose: the first-party installer is primary, `npx skills add` is demoted to a skill-only/advanced alternative.

## Consequences

- Two ways to install the skill exist on purpose; the README must make the first-party installer clearly primary to avoid confusing readers.
- `skills-lock.json` is maintained for the external ecosystem even though the installer never reads it.
