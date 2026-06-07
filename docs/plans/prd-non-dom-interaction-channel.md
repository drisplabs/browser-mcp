## Problem Statement

As an AI agent driving a browser through this MCP server, I can _see_ certain interactions but I cannot _perform_ them, and worse, attempting them silently wedges the page.

The clearest example is file upload. A file input is fully observable in a snapshot — it shows up with `kind: input`, `input_type: file`, and the form layer infers a `file` purpose — but there is no tool that can put a file into it. If the agent clicks the input (or an "Upload" button wired to one), the browser opens the **native OS file picker**. That dialog is OS chrome, not page DOM: it is invisible to snapshots, unreachable by `click`/`type`, and it blocks the page until a human intervenes. The agent is stuck with no way forward and no signal explaining why.

The same class of problem exists for every interaction that lives _outside_ the DOM:

- **JavaScript dialogs** (`alert`, `confirm`, `prompt`, `beforeunload`) freeze the page and all subsequent CDP page interaction until answered.
- **Native file picker** — described above.
- **Download prompts** — a click that triggers a download has nowhere to put the file and no way to confirm it happened.
- **Permission prompts** (camera, mic, geolocation, clipboard, notifications) silently block flows that depend on them.
- **HTTP basic-auth dialogs** stop navigation cold.
- **Certificate, print, save-password, translate, and external-protocol prompts** — assorted native UI the agent cannot touch.

There is also a latent integrity bug: the legacy tool catalog (`src/config/tools.json`) still advertises an `act_upload` tool with wording about "allowed directories," but that tool was never wired into the live MCP registration. The catalog promises a capability the server does not have.

## Solution

Introduce a **non-DOM interaction channel**: a coherent set of capabilities, separate from the snapshot/element-action path, for everything that happens outside the page DOM.

The guiding principle is: **prevent native UI from appearing when possible, handle protocol events when it does, and never depend on clicking OS-native chrome.**

From the agent's perspective:

1. **Upload** — Instead of clicking a file input and getting stuck, the agent calls an `upload` tool with a target element and one or more file paths. The server resolves the real `<input type="file">` (even when the agent targeted a styled button, label, or dropzone), sets the files via CDP, fires the events frameworks expect, and returns a fresh snapshot. Clicking a file input no longer hangs the page — the file chooser is intercepted and the agent is told to use `upload`.

2. **JavaScript dialogs** — When a page raises an `alert`/`confirm`/`prompt`/`beforeunload`, the server captures it, prevents the deadlock with a safe default policy, and reports the pending dialog in the action response. The agent resolves it explicitly with a `handle_dialog` tool (accept / dismiss / supply prompt text).

3. **Downloads** — Downloads are routed to a known directory on the browser host and tracked, so a download-triggering click resolves cleanly and the agent can see what was produced.

4. **Permissions** — The agent can pre-grant or deny browser permissions for the active origin so permission-gated flows proceed deterministically.

5. **HTTP basic auth** — Auth challenges are answered via the CDP Fetch domain using credentials supplied through policy, rather than a blocking native dialog.

6. **Visibility** — Every action response surfaces any pending non-DOM prompt, so the agent always knows _why_ a page is blocked and which tool unblocks it.

## User Stories

