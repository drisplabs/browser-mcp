# Agent Web Interface

An MCP server for AI-driven browser automation. It produces semantic page snapshots and exposes tools for an AI agent to observe and act on web pages.

## Language

### Setup & distribution

**Harness**:
An AI client that consumes the MCP server and/or the skill. v1 targets four: Claude Code, Cursor, VS Code, and Claude Desktop. Each has its own config location and guidance format.
_Avoid_: client, IDE, editor (too narrow)

**Install**:
The single setup command (`agent-web-interface install`) that, for each chosen harness, performs MCP registration and places the skill.

**MCP registration**:
Adding the agent-web-interface server to a harness's configuration so its `mcp__agent-web-interface__*` tools become available.

**Skill**:
A single portable guidance document (canonical `SKILL.md` body, **no tool-gating**) that teaches an agent to drive the tools well. Delivered to every harness, wrapped for that harness's native format and location.
_Avoid_: rule, instructions (those are per-harness wrappings of the skill)

**Install scope**:
Where setup is written: **project** (the current repo) or **user/global** (home-dir configs). Claude Desktop is always global — it has no project concept.

**Detection**:
Whether a harness is present on the machine, used to pre-select it for confirmation.

### Non-DOM interaction channel

**Non-DOM interaction**:
Any interaction that lives outside the page DOM and therefore cannot be reached by snapshot/element-action tools — native file picker, JavaScript dialogs, downloads, permission prompts, basic-auth dialogs, and other native browser chrome.
_Avoid_: native UI, OS dialog (too narrow)

**Non-DOM surface**:
A currently visible interaction surface outside the page DOM that the agent can perceive and act on through normal snapshot control kinds plus surface metadata, such as a file picker, JavaScript dialog, permission prompt, basic-auth prompt, or download destination prompt.
_Avoid_: native dialog, OS dialog, fake DOM element

**Blocking non-DOM surface**:
A non-DOM surface that prevents normal page interaction until the agent responds to it. Blocking surfaces become the active layer; non-blocking surfaces appear as additional context while the page layer remains active.
_Avoid_: treating all non-DOM surfaces as modal

**Synthetic element ID**:
An element ID in the normal `eid` namespace that identifies an agent-actionable control on a non-DOM surface rather than a DOM-backed node. Synthetic IDs use a clear prefix so action tools can route them internally without introducing a second targeting concept.
_Avoid_: separate surface ID, fake DOM ID

**Browser host**:
The host (machine or container) where the Chromium process actually runs. File uploads require files to exist on the browser host, not the MCP server host.
_Avoid_: Chrome host, remote host

**Co-location**:
The v1 precondition that the MCP server and the browser host share a filesystem (same machine/container or shared mount). Path validation by `fs.stat` is only meaningful under co-location.

**Path locality**:
The constraint that an uploaded file's path must resolve on the browser host. Violations are reported with an error message that names path-locality explicitly.

**Allowed root**:
A configured directory within which an upload file path must be contained. Uploads outside every allowed root are rejected. Bounds what the agent can exfiltrate into a web form.

**Pending non-DOM prompt**:
A currently-blocking native prompt (open dialog, awaiting auth) surfaced in every action response so the agent knows why the page is blocked and which tool clears it.
