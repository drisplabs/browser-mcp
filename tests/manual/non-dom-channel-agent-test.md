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

Copy the returned `eid`. Then:

```
Tool: upload
  eid: <eid from find>
  files: ["/etc/hostname"]        # any small readable file on the host
```

**Expected:**

- Response includes a state snapshot (no error).
- The status box under "1a" shows `✓ Files received: hostname`.
- No OS file picker opened.

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

**Expected:** The click response includes a `<file_input_guidance>` block telling you to use
the `upload` tool. No picker opened.

Now complete the upload correctly:

```
Tool: find
  label: "Hidden file input behind styled button"
```

```
Tool: upload
  eid: <eid of the hidden input>
  files: ["/etc/hostname"]
```

**Expected:** Status box under "1b" shows the filename.

---

## Test 1c — Label-associated file input

```
Tool: find
  label: "Choose via Label"
```

```
Tool: upload
  eid: <eid of label or labelled input>
  files: ["/etc/hostname"]
```

**Expected:** Status box under "1c" shows the filename. The resolver follows the `for=`
association to the real `<input type="file">`.

---

## Test 1d — Dropzone container

```
Tool: find
  label: "Dropzone file input"
```

```
Tool: upload
  eid: <eid of dropzone input or drop-zone div>
  files: ["/etc/hostname"]
```

**Expected:** Status box under "1d" shows the filename.

---

## Test 1e — Multi-file input

```
Tool: find
  label: "Multiple file input"
```

```
Tool: upload
  eid: <eid>
  files: ["/etc/hostname", "/etc/shells"]   # two files
```

**Expected:** Status box under "1e" shows both filenames.

**Negative test** — single-file input with two files:

```
Tool: upload
  eid: <eid of "Direct file input" from 1a>
  files: ["/etc/hostname", "/etc/shells"]
```

**Expected:** Error mentioning "does not allow multiple files".

---

## Test 1f — Path validation errors

```
Tool: upload
  eid: <any file input eid>
  files: ["relative/path.txt"]
```

**Expected:** Error with `RELATIVE_PATH` — path must be absolute.

```
Tool: upload
  eid: <any file input eid>
  files: ["/tmp/does-not-exist-xyz.txt"]
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

**Expected:** After the click, the snapshot/response includes a `<pending_dialog>` element
with `type="alert"` and `message="This is a test alert..."`.
The page is NOT frozen — the auto-dismiss policy kept it alive.

Now resolve it explicitly (or it was auto-dismissed):

```
Tool: handle_dialog
  action: "dismiss"
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

Then accept:

```
Tool: handle_dialog
  action: "accept"
```

**Expected:** Status box under "2b" shows `✓ confirm() accepted (result = true)`.

Run again and dismiss:

```
Tool: click
  eid: <eid of confirm button>
```

```
Tool: handle_dialog
  action: "dismiss"
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

```
Tool: handle_dialog
  action:       "accept"
  prompt_text:  "hello from the agent"
```

**Expected:** Status box under "2c" shows `✓ prompt() answered: "hello from the agent"`.

---

## Test 2d — handle_dialog with no pending dialog

```
Tool: handle_dialog
  action: "accept"
```

**Expected:** Error: "No pending JavaScript dialog."

---

## Test 3a — Download (set_download_behavior first)

```
Tool: set_download_behavior
  download_path: "/tmp/agent-downloads"
```

**Expected:** XML result confirming the download path is configured.

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
| 1b  | Click styled button → guidance returned | Guidance in response      |
| 1b  | Upload via hidden input                 | Files received            |
| 1c  | Label-associated input                  | Resolver follows for=     |
| 1d  | Dropzone container                      | Resolver finds descendant |
| 1e  | Multi-file upload                       | Both files received       |
| 1f  | Relative path rejected                  | RELATIVE_PATH error       |
| 1f  | Non-existent path rejected              | FILE_NOT_FOUND error      |
| 2a  | Alert dismissed via handle_dialog       | Page unfrozen             |
| 2b  | Confirm accepted / dismissed            | Result reflected in page  |
| 2c  | Prompt answered with text               | Text echoed in page       |
| 2d  | handle_dialog with no dialog pending    | Helpful error             |
| 3a  | Download routed to configured directory | File appears on disk      |
| 4a  | Geolocation granted — no prompt         | Coordinates returned      |
| 4b  | Notifications denied — no prompt        | Permission: denied        |