1. As an AI agent, I want an `upload` tool that accepts an element target and file paths, so that I can complete a file upload without ever touching the native picker.
2. As an AI agent, I want to target a styled "Upload" button or dropzone and still have the real hidden `<input type="file">` resolved automatically, so that I don't need to find the hidden input myself.
3. As an AI agent, I want to target a `<label for="...">` and have the associated file input resolved, so that label-driven upload widgets work.
4. As an AI agent, I want to upload multiple files in one call when the input has the `multiple` attribute, so that multi-file uploads work in a single action.
5. As an AI agent, I want a clear, actionable error when I try to upload more than one file to a single-file input, so that I can correct the call.
6. As an AI agent, I want `input`/`change` events dispatched after files are set, so that React/Vue/Angular apps register the upload.
7. As an AI agent, I want a fresh snapshot returned after upload, so that I can see the page's reaction (preview, filename, validation message).
8. As an AI agent, I want clicking a file input or upload control to NOT open and hang on the native picker, so that a wrong tool choice doesn't wedge the session.
9. As an AI agent, when I click a file input, I want the response to tell me to use the `upload` tool instead, so that I recover without guessing.
10. As an AI agent, I want file paths validated before they reach the browser (exists, is a file, absolute, within allowed roots), so that I get a precise error instead of a silent CDP failure.
11. As an AI agent, I want a clear error when a path does not exist on the browser host, so that I understand path-locality failures in remote/containerized Chrome.
12. As an AI agent, I want the upload to resolve the file input in the correct frame/CDP session, so that uploads inside iframes work.
13. As an AI agent, I want a JavaScript `alert` to be captured and reported rather than freezing the page, so that I am never stuck on an invisible dialog.
14. As an AI agent, I want a `handle_dialog` tool to accept or dismiss a pending dialog, so that I can drive `confirm`/`beforeunload` flows.
15. As an AI agent, I want to supply text when resolving a `prompt` dialog, so that I can answer JavaScript prompts.
16. As an AI agent, I want a safe default dialog policy (auto-dismiss to prevent deadlock) until I explicitly handle one, so that pages never hang indefinitely.
17. As an AI agent, I want every action response to include any pending dialog state, so that I know a dialog is blocking me and which tool clears it.
18. As an AI agent, I want downloads routed to a known directory on the browser host, so that a download-triggering click resolves and I can locate the file.
19. As an AI agent, I want download activity tracked and reported, so that I can confirm a download started and completed.
20. As an AI agent, I want to pre-grant or deny permissions (camera, mic, geolocation, clipboard, notifications) for the active origin, so that permission-gated flows are deterministic.
21. As an AI agent, I want HTTP basic-auth challenges answered from supplied credentials, so that navigation past auth walls does not require a native dialog.
22. As an AI agent, I want native browser chrome (save-password, translate, print) suppressed via launch configuration, so that it never interferes with automation.
23. As an AI agent, I want the print path to use `Page.printToPDF` rather than the native print dialog, so that "print" flows are automatable.
24. As a developer, I want the stale `act_upload` entry in the legacy tool catalog reconciled with the real registered tool surface, so that the catalog stops promising a capability that does not exist.
25. As a developer, I want upload and dialog logic factored into deep, independently testable modules, so that the behavior can be verified without a live browser.
26. As a developer, I want a single place that wires non-DOM prompt listeners during page setup, so that every page (launched, connected, or newly opened) gets consistent handling.
27. As a developer, I want non-DOM prompt state stored separately from snapshots, so that the snapshot remains a pure representation of page DOM.
28. As a security-conscious operator, I want uploads restricted to configured allowed roots, so that the agent cannot exfiltrate arbitrary host files into a web form.
29. As a security-conscious operator, I want a documented default policy that auto-dismisses unknown/unsafe prompts, so that the agent does not accidentally accept dangerous native prompts.
30. As an AI agent, I want consistent behavior across headed, headless, local, and CI Chrome, so that upload and dialog handling are reliable wherever the browser runs.
31. As an AI agent, when an upload target is not and does not contain a file input, I want a clear error, so that I do not mistake a non-upload element for an upload control.
32. As a developer, I want the `upload` tool's input schema to reject malformed input (missing files, empty array, non-string paths), so that bad calls fail fast with a helpful message.

## Implementation Decisions

### New tools vs. behavioral modifications (answers the core scoping question)

This PRD introduces **new tools** AND **modifies the behavior of existing tools/responses**. The split:

**New tools (added to the live MCP registration):**

- `upload` — set one or more files on a (possibly indirectly targeted) file input.
- `handle_dialog` — resolve a pending JavaScript dialog (accept / dismiss / optional prompt text).
- `grant_permission` — grant or deny browser permissions for the active origin.
- `set_download_behavior` — configure the download directory/behavior for the session (plus download tracking surfaced in responses; a separate `list_downloads`-style read is optional, see Out of Scope).

**Behavioral modifications to existing surfaces:**

- `click` — clicking a file input or an upload control must no longer open and hang on the native picker. The file chooser is intercepted at the page level; the click returns an actionable result directing the agent to `upload`.
- **Action response builder** — every action response gains a "pending non-DOM prompts" section (currently-open dialog, awaiting auth, etc.) so the agent knows why it is blocked.
- **Page setup (`setupPageTracking`)** — becomes the single wiring point that enables the relevant CDP domains and subscribes the non-DOM prompt listeners for every page (launched, connected, or newly opened).
- **Legacy tool catalog (`tools.json`)** — the stale `act_upload` entry is reconciled so the catalog matches the real registered tools.

