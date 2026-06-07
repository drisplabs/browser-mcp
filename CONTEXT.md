# Agent Web Interface

An MCP server for AI-driven browser automation. It produces semantic page snapshots and exposes tools for an AI agent to observe and act on web pages. This glossary covers the language of the **non-DOM interaction channel** — capabilities for everything that happens outside the page DOM.

## Language

### Non-DOM interaction channel

**Non-DOM interaction**:
Any interaction that lives outside the page DOM and therefore cannot be reached by snapshot/element-action tools — native file picker, JavaScript dialogs, downloads, permission prompts, basic-auth dialogs, and other native browser chrome.
_Avoid_: native UI, OS dialog (too narrow)

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
