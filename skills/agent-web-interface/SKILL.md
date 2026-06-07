---
name: agent-web-interface
description: >
  Drive a real browser against a live or staging website with the agent-web-interface MCP tools (navigate, snapshot, click, type, find, get_form, screenshot, etc.). Load it whenever the task is to actually open a URL and observe or act on the running page: read live page state, click, type, fill or submit forms, walk flows like login/signup/search/add-to-cart/checkout, reproduce a bug at a given URL, screenshot the live page, or extract reliable selectors from a running page for automation. Trigger even for a single action ("open this page", "click that button on the site"), even when no URL is named but the target is clearly a live page, and on subagent dispatch with browser MCP access — when in doubt, load it. Do NOT load it for writing or styling UI code, fixing or reviewing form/auth/checkout code, authoring test files, or explaining how web tech works — those mention forms, buttons, or pages but need no live browser.
allowed-tools: mcp__agent-web-interface__navigate mcp__agent-web-interface__snapshot mcp__agent-web-interface__find mcp__agent-web-interface__get_element mcp__agent-web-interface__scroll_to mcp__agent-web-interface__scroll mcp__agent-web-interface__click mcp__agent-web-interface__type mcp__agent-web-interface__press mcp__agent-web-interface__select mcp__agent-web-interface__hover mcp__agent-web-interface__get_form mcp__agent-web-interface__get_field mcp__agent-web-interface__list_pages mcp__agent-web-interface__drag
user-invocable: true
argument-hint: "<url> <goal> — e.g. https://example.com 'Add item to cart'"
---

# Agent Web Interface Guide

Use this skill to open live web pages, carry out actions, move through multi-step flows, validate page state, and capture selectors for automation.

Common uses:

- Review a live page or multi-step flow
- Click through navigation, buttons, dialogs, and other actions
- Fill, submit, or inspect forms and validation states
- Add products to cart or complete other in-page actions
- Capture reliable Playwright selectors for key elements

## Setup

This skill drives the **agent-web-interface** MCP server — installing the skill does **not** install that server. If the `mcp__agent-web-interface__*` tools aren't available, add the server first:

```bash
claude mcp add agent-web-interface -- npx agent-web-interface@latest
```

For Claude Desktop / Cursor / VS Code, register it under the key `agent-web-interface`:

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