### Modules to build

- **FilePathValidator** (deep, pure) — Interface roughly `validate(paths: string[], allowedRoots: string[]): ValidatedPaths`. Responsibilities: reject empty input, resolve to absolute paths, assert each path exists and is a regular file, and enforce that each resolved path is contained within an allowed root. Returns absolute paths or throws a typed validation error. No CDP, no I/O beyond `fs.stat`. The `multiple`-attribute / single-file-count check lives at the tool boundary, not here (it needs the resolved input element).

- **FileInputResolver** (deep) — Interface roughly `uploadFiles(cdp: CdpClient, target: ResolvedTarget, absolutePaths: string[]): Promise<void>`. Responsibilities: from the targeted node, locate the real `<input type="file">` by checking (a) the node itself, (b) descendant `input[type=file]`, (c) `label[for]` target, (d) nearest ancestor/sibling hidden input; call `DOM.setFileInputFiles` against the resolved input's backend node; then dispatch bubbling `input` and `change` events via `Runtime.callFunctionOn`. Must operate against the CDP session for the target's frame. Throws a typed "no file input found" error when resolution fails.

- **DialogManager** (deep, per-page) — Subscribes to `Page.javascriptDialogOpening`; holds at most one pending-dialog record (type, message, default value, url); applies the default policy (auto-dismiss) when no explicit handling is requested within the action; exposes `resolve(action: 'accept' | 'dismiss', promptText?: string)` which calls `Page.handleJavaScriptDialog`; exposes `getPending()` for the response builder. Owns no snapshot state.

- **DownloadManager** (per-session) — Configures `Browser.setDownloadBehavior` to a host directory and tracks `Browser.downloadWillBegin` / `downloadProgress` events into an in-memory list keyed by page/guid.

- **PermissionManager** (per-context) — Wraps `Browser.grantPermissions` / `Browser.setPermission` for the active origin; exposed via `grant_permission`.

- **AuthHandler** (per-page) — Enables the CDP `Fetch` domain with `handleAuthRequests: true` and responds to `Fetch.authRequired` using credentials supplied via policy; otherwise continues unauthenticated.

### Key technical decisions

- **Bypass the native picker entirely.** Uploads go through `DOM.setFileInputFiles`, never OS automation. To prevent stray clicks from wedging the page, enable file-chooser interception at page setup so the OS picker does not open.
- **Path locality is a first-class constraint.** Files must exist on the host where Chrome runs. For remote/containerized Chrome, the supplied path must resolve inside that host/container. The validator enforces absolute paths and existence; the error message names path-locality explicitly. Staging files into an allowed root on the browser host is the recommended pattern.
- **Frame correctness.** Upload and dialog handling must use the CDP session for the target's frame. This intersects the known main-frame-session limitation; cross-origin-iframe uploads depend on resolving the correct session.
- **Deadlock avoidance is the default.** A blocking JavaScript dialog halts all further CDP page interaction, so the default policy auto-dismisses unhandled dialogs to keep the session alive; explicit acceptance is opt-in per action via `handle_dialog`.
- **Non-DOM state is separate from snapshots.** Pending dialogs, downloads, and auth state live in their own per-page/session structures; snapshots remain pure DOM representations. The response builder composes the two.
- **App-level validation still applies.** `accept`, max size, required extensions, and server-side MIME/upload checks are the page's concern; this feature only delivers files to the input and reports the page's reaction via the follow-up snapshot.

### Reference resolver shape (from exploration, decision-encoding only — not final code)

