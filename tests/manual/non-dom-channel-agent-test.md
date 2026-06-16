# Non-DOM Channel — Agent MCP Test Script

This document drives a step-by-step manual MCP test of the non-DOM interaction channel.
Run it by pasting the steps into an agent that has access to the `agent-web-interface` MCP server.

## Prerequisites

Start a local HTTP server for the test page (from the repo root):

```bash
npx serve tests/manual -p 7777
# or
python3 -m http.server 7777 --directory tests/manual
```

The test page will be at: `http://localhost:7777/non-dom-channel.html`

---

## Step 0 — Navigate to the test page

```
Tool: navigate
  url: "http://localhost:7777/non-dom-channel.html"
```

**Expected:** Snapshot shows the page title "Non-DOM Interaction Channel" with sections for
Upload, Dialogs, Download, and Permission.

---

## Test 1a — Direct file input upload

```
Tool: find
  label: "Direct file input"
```

Copy the returned `eid`. Clicking a file input opens a synthetic non-DOM
file-picker surface instead of the native OS picker:

```
Tool: click
  eid: <eid from find>
```

**Expected:** Response includes a `<non_dom kind="file-picker">` surface with
`nd-picker-path` (input), `nd-picker-choose`, and `nd-picker-cancel`, plus
`<dom_blocked reason="file-picker" />`. No OS file picker opened.

Type the absolute host path into the synthetic path input, then choose:

```
Tool: type
  eid:  "nd-picker-path"
  text: "/etc/hostname"        # any small readable file on the host

Tool: click
  eid: "nd-picker-choose"
```

**Expected:**

- Response includes a state snapshot (no error); the file-picker surface is cleared.
- The status box under "1a" shows `✓ Files received: hostname`.

---

## Test 1b — Styled button (hidden input behind a button)

First, attempt to click the styled button directly to see the guidance:

```
Tool: find
  label: "Upload File"
  kind:  "button"
```

```
Tool: click
  eid: <eid of "⬆ Upload File" button>
```

**Expected:** Clicking the styled button (which wraps a hidden file input) opens the synthetic
`<non_dom kind="file-picker">` surface directly. No native picker opened.

Complete the upload through the synthetic controls:

```
Tool: type
  eid:  "nd-picker-path"
  text: "/etc/hostname"

Tool: click
  eid: "nd-picker-choose"
```

**Expected:** Status box under "1b" shows the filename.

> Tip: if you instead click the hidden `<input type="file">` directly (via `find` →
> "Hidden file input behind styled button"), the same file-picker surface appears.

---

## Test 1c — Label-associated file input

```
Tool: find
  label: "Choose via Label"
```

```
Tool: click
  eid: <eid of label or labelled input>

Tool: type
  eid:  "nd-picker-path"
  text: "/etc/hostname"

Tool: click
  eid: "nd-picker-choose"
```

**Expected:** Status box under "1c" shows the filename. Clicking the label opens the picker
surface; choosing resolves the `for=` association to the real `<input type="file">`.

---

## Test 1d — Dropzone container

```
Tool: find
  label: "Dropzone file input"
```

```
Tool: click
  eid: <eid of dropzone input or drop-zone div>

Tool: type
  eid:  "nd-picker-path"
  text: "/etc/hostname"

Tool: click
  eid: "nd-picker-choose"
```

**Expected:** Status box under "1d" shows the filename.

---

## Test 1e — Multi-file input

For a multi-file picker, type one absolute path per line into `nd-picker-path`
(newline-separated), then choose:

```
Tool: find
  label: "Multiple file input"
```

```
Tool: click
  eid: <eid>

Tool: type
  eid:  "nd-picker-path"
  text: "/etc/hostname\n/etc/shells"   # two files, one per line

Tool: click
  eid: "nd-picker-choose"
```

**Expected:** Status box under "1e" shows both filenames.

**Negative test** — single-file picker with two paths:

```
Tool: click
  eid: <eid of "Direct file input" from 1a>

Tool: type
  eid:  "nd-picker-path"
  text: "/etc/hostname\n/etc/shells"

Tool: click
  eid: "nd-picker-choose"
```

**Expected:** Error mentioning "does not allow multiple files".

---

## Test 1f — Path validation errors

Open any file-picker surface (click a file input), then type an invalid path and choose:

```
Tool: type
  eid:  "nd-picker-path"
  text: "relative/path.txt"

Tool: click
  eid: "nd-picker-choose"
```

**Expected:** Error with `RELATIVE_PATH` — path must be absolute.

```
Tool: type
  eid:  "nd-picker-path"
  text: "/tmp/does-not-exist-xyz.txt"
  clear: true

Tool: click
  eid: "nd-picker-choose"
```

**Expected:** Error with `FILE_NOT_FOUND`.

---

## Test 2a — Alert dialog

```
Tool: find
  label: "Trigger alert()"
```

```
Tool: click
  eid: <eid>
```

