# Non-DOM Tool Surface Consolidation

## Task 1: Remove `upload` and `handle_dialog`

Type: AFK

Blocked by: None

### What to build

Remove the dedicated `upload` and `handle_dialog` MCP tools now that the normal `click` and `type` tools can operate on synthetic non-DOM controls:

- File picker: `nd-picker-path`, `nd-picker-choose`, `nd-picker-cancel`
- JavaScript dialog: `nd-dialog-ok`, `nd-dialog-dismiss`, `nd-dialog-input`

The non-DOM modules should remain; only the separate tool surface should go away.

### Acceptance criteria

- [ ] `upload` and `handle_dialog` are no longer registered in `tool-registration`.
- [ ] `UploadInputSchema` / `HandleDialogInputSchema` and output types are removed if no longer referenced.
- [ ] `upload-tool.ts` and `dialog-tool.ts` are removed or reduced to shared internals only if still needed.
- [ ] Skill docs, README, manual tests, and examples use `click` + `type` synthetic controls instead of the removed tools.
- [ ] Unit/integration coverage proves single-file upload, multi-file upload, alert, confirm, and prompt work through `click` + `type`.
- [ ] Removed tools do not appear in generated tool metadata or installed skill guidance.

## Plan 2: Permission Requests Through `click` and `type`

Goal: permission-gated flows should behave like dialogs and file pickers: the agent clicks the page control, sees a synthetic non-DOM permission surface, and responds with normal `click`.

### Proposed surface

```xml
<non_dom kind="permission" modal="true" permission="geolocation" origin="https://example.com">
  <ctrl eid="nd-permission-allow" kind="button" label="Allow" />
  <ctrl eid="nd-permission-deny" kind="button" label="Deny" />
</non_dom>
<dom_blocked reason="permission" />
```

For camera and microphone, include the requested permission set:

```xml
<non_dom kind="permission" modal="true" permissions="camera microphone" origin="https://example.com">
  <ctrl eid="nd-permission-allow" kind="button" label="Allow" />
  <ctrl eid="nd-permission-deny" kind="button" label="Deny" />
</non_dom>
```

### Implementation shape

- Add `permission` to `NonDomSurfaceKind`.
- Add `buildPermissionSurface()` and XML rendering for permission surfaces.
- Route `click({ eid: "nd-permission-allow" })` to CDP permission grant for the active origin.
- Route `click({ eid: "nd-permission-deny" })` to CDP permission deny for the active origin.
- Detect permission requests before they become invisible browser UI.
- Keep permission state per page/context so snapshots can append the pending surface.
- Support at least:
  - `geolocation`
  - `notifications`
  - `camera`
  - `microphone`
  - `clipboardRead`
  - `clipboardWrite`
- For geolocation, add deterministic test coordinates via environment config, for example:
  - `AWI_GEOLOCATION_LAT`
  - `AWI_GEOLOCATION_LON`
  - `AWI_GEOLOCATION_ACCURACY`
- For camera/microphone CI reliability, document or configure fake media device support separately from permission state.

### Detection strategy

CDP can set permission state, but the current code does not expose a live browser permission prompt as a non-DOM surface. The implementation should add page instrumentation for common permission APIs:

- `navigator.geolocation.getCurrentPosition`
- `navigator.geolocation.watchPosition`
- `Notification.requestPermission`
- `navigator.mediaDevices.getUserMedia`
- `navigator.clipboard.readText` / `writeText` where browser policy requires permission

When one of these APIs is invoked from a user-triggered action and permission state is not already decided, create a pending permission surface. The allow/deny click applies the CDP permission override, then resumes or retries the original API path.

### Acceptance criteria

- [ ] Clicking a geolocation request shows `nd-permission-allow` / `nd-permission-deny` when the permission is undecided.
- [ ] Allowing geolocation completes the page request deterministically with configured coordinates.
- [ ] Denying geolocation completes the page request with the page's normal denied/error path.
- [ ] Notifications can be allowed or denied through the same synthetic controls.
- [ ] Camera and microphone permission requests expose the requested permission set and allow/deny controls.
- [ ] No `grant_permission` tool is needed for the supported permissions.
- [ ] Manual non-DOM test page covers allow and deny paths.

## Plan 3: Replace `set_download_behavior` Tool With Environment Config

Goal: download destination is session configuration, not an agent action tool.

### Proposed environment variable

```sh
AWI_DOWNLOAD_DIR=/absolute/path/to/downloads
```

### Implementation shape

- Remove `set_download_behavior` from MCP tool registration and schemas.
- Read `AWI_DOWNLOAD_DIR` during browser/session setup.
- If `AWI_DOWNLOAD_DIR` is set:
  - validate it is an absolute path;
  - create it if missing, or fail startup with a clear error;
  - attach `DownloadManager` for every page/session;
  - call `Browser.setDownloadBehavior` automatically.
- If `AWI_DOWNLOAD_DIR` is unset:
  - keep Chrome's default download behavior;
  - still report page-visible download status when observable;
  - document that file location is browser-default and not deterministic.
- Surface completed downloads in action responses where possible so a normal `click` on a download button reports the saved path.

### Acceptance criteria

- [ ] `set_download_behavior` is no longer registered as an MCP tool.
- [ ] `AWI_DOWNLOAD_DIR` configures the download path for every page without an agent tool call.
- [ ] Downloads triggered by normal `click` land in `AWI_DOWNLOAD_DIR`.
- [ ] Existing download behavior remains usable when the env var is unset, but docs call it nondeterministic.
- [ ] README, skill docs, and manual tests describe env-var configuration instead of a tool call.