```
resolveAndUpload(cdp, backendNodeId, absoluteFiles):
  obj   = cdp.send('DOM.resolveNode', { backendNodeId })
  input = cdp.send('Runtime.callFunctionOn', {           // self matches input[type=file]
            objectId: obj.object.objectId,                //   else querySelector descendant
            functionDeclaration: "function(){ return this.matches?.('input[type=file]') ? this : this.querySelector?.('input[type=file]') }"
          })
  desc  = cdp.send('DOM.describeNode', { objectId: input.result.objectId })
  cdp.send('DOM.setFileInputFiles', { backendNodeId: desc.node.backendNodeId, files: absoluteFiles })
  cdp.send('Runtime.callFunctionOn', { objectId: input.result.objectId,       // fire input + change (bubbles)
            functionDeclaration: "function(){ this.dispatchEvent(new Event('input',{bubbles:true})); this.dispatchEvent(new Event('change',{bubbles:true})); }" })
```

The point captured here: resolve target → descend to the real file input → `setFileInputFiles` against its backend node → dispatch bubbling `input`/`change`. The `label[for]` and ancestor-hidden-input cases extend the resolution step.

## Testing Decisions

**What makes a good test here:** assert external behavior, not internal call sequences. For CDP-touching modules, use `MockCdpClient` (from `tests/mocks/cdp-client.mock.ts`) to stub responses and assert the observable outcome (which files were set, which dialog action was sent, what error was thrown) rather than asserting a specific private method ran. Prior art: existing unit tests under `tests/unit/` that drive `MockCdpClient` and `createLinkedMocks()` for the Browser→Context→Page→CDP chain.

Modules to test (per decision):

- **FilePathValidator** (unit, pure) — empty array rejected; relative paths absolute-ized; non-existent path → typed error naming path-locality; directory (not file) → error; path outside allowed roots → error; valid set → absolute paths returned. No mocks needed beyond a temp dir / `fs` fixtures.
- **FileInputResolver** (integration-style, `MockCdpClient`) — direct file-input target resolves and `setFileInputFiles` receives the right backend node + files; button-with-descendant-input resolves to the descendant; `label[for]` target resolves to its input; target with no reachable file input → typed "no file input found" error; `input`/`change` dispatch is invoked after setting files.
- **DialogManager** (unit, fake event emitter / `MockCdpClient`) — a `Page.javascriptDialogOpening` event produces a pending record; `resolve('accept')` and `resolve('dismiss')` send the correct `Page.handleJavaScriptDialog` payload; `resolve('accept', text)` forwards prompt text; unhandled dialog hits the auto-dismiss default; `getPending()` reflects state before and after resolution.
- **Tool handlers + schema** — `UploadInputSchema` / `handle_dialog` schema reject malformed input (missing/empty files, non-string paths, missing target) with helpful messages; the `upload` handler wires validator → resolver → snapshot and returns a snapshot result; the `click`-on-file-input behavioral change returns the "use upload" guidance instead of opening a picker; the response builder includes pending-dialog state when one is open.

## Out of Scope

- OS-native dialog automation (clicking the actual OS file picker, native print dialog, certificate warning UI). The design avoids these rather than driving them; any OS-level fallback is environment-specific and explicitly not built here.
- Drag-and-drop upload zones that have **no** underlying file input. Most have a hidden input (covered by FileInputResolver); synthesizing `DataTransfer`-based drops for input-less dropzones is a separate effort.
- WebAuthn / passkey virtual authenticators.
- External-app / custom-protocol prompt acceptance (intercept-and-inspect only; auto-accept is intentionally not built).
- Bypassing application-level upload validation (size limits, `accept`, server MIME checks).
- A rich download-management tool surface beyond routing + basic tracking (e.g. pause/resume/cancel). A read-only `list_downloads` tool is optional and may be split out.
- Fixing the broader cross-origin-iframe CDP-session model. This PRD must resolve targets in the correct frame but does not redesign the main-frame-session architecture.

## Further Notes

- The `CdpClient` interface already exposes both `send()` and `on()/off()`, so no transport changes are required — upload uses `send`, the prompt managers use `on`.
- `setupPageTracking()` already runs for launched, connected, and newly opened pages, making it the correct single wiring point for prompt listeners.
- File inputs are already observable today (`kind: input`, `input_type: file`, form purpose `file`); this work makes them _actionable_ and stops the click-induced hang — it does not change how they are represented in snapshots.
- Consistency caveat carried from exploration: `DOM.setFileInputFiles` is the most portable path and works across headed/headless/local/CI, but only when (a) the path exists on the browser host and (b) the correct frame session is used. Both are addressed by FilePathValidator and frame-aware resolution respectively.
