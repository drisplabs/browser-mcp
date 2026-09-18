# Upload Files With Click and Type

Drisp Browser has **no `upload` tool**. It was removed in **v4.6.5** (non-DOM surface model, PRs #86–#92) and replaced by a click-driven flow: clicking an upload control opens a synthetic **file-picker surface**, and you drive it with the ordinary `click` and `type` tools against `nd-picker-*` element IDs.

## TL;DR

```js
click({ eid: '<upload-control-eid>' }); //  → <non_dom kind="file-picker">
type({ eid: 'nd-picker-path', text: '/absolute/path/to/file.pdf', clear: true });
click({ eid: 'nd-picker-choose' });
```

## How the picker surface appears

Clicking an upload control returns the normal `<state>` response plus a non-DOM block:

```xml
<non_dom kind="file-picker" modal="true" mode="selectSingle">
  <ctrl eid="nd-picker-path"   kind="input"  label="File path" placeholder="Absolute path on browser host..." />
  <ctrl eid="nd-picker-choose" kind="button" label="Choose" />
  <ctrl eid="nd-picker-cancel" kind="button" label="Cancel" />
</non_dom>
<dom_blocked reason="file-picker" />
```

`<dom_blocked>` means DOM interaction is suspended until you choose or cancel.

Two ways the surface is produced:

| Target you click                                                           | What happens                                                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| An `input[type=file]` that is in the snapshot                              | Fast path — the surface is built directly from the node, no real click is dispatched and no native picker opens      |
| An indirect trigger (styled button, `<label for>`, dropzone, hidden input) | The real click is dispatched, Chrome emits `Page.fileChooserOpened`, the server intercepts it and builds the surface |

Either way you get the same `nd-picker-*` controls, so target whatever is actually visible and labelled ("Choose file", "Attach", "Upload", a dropzone) — you do not need to hunt for the underlying input.

`mode="selectMultiple"` means the input carries the `multiple` attribute.

## Single file

```js
click({ eid: '<upload-button-or-input-eid>' });

type({
  eid: 'nd-picker-path',
  text: '/absolute/path/to/file.txt',
  clear: true,
});

click({ eid: 'nd-picker-choose' });
```

`type` on `nd-picker-path` only updates the surface's stored value — nothing is sent to the page until `nd-picker-choose`. Use `clear: true` so you replace rather than append to a previously typed path.

## Multiple files

Only when the surface reports `mode="selectMultiple"`. One absolute path per line:

```js
click({ eid: '<multi-file-input-eid>' });

type({
  eid: 'nd-picker-path',
  text: '/absolute/path/a.txt\n/absolute/path/b.txt',
  clear: true,
});

click({ eid: 'nd-picker-choose' });
```

Passing more than one path to a single-file picker is rejected — it does not silently upload the first one.

## Cancel

```js
click({ eid: 'nd-picker-cancel' });
```

This sends an empty file list to the intercepted chooser, which is what releases Chrome. Do not "escape" a picker by clicking elsewhere on the page — resolve it with `nd-picker-choose` or `nd-picker-cancel`.

## Path rules

Every path must be:

- **Absolute** — relative paths are rejected outright.
- **An existing regular file** — directories and special files are rejected.
- **Resolvable on the browser host**, i.e. the machine or container where Chrome runs.

Paths are validated with `fs.stat` on the **MCP server's** filesystem, but the file is handed to Chrome via `DOM.setFileInputFiles`, which reads it on the **browser host**. That only lines up when the two share a filesystem — the co-location precondition recorded in [ADR-0001](adr/0001-co-location-precondition-for-uploads.md). With a remote or containerized Chrome, stage the file into a path that resolves inside that container first.

### Restricting what can be uploaded

`UPLOAD_ALLOWED_ROOTS` (colon-separated absolute directories) bounds which files an agent can push into a web form. Unset means no restriction.

```bash
UPLOAD_ALLOWED_ROOTS=/Users/me/uploads:/tmp/agent-files
```

Symlinks are dereferenced (`realpath`) before the check, so a symlink inside an allowed root pointing outside it does not bypass the guard.

## Errors and what to do

Path problems surface as `File path validation failed: <message>`.

| Error                                              | Cause                                     | Fix                                                                    |
| -------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| `File path is empty`                               | `nd-picker-choose` clicked before typing  | `type` into `nd-picker-path` first                                     |
| `Path must be absolute on the browser host`        | Relative path                             | Use a full absolute path                                               |
| `File not found`                                   | Missing file, or Chrome runs elsewhere    | Verify the path resolves on the browser host; stage the file if remote |
| `Path is not a regular file`                       | Directory or special file                 | Point at a file                                                        |
| `File ... is outside the configured allowed roots` | `UPLOAD_ALLOWED_ROOTS` in effect          | Copy the file into an allowed root                                     |
| `This file picker does not allow multiple files`   | Several paths, `mode="selectSingle"`      | Send exactly one path                                                  |
| `No active non-DOM surface`                        | Surface already resolved, or never opened | `snapshot` to re-orient, then click the upload control again           |

## After choosing

The surface clears, the page stabilizes and a fresh `<state>` is returned. Confirm the upload landed the way the site reports it — a filename chip, a thumbnail, an enabled Submit button — with `find` or the returned observations, then continue with fresh DOM `eid`s.

## Migrating from the removed `upload` tool

| Before (≤ 4.6.4)                          | Now                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `upload({ eid, files: ['/a.pdf'] })`      | `click(eid)` → `type('nd-picker-path', '/a.pdf')` → `click('nd-picker-choose')` |
| Tool resolved the real `input[type=file]` | Resolution still happens server-side, behind the picker surface                 |
| `UPLOAD_ALLOWED_ROOTS`                    | Unchanged — same variable, same semantics                                       |

## Related

- [Handle Non-DOM Dialogs](handle-non-dom-dialogs.md) — same `nd-*` model for `alert` / `confirm` / `prompt`
- [ADR-0001: Uploads assume MCP server and browser are co-located](adr/0001-co-location-precondition-for-uploads.md)