**Expected:** After the click, the response includes a `<non_dom kind="dialog" dialog_type="alert">`
surface with an `nd-dialog-ok` control and `<dom_blocked reason="dialog" />`. The page is NOT
frozen — the surface holds the dialog open until you resolve it.

Now resolve it by clicking the synthetic OK control:

```
Tool: click
  eid: "nd-dialog-ok"
```

**Expected:** State response with the alert now cleared. Status box under "2a" shows
`✓ alert() dismissed successfully`.

---

## Test 2b — Confirm dialog

```
Tool: find
  label: "Trigger confirm()"
```

```
Tool: click
  eid: <eid>
```

**Expected:** A `<non_dom kind="dialog" dialog_type="confirm">` surface with `nd-dialog-ok`
(Accept) and `nd-dialog-dismiss` (Dismiss). Accept it:

```
Tool: click
  eid: "nd-dialog-ok"
```

**Expected:** Status box under "2b" shows `✓ confirm() accepted (result = true)`.

Run again and dismiss:

```
Tool: click
  eid: <eid of confirm button>
```

```
Tool: click
  eid: "nd-dialog-dismiss"
```

**Expected:** Status box shows `○ confirm() dismissed (result = false)`.

---

## Test 2c — Prompt dialog

```
Tool: find
  label: "Trigger prompt()"
```

```
Tool: click
  eid: <eid>
```

**Expected:** A `<non_dom kind="dialog" dialog_type="prompt">` surface with an `nd-dialog-input`
field plus `nd-dialog-ok` (Submit) and `nd-dialog-dismiss` (Cancel). Type the answer into the
synthetic input, then submit:

```
Tool: type
  eid:  "nd-dialog-input"
  text: "hello from the agent"

Tool: click
  eid: "nd-dialog-ok"
```

**Expected:** Status box under "2c" shows `✓ prompt() answered: "hello from the agent"`.

---

## Test 2d — Clicking a dialog control with no active surface

```
Tool: click
  eid: "nd-dialog-ok"
```

**Expected:** Error: "No active non-DOM surface." (the synthetic control is only valid while a
dialog surface is present).

---

## Test 3a — Download (configured via AWI_DOWNLOAD_DIR)

**Setup (before launching the server):** export the download directory as an
environment variable. There is no `set_download_behavior` tool — download routing
is infrastructure configured once at startup.

```
export AWI_DOWNLOAD_DIR="/tmp/agent-downloads"
```

The directory is validated (must be absolute) and created if missing when the
session starts. A non-absolute path fails startup with a clear error.

```
Tool: find
  label: "Download test.txt"
```

```
Tool: click
  eid: <eid>
```

**Expected:**

- Click resolves without hanging (no native save-as dialog).
- Status box under "3a" shows `⬇ Download triggered: test.txt`.
- File appears at `/tmp/agent-downloads/test.txt` on the browser host.

---

## Test 4a — Geolocation permission (grant then request)

First grant the permission:

```
Tool: grant_permission
  permissions: ["geolocation"]
  granted:     true
```

**Expected:** State response returned (no error).

Then click the request button:

```
Tool: find
  label: "Request Geolocation"
```

```
Tool: click
  eid: <eid>
```

**Expected:** Status box under "4a" shows coordinates (no permission prompt dialog appeared).

---

## Test 4b — Notifications permission (deny then request)

```
Tool: grant_permission
  permissions: ["notifications"]
  granted:     false
```

```
Tool: find
  label: "Request Notifications"
```

```
Tool: click
  eid: <eid>
```

**Expected:** Status box shows `○ Permission: denied` (no native permission prompt appeared).

---

## Verification Checklist

After running all tests, take a snapshot and read the "Overall Status" section:

```
Tool: find
  label: "Overall Status"
```

Or:

```
Tool: snapshot
```

All items in the result list should show ✓. Items showing ✗ indicate a regression.

| #   | Test Case                               | Expected outcome          |
| --- | --------------------------------------- | ------------------------- |
| 1a  | Direct file input upload                | Files received, no picker |
| 1b  | Click styled button → picker surface    | file-picker surface shown |
| 1b  | Upload via nd-picker controls           | Files received            |
| 1c  | Label-associated input                  | Resolver follows for=     |
| 1d  | Dropzone container                      | Resolver finds descendant |
| 1e  | Multi-file upload                       | Both files received       |
| 1f  | Relative path rejected                  | RELATIVE_PATH error       |
| 1f  | Non-existent path rejected              | FILE_NOT_FOUND error      |
| 2a  | Alert resolved via nd-dialog-ok         | Page unfrozen             |
| 2b  | Confirm accepted / dismissed            | Result reflected in page  |
| 2c  | Prompt answered via nd-dialog-input     | Text echoed in page       |
| 2d  | nd-dialog-ok with no active surface     | Helpful error             |
| 3a  | Download routed to configured directory | File appears on disk      |
| 4a  | Geolocation granted — no prompt         | Coordinates returned      |
| 4b  | Notifications denied — no prompt        | Permission: denied        |