See the [agent-web-interface README](https://github.com/lespaceman/agent-web-interface) for browser modes (`user`, `persistent`, `isolated`) and options.

**Why this skill must load before browser MCP calls:** without it, browser work reliably produces brittle CSS selectors, narrative prose instead of structured observations, missed state transitions, and shallow page coverage. The selector-capture and state-observation patterns below are what the downstream exploration report, spec generation, and test-writing skills depend on.

**Subagent dispatch:** when a subagent is dispatched with browser MCP access, this is the first skill it should load — the exploration upstream of spec generation and test writing depends on the patterns below.

## Input

Parse the target URL and exploration goal from: $ARGUMENTS

## Workflow

1. **Navigate or recover the right page** — use `list_pages` and explicit `page_id` when session state may be ambiguous
2. **Orient first** — read the current state, active region, and visible controls before acting
3. **Choose the lightest useful tool**
   - Use page state or `snapshot` output for quick orientation
   - Use `find` with `label`, `kind`, and `region` to narrow targets
   - Use `get_form` when the task is clearly form-driven
   - Use `get_element` for a chosen target, offsets, or selector extraction
4. **Act one step at a time** — click, type, select, scroll, or drag only as needed to advance the task
5. **Reacquire state after meaningful changes** — after navigation, overlays, search expansion, dialog opening, or large DOM updates, refresh your understanding before reusing old `eid`s
6. **Inspect forms or extract selectors only when relevant** — do this when asked for them or when they materially help complete the task
7. **Report** what you did, what happened, and any selectors or form details that matter

## Output Format

Always include:

1. **What you accomplished** — the result, finding, or outcome
2. **Steps taken** — pages visited, buttons clicked, forms filled
3. **Observations** — notable page states, messages, and behaviors
4. **Selectors** (when relevant) — Playwright-compatible selectors for key elements
5. **Form details** (when relevant) — only include when they helped drive the task

## Operating Heuristics

- Prefer `find` over manual scanning when snapshots are trimmed or the page is dense
- Filter `find` aggressively with `kind`, `label`, and `region` before broad exploration
- Expect search UIs to appear as buttons or comboboxes before they expose a text field
- Expect overlays, drawers, and dialogs to mutate the page in place without changing the URL
- Treat `eid`s as short-lived after large mutations; reacquire targets instead of assuming old ids still work
- Trust `get_form` as a helper, not as ground truth; busy pages may contain multiple unrelated forms
- Use `observations`, `baseline`, and `diff` to confirm whether an action actually changed the page
- Prefer sequential progress on gated flows; if a control is disabled, look for the prerequisite choice above it

## State Snapshot Structure

Every navigation or action returns a `<state>` snapshot:

```xml
<state step="N" title="Page Title" url="https://...">
  <meta view="1521x752" scroll="0,0" layer="main" />
  <baseline reason="first|navigation" />
  <diff type="mutation" added="N" removed="N" />
  <observations>...</observations>
  <region name="main">...</region>
</state>
```

### Key Elements

| Element                   | Purpose                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `<meta>`                  | Viewport size, scroll position, active layer                             |
| `<baseline reason="...">` | Fresh snapshot - `"first"` (initial load) or `"navigation"` (URL change) |
| `<diff type="mutation">`  | Incremental update with `added`/`removed` counts                         |
| `<observations>`          | What appeared/disappeared after the action                               |
| `<region>`                | Semantic page areas with interactive elements                            |

## Observations

After actions (click, type, select), watch for changes:

```xml
<observations>
  <appeared when="action">Your Bag is empty</appeared>
  <appeared when="action" role="status"></appeared>
  <disappeared when="action" role="status"></disappeared>
</observations>
```

- `<appeared>`: New content visible after action
- `<disappeared>`: Content removed after action
- `role` attribute: Semantic role (status, alert, dialog)

## Regions

Page content is organized into semantic regions:

```xml
<region name="main">
  <link id="..." href="...">Link text</link>
  <btn id="...">Button text</btn>
  <!-- trimmed 50 items. Use find with region=main to see all -->
</region>
<region name="nav" unchanged="true" count="90" />
```

### Region Types

- `main` - Primary content area
- `nav` - Navigation menus
- `header` - Page header
- `footer` - Page footer
- `form` - Form containers
- `aside` - Sidebars
- `search` - Search areas

### Optimization Hints

- `unchanged="true" count="N"` - Region didn't change, shows element count
- `<!-- trimmed N items -->` - Use `find` with `region` filter to see all

## Element Types in Snapshots

| Tag      | Element         | Key Attributes                                        |
| -------- | --------------- | ----------------------------------------------------- |
| `<link>` | Hyperlink       | `id`, `href`                                          |
| `<btn>`  | Button          | `id`, `val`, `enabled`                                |
| `<rad>`  | Radio button    | `id`, `val`, `checked`, `focused`                     |
| `<sel>`  | Dropdown/select | `id`, `expanded`, `focused`                           |
| `<elt>`  | Input/generic   | `id`, `type`, `val`, `focused`, `enabled`, `selected` |

### Common Attributes

| Attribute         | Meaning                                           |
| ----------------- | ------------------------------------------------- |
| `id`              | Element ID (eid) - use this to target the element |
| `enabled="false"` | Element is disabled (common in sequential forms)  |
| `checked="true"`  | Radio/checkbox is selected                        |
| `focused="true"`  | Element has keyboard focus                        |
| `expanded="true"` | Dropdown is open                                  |
| `selected="true"` | Option/tab is selected                            |
| `val`             | Element value                                     |

## Progressive Enablement Pattern

Many sites use progressive enablement: later options stay disabled until earlier choices are made.

```xml
<!-- Step 1: Model selection enabled -->
<rad id="model1" val="pro">iPhone 17 Pro</rad>
<rad id="color1" enabled="false" val="silver">Silver</rad>  <!-- disabled -->

<!-- After selecting model, colors become enabled -->
<rad id="model1" checked="true" val="pro">iPhone 17 Pro</rad>
<rad id="color1" val="silver">Silver</rad>  <!-- now enabled -->
```

Common places this appears:

- Ecommerce product configuration
- Checkout and payment flows
- Onboarding wizards
- Settings pages with dependent options

**Strategy**: If you see `enabled="false"`, work upward to identify and complete the prerequisite step before continuing.

## find Response

```xml
<result type="find" page_id="..." snapshot_id="..." count="N">
  <match eid="abc123"
         kind="button|link|radio|checkbox|textbox|combobox|heading|image"
         label="Button text"
         region="main|nav|header|footer"
         selector="role=button[name=&quot;...&quot;]"
         visible="true"
         enabled="true"
         href="..." />
</result>
```

### Filter Parameters

- `kind`: Element type filter
- `label`: Case-insensitive substring match
- `region`: Restrict to semantic area
- `limit`: Max results (default 10)
- `include_readable`: Include text content (default true)

## get_element Response

```xml
<node eid="abc123" kind="link" region="main" group="tbody-28"
      x="147.875" y="11.5" w="97.97" h="16.5"
      display="inline" zone="top-left">
  Element label text
  <selector primary='role=link[name="..."]' />
  <attrs href="..." />
</node>
```

- `primary`: Best Playwright selector
- Position info: `x`, `y`, `w`, `h`, `zone`
- `group`: Logical grouping (for tables, lists)

## get_form Response

```xml
<forms page="page-id">
  <form id="form-xxx" intent="search|login|signup|checkout" completion="100%">
    <input eid="748" purpose="search">Search Wikipedia</input>
    <combobox eid="750" purpose="selection" filled="true">EN</combobox>
    <button eid="820" type="submit" primary="true">Search</button>
    <next eid="748" reason="Optional field" />
  </form>
</forms>
```

- `intent`: Form purpose (search, login, checkout, etc.)
- `completion`: Percentage filled
- `next`: Suggested next field to fill with reason

## list_pages Response

```xml
<result type="list_pages" status="success">
  <pages count="N">
    <page page_id="page-xxx" url="https://..." title="Page Title" />
  </pages>
</result>
```

Use `page_id` to target specific browser tabs.

## Session Recovery

The browser persists across conversation sessions — tabs from prior sessions remain open. On a new session, there is no "current" page; actions without `page_id` may target an arbitrary tab.

When encountering a "no page/session" error or resuming from a prior session:

1. Call `list_pages` to see all open tabs with `page_id`, URL, and title
2. Identify the target page by URL or title
3. Pass `page_id` explicitly to all subsequent calls (`snapshot`, `find`, `click`, etc.)
4. If the page is not found, navigate fresh — the tab may have been closed

**Caveats:**

- **Stale tab URLs**: `list_pages` shows the URL at open time. For SPAs, use `snapshot` with `page_id` to see actual current state.
- **Tab accumulation**: The browser accumulates tabs across sessions. Always use `page_id` to target the correct one.
- **Single active work tab assumptions**: Do not assume you have multiple useful tabs open. Check `list_pages` instead of relying on prior turn memory.

## Error Responses

```xml
<error>Field not found in any form: abc123</error>
```

Common errors:

- Element ID not found (page may have changed)
- Element not visible/enabled
- Form field not in any form context
- No page/session (see Session Recovery above)

When this happens:

1. Re-check the current page state
2. Re-run `find` or `get_form` from the latest state
3. Continue only with fresh `eid`s

## Canvas Interactions

`<canvas>` elements render pixels, not DOM nodes — standard selectors don't work inside them. Use these tools for canvas-based UIs (drawing apps, games, visualizations):

- **`inspect_canvas`** — the key tool. Pass a canvas `eid` and it auto-detects the rendering library (Fabric.js, Konva, PixiJS, Phaser, Three.js, EaselJS, or raw canvas), queries the scene graph for objects with positions/sizes/labels, and returns an annotated screenshot with coordinate grid overlay and bounding boxes. Supports configurable `grid_spacing` (use 10px for precise handle targeting).
- **`click`** with `eid` + `x`/`y` — click at offset relative to canvas top-left (e.g., select a shape)
- **`drag`** with `eid` + source/target coordinates — drag within canvas (e.g., move objects, scale/rotate handles)
- **`screenshot`** with `eid` — capture just the canvas to visually verify state

**Workflow:** `find` → `get_element` (position) → `inspect_canvas` (discover objects) → `click`/`drag` (interact) → re-inspect to verify.

## Best Practices

1. **Use `find`** when snapshot shows `<!-- trimmed -->`
2. **Track `<baseline>` vs `<diff>`** to know if you have full or partial state
3. **Always pass `page_id`** when working across sessions or with multiple tabs
4. **Reacquire targets after large mutations** instead of reusing stale `eid`s
5. **Keep selector extraction optional** unless the task asks for it or automation handoff is part of the outcome

## Example Usage

```
/agent-web-interface https://airbnb.com Walk through the search and booking flow for stays in Tokyo

/agent-web-interface https://apple.com/store Configure an iPhone and add it to the bag, then summarize the steps

/agent-web-interface https://developer.mozilla.org Find the Fetch API docs and note how the search flow behaves

/agent-web-interface https://example.com/login Extract the login form selectors and field purposes
```
