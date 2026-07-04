# Agent Web Interface

Agent Web Interface is an MCP server that gives AI agents a compact, semantic interface to the browser.

**[Website](https://agent-web-interface.com)** · **[npm](https://www.npmjs.com/package/agent-web-interface)** · **[vs. Playwright MCP](https://agent-web-interface.com/vs-playwright-mcp)**

Instead of exposing the full DOM or accessibility tree, it returns structured page snapshots: visible regions, readable content, interactive elements, stable element IDs, form context, screenshots, canvas inspection, and network activity. Agents can then navigate and act on pages using semantic IDs instead of brittle selectors or massive context dumps.

It is built for coding agents, browser agents, QA agents, research agents, and automation workflows that need reliable web interaction without wasting tokens on low-signal browser internals.

---

## Why this exists

Browser automation is easy for scripts and hard for LLM agents.

Traditional browser tools expose either raw DOM, full accessibility trees, screenshots, or low-level selectors. That works for deterministic code, but it is inefficient for language models. The model has to spend context and reasoning budget separating useful UI intent from implementation noise.

Agent Web Interface changes the interface boundary.

The browser still runs through Puppeteer and Chrome DevTools Protocol, but the agent sees a smaller, more semantic representation of the page:

- What regions exist on the page
- What the user can read
- What the user can interact with
- Which elements are visible, enabled, selected, expanded, or required
- Which stable `eid` should be used for the next action
- What changed after the previous action

The goal is not to mirror the browser. The goal is to expose the page in the shape an agent can reason about.

---

## The core abstraction

Agent Web Interface turns a browser page into an agent-readable snapshot.

A snapshot contains compact semantic information such as:

- Page regions: header, navigation, main content, footer
- Interactive elements: buttons, links, textboxes, checkboxes, radios, comboboxes
- Readable content: headings, paragraphs, alerts, labels
- Element state: visible, enabled, checked, selected, expanded, focused
- Layout hints: bounding boxes and screen zones
- Stable element IDs: `eid` values that can be reused by action tools

Agents act on these IDs:

```json
{
  "eid": "btn-sign-in"
}
```

rather than reasoning from fragile CSS selectors or repeatedly scanning a large DOM tree.

This makes browser use more predictable for agents because observation and action are connected through a stable semantic contract.

---

## What it is

Agent Web Interface is:

- An MCP server for browser automation
- A semantic observation layer over Puppeteer and CDP
- A compact page representation for LLM agents
- A stable `eid`-based action interface
- A toolset for navigation, interaction, forms, screenshots, canvas, readability, and network inspection

Agent Web Interface is not:

- A replacement for Puppeteer
- A general-purpose browser
- A visual testing framework
- A scraping framework
- A CAPTCHA or anti-bot bypass tool

Puppeteer and CDP remain the execution layer. Agent Web Interface changes what the agent sees and how it decides what to do next.

---

## How it works

At a high level:

1. The agent calls a browser tool through MCP.
2. Agent Web Interface controls Chrome through Puppeteer and CDP.
3. The current page is reduced into semantic regions, readable content, and actionable elements.
4. The agent receives a compact snapshot instead of a raw browser dump.
5. The agent acts using stable element IDs.
6. Agent Web Interface waits for the page to stabilize and returns the updated state.

This keeps browser lifecycle, page representation, and action execution separated.

```text
AI Agent
   ↓ MCP
Agent Web Interface
   ↓ semantic snapshots + stable eids
Puppeteer / Chrome DevTools Protocol
   ↓
Chrome / Chromium
```

---

## Example agent loop

A typical browser-agent loop looks like this:

1. The agent calls `navigate` with a URL.
2. Agent Web Interface returns a compact page snapshot.
3. The agent calls `find` to locate a semantic element, such as a “Sign in” button or an email field.
4. The agent calls `click`, `type`, `select`, or `press` using the returned `eid`.
5. Agent Web Interface waits for the page to stabilize and returns the updated snapshot.
6. The agent continues from the changed page state instead of re-reading the entire DOM.

This gives the model a browser interaction loop based on semantic state transitions rather than raw page internals.

---

## Example user journey

The following example shows how an agent might use Agent Web Interface inside a dashboard-style web app.

Task:

> Find the failed payment from `client@example.com`, open it, add an internal note saying “Customer contacted. Waiting for bank confirmation.”, and confirm the note was saved.

### 1. Agent navigates to the payments dashboard

Tool call:

```json
{
  "tool": "navigate",
  "input": {
    "url": "https://dashboard.example.com/payments"
  }
}
```

Tool response:

```xml
<state step="1" title="Payments · Dashboard" url="https://dashboard.example.com/payments">
  <meta view="1440x900" scroll="0,0" layer="main" />
  <baseline reason="first" />

  <region name="nav">
    <link id="lnk-home" href="/dashboard">Home</link>
    <link id="lnk-payments" selected="true" href="/payments">Payments</link>
    <link id="lnk-customers" href="/customers">Customers</link>
    <link id="lnk-reports" href="/reports">Reports</link>
  </region>

  <region name="main">
    <h id="hd-payments">Payments</h>
    <btn id="btn-create-payment">Create payment</btn>
    <btn id="btn-export">Export</btn>
    <inp id="inp-search-payments" type="search">Search payments</inp>
    <btn id="btn-filter-status">Status</btn>
    <btn id="btn-filter-date">Date</btn>

    <elt id="payment-row-1" kind="row">₹12,500 succeeded nadeem@example.com Jun 6</elt>
    <elt id="payment-row-2" kind="row">₹8,999 failed client@example.com Jun 6</elt>
    <elt id="payment-row-3" kind="row">₹2,400 refunded test@example.com Jun 5</elt>
  </region>
</state>
```

The agent does not need to inspect a DOM table. It sees the relevant row directly as semantic state.

### 2. Agent opens the failed payment

Tool call:

```json
{
  "tool": "click",
  "input": {
    "eid": "payment-row-2"
  }
}
```

Tool response:

```xml
<state step="2" title="Payment ₹8,999 · Dashboard" url="https://dashboard.example.com/payments/pay_8x91">
  <meta view="1440x900" scroll="0,0" layer="main" />
  <baseline reason="navigation" />

  <region name="main">
    <h id="hd-payment-detail">Payment ₹8,999</h>
    <alert id="payment-status" kind="status">Failed</alert>

    <elt id="payment-customer" kind="row">Customer client@example.com</elt>
    <elt id="payment-method" kind="row">Payment method UPI</elt>
    <elt id="payment-failure-reason" kind="row">Failure reason Bank declined transaction</elt>

    <h id="hd-timeline">Timeline</h>
    <elt id="timeline-row-1" kind="row">Payment created Jun 6, 10:42 AM</elt>
    <elt id="timeline-row-2" kind="row">Payment failed Jun 6, 10:43 AM</elt>

    <h id="hd-internal-notes">Internal notes</h>
    <inp id="inp-internal-note" type="textarea">Add an internal note</inp>
    <btn id="btn-save-note">Save note</btn>
  </region>

  <region name="aside">
    <btn id="btn-refund" enabled="false">Refund</btn>
    <btn id="btn-retry-payment">Retry payment</btn>
    <btn id="btn-copy-payment-id">Copy payment ID</btn>
  </region>
</state>
```

Because this is a navigation, the response is a new baseline. The previous row IDs are no longer assumed valid.

### 3. Agent types the internal note

Tool call:

```json
{
  "tool": "type",
  "input": {
    "eid": "inp-internal-note",
    "text": "Customer contacted. Waiting for bank confirmation.",
    "clear": true
  }
}
```

Tool response:

```xml
<state step="3" title="Payment ₹8,999 · Dashboard" url="https://dashboard.example.com/payments/pay_8x91">
  <meta view="1440x900" scroll="0,0" layer="main" />
  <diff type="mutation" />

  <region name="main">
    <inp id="inp-internal-note" focused="true" val="Customer contacted. Waiting for bank confirmation." type="textarea">Add an internal note</inp>
  </region>
</state>
```

The agent receives only the changed field, not the whole page again.

### 4. Agent saves the note

Tool call:

```json
{
  "tool": "click",
  "input": {
    "eid": "btn-save-note"
  }
}
```

Tool response:

```xml
<state step="4" title="Payment ₹8,999 · Dashboard" url="https://dashboard.example.com/payments/pay_8x91">
  <meta view="1440x900" scroll="0,0" layer="main" />
  <diff type="mutation" added="1">
    <status id="rd-note-status" role="status">Note saved.</status>
  </diff>

  <observations>
    <appeared when="action" eid="toast-note-saved" role="status" delay_ms="180" transient="true">Note saved.</appeared>
  </observations>

  <region name="main">
    <elt id="note-row-1" kind="row">Customer contacted. Waiting for bank confirmation.</elt>
    <btn id="btn-save-note" enabled="false">Save note</btn>
  </region>

  <region name="alert">
    <alert id="toast-note-saved" kind="status">Note saved.</alert>
  </region>
</state>
```

The agent can now conclude that the note was saved because both signals are present:

1. A status appeared: `Note saved.`
2. A new note row appeared with the submitted text.

### 5. Agent final answer to the user

```text
Done. I opened the failed ₹8,999 payment for client@example.com, added the internal note, and confirmed that the dashboard showed “Note saved.”
```

This journey demonstrates the core interaction model:

```text
navigate → baseline state
click row → new page baseline
type note → small diff
click save → diff + observation + confirmation state
```

The agent does not receive raw DOM, brittle selectors, or a massive accessibility tree. It receives a compact state transition after every browser action.

---

## Tool response format

Most browser interaction tools return a compact XML state response.

The response is designed for LLM agents, not for humans reading browser internals. It favors stable semantic IDs, short tags, page regions, and incremental diffs over full DOM dumps.

A typical response contains:

- `<state>`: current page state, title, URL, and step number
- `<meta>`: viewport, scroll position, and active interaction layer
- `<baseline>` or `<diff>`: whether this is a full page state or an incremental update
- `<observations>`: important transient UI changes such as dialogs, alerts, and toasts
- `<region>`: grouped actionable elements by semantic page region
- Short element tags such as `<btn>`, `<inp>`, `<link>`, `<chk>`, `<sel>`, and `<alert>`

Agents should use the `id` attributes, not CSS selectors, when performing follow-up actions.

### Baseline response

This is the shape after `navigate` when the agent has no previous state.

```xml
<state step="1" title="Sign in | Acme" url="https://app.example.com/login">
  <meta view="1280x720" scroll="0,0" layer="main" />
  <baseline reason="first" />

  <region name="header">
    <link id="lnk-home" href="/">Acme</link>
    <link id="lnk-docs" href="/docs">Docs</link>
  </region>

  <region name="main">
    <h id="hd-sign-in">Sign in</h>
    <inp id="inp-email" type="email">Email</inp>
    <inp id="inp-password" type="password">Password</inp>
    <chk id="chk-remember">Remember me</chk>
    <btn id="btn-submit">Sign in</btn>
  </region>
</state>
```

### Diff response

For same-page interactions, Agent Web Interface returns only the meaningful change.

```xml
<state step="3" title="Sign in | Acme" url="https://app.example.com/login">
  <meta view="1280x720" scroll="0,0" layer="main" />
  <diff type="mutation" />

  <region name="main">
    <inp id="inp-email" focused="true" val="nadeem@example.com" type="email">Email</inp>
  </region>
</state>
```

### Validation error

Readable mutations are rendered inline inside `<diff>`.

```xml
<state step="4" title="Sign in | Acme" url="https://app.example.com/login">
  <meta view="1280x720" scroll="0,0" layer="main" />
  <diff type="mutation">
    <status id="rd-alert-login" role="alert">Invalid email or password.</status>
  </diff>

  <region name="main">
    <inp id="inp-password" focused="true" type="password">Password</inp>
    <btn id="btn-submit">Sign in</btn>
  </region>

  <region name="alert">
    <alert id="rd-alert-login">Invalid email or password.</alert>
  </region>
</state>
```

### Modal response

Overlay layers such as modals, popovers, and drawers show the complete active overlay so the agent can reason about available actions.

```xml
<state step="6" title="Products | Acme" url="https://app.example.com/products">
  <meta view="1280x720" scroll="0,0" layer="modal" />
  <diff type="mutation" added="3" />

  <observations>
    <appeared when="action" eid="dlg-delete-product" role="dialog" delay_ms="120">
      <heading eid="dlg-title">Delete product?</heading>
      <text>This action cannot be undone.</text>
      <button eid="btn-confirm-delete">Delete</button>
    </appeared>
  </observations>

  <region name="dialog">
    <h id="dlg-title">Delete product?</h>
    <btn id="btn-cancel">Cancel</btn>
    <btn id="btn-confirm-delete">Delete</btn>
  </region>
</state>
```

### Trimmed large region

When a page has many repeated elements, large regions may be trimmed. The agent can call `find` with the region to retrieve more.

```xml
<state step="9" title="Search results | Acme" url="https://app.example.com/search?q=invoice">
  <meta view="1280x720" scroll="0,420" layer="main" />
  <baseline reason="navigation" />

  <region name="main">
    <link id="result-1" href="/invoice/1001">Invoice 1001</link>
    <link id="result-2" href="/invoice/1002">Invoice 1002</link>
    <link id="result-3" href="/invoice/1003">Invoice 1003</link>
    <link id="result-4" href="/invoice/1004">Invoice 1004</link>
    <link id="result-5" href="/invoice/1005">Invoice 1005</link>
    <!-- trimmed 42 items. Use find with region=main to see all -->
    <link id="result-48" href="/invoice/1048">Invoice 1048</link>
    <link id="result-49" href="/invoice/1049">Invoice 1049</link>
    <link id="result-50" href="/invoice/1050">Invoice 1050</link>
  </region>
</state>
```

---

## Real-world response examples

These examples are illustrative, but shaped according to the actual response contract: `<state>`, `<meta>`, `<baseline>` or `<diff>`, optional `<observations>`, and region-grouped short element tags.

### GitHub-style issue page

```xml
<state step="1" title="Issue #42 · acme/platform" url="https://github.com/acme/platform/issues/42">
  <meta view="1440x900" scroll="0,0" layer="main" />
  <baseline reason="first" />

  <region name="header">
    <link id="lnk-github-logo" href="/">GitHub</link>
    <inp id="inp-global-search" type="search">Search or jump to...</inp>
    <link id="lnk-pulls" href="/pulls">Pull requests</link>
    <link id="lnk-issues" href="/issues">Issues</link>
    <btn id="btn-create-new">Create new...</btn>
  </region>

  <region name="nav">
    <link id="repo-code" href="/acme/platform">Code</link>
    <link id="repo-issues" selected="true" href="/acme/platform/issues">Issues</link>
    <link id="repo-pulls" href="/acme/platform/pulls">Pull requests</link>
    <link id="repo-actions" href="/acme/platform/actions">Actions</link>
  </region>

  <region name="main">
    <h id="issue-title">Checkout flow fails on Safari</h>
    <btn id="btn-issue-state">Open</btn>
    <link id="lnk-author" href="/nadeem">nadeem</link>
    <btn id="btn-edit-title">Edit</btn>
    <btn id="btn-copy-link">Copy link</btn>

    <h id="comment-1-author">nadeem commented</h>
    <elt id="comment-1-body">Safari users cannot complete checkout after selecting Apple Pay.</elt>
    <btn id="btn-add-reaction">Add reaction</btn>
    <btn id="btn-comment-menu">Comment options</btn>

    <inp id="comment-box" type="textarea">Leave a comment</inp>
    <btn id="btn-comment">Comment</btn>
    <btn id="btn-close-issue">Close issue</btn>
  </region>

  <region name="aside">
    <btn id="btn-assignees">Assignees</btn>
    <btn id="btn-labels">Labels</btn>
    <btn id="btn-projects">Projects</btn>
    <btn id="btn-milestone">Milestone</btn>
  </region>
</state>
```

### Linear-style issue list

```xml
<state step="1" title="Drisp · Linear" url="https://linear.app/drisp/team/CORE/active">
  <meta view="1440x900" scroll="0,0" layer="main" />
  <baseline reason="first" />

  <region name="nav">
    <link id="lnk-inbox" href="/inbox">Inbox</link>
    <link id="lnk-my-issues" href="/my-issues">My issues</link>
    <link id="lnk-views" href="/views">Views</link>
    <link id="lnk-roadmaps" href="/roadmaps">Roadmaps</link>
    <link id="lnk-projects" href="/projects">Projects</link>
  </region>

  <region name="main">
    <h id="hd-active-issues">Active issues</h>
    <btn id="btn-new-issue">New issue</btn>
    <btn id="btn-display-options">Display options</btn>
    <btn id="btn-filter">Filter</btn>

    <h id="grp-in-progress">In Progress</h>
    <elt id="issue-core-61" kind="row">CORE-61 Operations console</elt>
    <elt id="issue-core-62" kind="row">CORE-62 GitHub Actions CI pipeline</elt>

    <h id="grp-todo">Todo</h>
    <elt id="issue-core-47" kind="row">CORE-47 KYB Step 2</elt>
    <elt id="issue-core-63" kind="row">CORE-63 Fix Biome config drift</elt>
  </region>
</state>
```

### Payments dashboard

```xml
<state step="1" title="Payments · Dashboard" url="https://dashboard.example.com/payments">
  <meta view="1440x900" scroll="0,0" layer="main" />
  <baseline reason="first" />

  <region name="nav">
    <link id="lnk-home" href="/dashboard">Home</link>
    <link id="lnk-payments" selected="true" href="/payments">Payments</link>
    <link id="lnk-customers" href="/customers">Customers</link>
    <link id="lnk-products" href="/products">Products</link>
    <link id="lnk-reports" href="/reports">Reports</link>
  </region>

  <region name="main">
    <h id="hd-payments">Payments</h>
    <btn id="btn-create-payment">Create payment</btn>
    <btn id="btn-export">Export</btn>
    <inp id="inp-search-payments" type="search">Search payments</inp>
    <btn id="btn-filter-status">Status</btn>
    <btn id="btn-filter-date">Date</btn>

    <elt id="payment-row-1" kind="row">₹12,500 succeeded nadeem@example.com Jun 6</elt>
    <elt id="payment-row-2" kind="row">₹8,999 failed client@example.com Jun 6</elt>
    <elt id="payment-row-3" kind="row">₹2,400 refunded test@example.com Jun 5</elt>
  </region>
</state>
```

---

## Tool surface

Agent Web Interface exposes MCP tools across the main phases of browser use.

### Session

- `list_pages`
- `close_page`

### Navigation

- `navigate`
- `go_back`
- `go_forward`
- `reload`

### Observation

- `snapshot`
- `find`
- `get_element`
- `screenshot`

### Interaction

- `click`
- `type`
- `press`
- `select`
- `hover`
- `scroll_to`
- `scroll`
- `drag`
- `wheel`

### Forms

- `get_form`
- `get_field`

### Canvas

- `inspect_canvas`

### Content

- `read_page`

### Network

- `list_network_calls`
- `search_network_calls`

---

## Quickstart

Run the interactive installer — it auto-detects which AI tools you have installed and registers the MCP server and agent skill in one step:

```bash
npx agent-web-interface install
```

Then ask your AI to use the browser:

```text
Open https://example.com and summarize the main actions available to a user.
```

### Target a specific harness

```bash
# Claude Code (also installs the agent skill)
npx agent-web-interface install --harness claude-code

# Cursor
npx agent-web-interface install --harness cursor

# VS Code
npx agent-web-interface install --harness vscode

# Claude Desktop (MCP only — no skill placement)
npx agent-web-interface install --harness claude-desktop

# Multiple at once
npx agent-web-interface install --harness cursor,vscode

# All detected harnesses
npx agent-web-interface install --harness all
```

### Install flags

| Flag                       | Description                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `--harness <id\|all\|csv>` | Target harness(es): `claude-code`, `cursor`, `vscode`, `claude-desktop`, `all`, or comma-separated |
| `--scope project\|user`    | Where to write the config (default: `project`)                                                     |
| `--global`                 | Alias for `--scope global`                                                                         |
| `--project`                | Alias for `--scope project`                                                                        |
| `--browser-mode <mode>`    | Browser mode: `auto` (default), `user`, `persistent`, `isolated`                                   |
| `--headless`               | Launch Chrome in headless mode                                                                     |
| `--cdp-url <url>`          | Connect to an existing Chrome DevTools Protocol endpoint                                           |
| `--pin <version>`          | Register an exact version instead of `@latest`                                                     |
| `--dry-run`                | Preview changes without writing files                                                              |
| `--yes`                    | Skip interactive prompts (non-TTY mode)                                                            |

### Check installation status

```bash
npx agent-web-interface doctor
```

Prints a per-harness status table showing whether the MCP server is registered and whether the agent skill is installed.

### Skill-only installation (advanced)

The [`agent-web-interface`](skills/agent-web-interface/SKILL.md) skill can also be installed independently — without the MCP server — using [`npx skills`](https://github.com/vercel-labs/skills):

```bash
npx skills add lespaceman/agent-web-interface
```

This copies only the skill into your agent's `skills/` directory. You still need to register the MCP server separately (the `install` command above does both). `npx skills` is intentionally kept as a supported alternative for skill-only workflows — see [ADR-0003](docs/adr/0003-keep-npx-skills-alongside-installer.md).

---

## Manual setup (Claude Desktop / Cursor / VS Code)

If you prefer to edit config files manually, add the server under the appropriate key:

```json
{
  "mcpServers": {
    "agent-web-interface": {
      "command": "npx",
      "args": ["agent-web-interface@latest"]
    }
  }
}
```

VS Code uses `servers` instead of `mcpServers` and requires `"type": "stdio"`:

```json
{
  "servers": {
    "agent-web-interface": {
      "type": "stdio",
      "command": "npx",
      "args": ["agent-web-interface@latest"]
    }
  }
}
```

To force connection to your existing Chrome session:

```json
{
  "mcpServers": {
    "agent-web-interface": {
      "command": "npx",
      "args": ["agent-web-interface@latest"],
      "env": {
        "AWI_BROWSER_MODE": "user"
      }
    }
  }
}
```

---

## Browser modes

Browser initialization happens automatically on the first browser tool call.

Set `AWI_BROWSER_MODE` to control how Chrome is started.

| Mode         | Behavior                                             | Profile                                       |
| ------------ | ---------------------------------------------------- | --------------------------------------------- |
| unset        | Auto: try `user`, then `persistent`, then `isolated` | Depends on fallback                           |
| `user`       | Connect to your running Chrome                       | Chrome's default profile                      |
| `persistent` | Launch Chrome with a dedicated persistent profile    | `~/.cache/agent-web-interface/chrome-profile` |
| `isolated`   | Launch Chrome with a temporary clean profile         | Deleted on close                              |

Examples:

```bash
# Auto mode
npx agent-web-interface

# Always connect to existing Chrome
AWI_BROWSER_MODE=user npx agent-web-interface

# Always launch with persistent profile
AWI_BROWSER_MODE=persistent npx agent-web-interface

# Headless isolated browser
AWI_BROWSER_MODE=isolated AWI_HEADLESS=true npx agent-web-interface
```

### Stealth (`AWI_STEALTH`)

Launched browsers (`persistent`/`isolated`) carry Puppeteer's automation tells —
`navigator.webdriver`, the "controlled by automated test software" infobar, an empty
plugins list — which some sites use to false-positive a legitimate session as a bot.
`AWI_STEALTH` (default `true`) applies **fingerprint-only** patches so a launched Chrome
looks like your everyday Chrome. It changes nothing about behavior (clicks and typing are
untouched) and is a **no-op in `user` mode**, where the connected Chrome already has a
genuine fingerprint.

```bash
# Disable stealth (raw Puppeteer fingerprint)
AWI_STEALTH=false AWI_BROWSER_MODE=isolated npx agent-web-interface
```

This is not a CAPTCHA or anti-bot bypass tool — it only avoids false-positive blocking of
ordinary, authorized use.

---

## Using your existing Chrome

To connect Agent Web Interface to your regular Chrome profile:

1. Open Chrome.
2. Navigate to `chrome://inspect/#remote-debugging`.
3. Enable remote debugging and allow the connection.
4. Start Agent Web Interface with `AWI_BROWSER_MODE=user`.

```bash
AWI_BROWSER_MODE=user npx agent-web-interface
```

This is useful when an agent needs access to an already authenticated browser session.

---

## CLI arguments

The server accepts transport-level arguments only. Browser configuration is controlled through environment variables.

| Argument      | Description                       | Default |
| ------------- | --------------------------------- | ------- |
| `--transport` | Transport mode: `stdio` or `http` | `stdio` |
| `--port`      | Port for HTTP transport           | `3000`  |

Examples:

```bash
# stdio transport
npx agent-web-interface

# HTTP transport
npx agent-web-interface --transport http --port 8080
```

---

## Environment variables

| Variable           | Description                                              | Default              |
| ------------------ | -------------------------------------------------------- | -------------------- |
| `AWI_BROWSER_MODE` | Browser mode: `user`, `persistent`, or `isolated`        | unset; auto fallback |
| `AWI_HEADLESS`     | Run browser headless: `true` or `false`                  | `false`              |
| `AWI_CDP_URL`      | Explicit CDP endpoint; overrides browser mode            | unset                |
| `AWI_TRIM_REGIONS` | Set to `false` to disable region trimming globally       | `true`               |
| `TRANSPORT`        | Transport mode override, for example `http`              | unset                |
| `HTTP_HOST`        | Host for HTTP transport                                  | `127.0.0.1`          |
| `HTTP_PORT`        | Port for HTTP transport                                  | `3000`               |
| `LOG_LEVEL`        | Logging level                                            | `info`               |
| `CEF_BRIDGE_HOST`  | CDP host for CEF bridge connection                       | `127.0.0.1`          |
| `CEF_BRIDGE_PORT`  | CDP port for CEF bridge connection                       | `9223`               |
| `BRING_TO_FRONT`   | Set to `true` to focus the Chrome tab before each action | `false`              |
| `CHROME_PATH`      | Path to Chrome executable                                | unset                |

---

## Directional benchmark results

Early internal comparisons against Playwright MCP show lower token usage and faster completion on representative browser-agent tasks.

Current directional results:

- Lower token usage on multi-step navigation tasks
- Faster task completion in common browsing workflows
- Same or better success rates in tested scenarios

These results are not yet a formal benchmark suite. They are task-dependent and should be treated as directional until the benchmark harness, task definitions, model versions, and raw traces are published.

---

## Architecture overview

Agent Web Interface separates browser automation into three layers.

### Browser lifecycle

Responsible for:

- Launching or connecting to Chrome
- Managing browser contexts
- Managing pages and tabs
- Preserving or isolating browser state depending on mode

### Semantic snapshot generation

Responsible for:

- Extracting DOM structure
- Reading accessibility metadata
- Resolving labels and roles
- Detecting page regions
- Tracking element state
- Producing compact agent-readable output

### Action resolution

Responsible for:

- Mapping stable `eid` values to browser nodes
- Executing clicks, typing, scrolling, keypresses, and selection
- Waiting for page stabilization
- Returning the next page state

This separation lets the browser implementation evolve while keeping the agent-visible interface stable.

---

## Development

Clone the repository:

```bash
git clone https://github.com/lespaceman/agent-web-interface
cd agent-web-interface
npm install
```

Build:

```bash
npm run build
```

Run locally:

```bash
npm start
```

Run in watch mode:

```bash
npm run dev
```

Run checks:

```bash
npm run check
```

Run tests:

```bash
npm test
```

Inspect with the MCP inspector:

```bash
npm run mcp:inspect
```

---

## Requirements

- Node.js 20 or newer
- Chrome or Chromium
- An MCP-compatible client such as Claude Code, Claude Desktop, Cursor, or VS Code

---

## Status

Agent Web Interface is under active development.

The public tool surface is intended to stay simple, but internal APIs and snapshot formats may evolve as real-world agent usage informs the design.

Feedback from practitioners building browser agents, coding agents, QA agents, and automation systems is especially welcome.

---

## License

MIT
