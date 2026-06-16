# Deepen the Action Transaction: unify non-DOM surface detection

Status: proposed
Relates to: PR #91 (non-DOM surface model), architecture-review card "Deepen The Action Transaction"
Supersedes the ad-hoc detection added in `src/tools/interaction-tools.ts`.

## Why this exists

PR #91 made dialogs, file pickers, and permission prompts perceivable as
`<non_dom>` surfaces. The capability is correct, but it was bolted onto the
click handler as **three serial, differently-shaped probes**. Three concrete
defects fall out of that one structural gap:

1. **Per-click latency floor (#1).** Every DOM click that does *not* open a
   permission prompt still awaits `waitForPendingPermission` for the full
   `PERMISSION_CLICK_RACE_TIMEOUT_MS = 500ms`
   (`interaction-tools.ts:71`, `:332`, `:449`). The permission signal arrives
   asynchronously over a CDP binding *after* the click resolves, and there is no
   "nothing was requested" signal, so the code blind-polls. Result: a 500ms tax
   on the most common action in the system.

2. **Speculative CDP round-trips per click (#2).** For every `button` / `input` /
   `text` click, `resolveFileInputTarget` runs `DOM.resolveNode` →
   `Runtime.callFunctionOn` → `DOM.describeNode` (`interaction-tools.ts:602`) to
   guess whether a file input is hiding nearby — three round-trips to learn
   "no" ~99% of the time.

3. **Orphaned safety net (#3).** `DialogManager.applyDefaultPolicy()`
   (`dialog-manager.ts:173`) exists to auto-dismiss an unhandled dialog and
   prevent session deadlock, but has **zero callers**. Nothing owns the surface
   lifecycle, so nothing invokes the net.

These are not three bugs. They are three symptoms of **the non-DOM channel
having no unified signal and no owner**. Patching each in place (lower the
timeout, cache the resolve, wire one call) leaves the structure that produced
them. This plan removes the structure.

## Root cause

The three surfaces are all **events the browser emits as a side effect of an
action**, and two of three already have native CDP events:

| Surface     | Real signal today                                  | Blocks renderer? |
| ----------- | -------------------------------------------------- | ---------------- |
| Dialog      | `Page.javascriptDialogOpening` (event)             | **Yes**          |
| File picker | `Page.fileChooserOpened` (event, interception on)  | No               |
| Permission  | injected binding → `Runtime.bindingCalled` (event) | No               |

All three are **event-driven**. Yet the click handler treats them as three
unrelated questions asked in sequence — race-the-click for dialogs, a timestamp
flag for choosers, a fixed poll for permissions. The poll exists only because
permission detection was modeled as "ask after the click" instead of "observe
during the wait the click already pays."

Two facts the current code under-uses:

- **Stabilization is already a wait window.** Every click already awaits
  `stabilizeAfterAction` (`interaction-tools.ts:156`, `:475`) — network-idle +
  DOM render, typically longer than the sub-100ms permission binding round-trip.
  A permission requested by the click's handler will have fired *during* that
  window. It can be read as a flag afterward for **zero added latency**, instead
  of polled for beforehand.
- **File-chooser interception already fires for indirect triggers.** With
  `Page.setInterceptFileChooserDialog` enabled (`dialog-manager.ts:107`),
  clicking a styled button, a `<label for>`, or a hidden input all emit
  `Page.fileChooserOpened` with the real input's `backendNodeId`. The
  speculative `resolveFileInputTarget` DOM walk is **redundant with an event we
  already subscribe to**.

## Target architecture

Two seams, consistent with the review's "Action transaction module."

### 1. `NonDomChannel` (per page) — one owner for all surfaces

Collapses `DialogManager` + `PermissionDetector` + the free-floating
`surface-store` functions behind one object that owns surface state **and**
exposes a single signal.

```
class NonDomChannel {
  // Event-driven: resolves the instant ANY detector fires; never polls.
  surfaceSignal(opts?: { settleWindowMs?: number }): Promise<NonDomSurface | null>

  getActiveSurface(): NonDomSurface | null
  setActiveSurface(s: NonDomSurface): void
  clear(): void

  // The deadlock net — now with an owner AND a caller (see slice 3).
  applyDefaultPolicy(): Promise<void>
}
```

Internally each handler (`javascriptDialogOpening`, `fileChooserOpened`,
`bindingCalled`) **settles the same pending promise**. There is one place that
knows "a surface is open," instead of three booleans interrogated in order.

### 2. The action transaction races action + signal, then reads flags

The click lifecycle becomes a single shape:

```
1. race( clickAction , channel.surfaceSignal({ for blocking dialogs }) )
     - a dialog blocks the renderer, so the click promise never settles while
       it is open → the race lands on the dialog signal. (Unchanged, correct.)
2. if dialog surface  → DO NOT stabilize (renderer blocked); return surface.
3. else               → stabilizeAfterAction  (the wait we already pay)
4. after stabilize, read channel for a non-blocking surface that fired during
   the window: file-picker or permission. No extra poll, no extra round-trip.
5. no surface → normal observe + snapshot + state response.
```

Latency on a no-surface click: **action + the stabilization it already did.**
Zero added. The 500ms floor disappears because permission detection is a flag
read on a window that already elapsed, not a serial wait.

## Slices (tracer bullets)

Ordered so each lands independently and the suite stays green. Matches the
review's "First slice: DOM click plus non-DOM detection."

### Slice 1 — Kill the permission poll; fold detection into stabilization (#1)

- Remove `waitForPendingPermission` and `PERMISSION_CLICK_RACE_TIMEOUT_MS`.
- Move the permission check to **after** `stabilizeAfterAction`, as a single
  `permissionDetector.getPendingPermission()` flag read (the binding handler
  already populates it during the window).
- Keep the dialog race (`clickWithEarlyDialogDetection`) exactly as-is — it is
  the correct primitive for a renderer-blocking surface.

**Acceptance**
- [ ] A click that opens no permission prompt adds **0ms** beyond stabilization
      (assert with fake timers: no pending `setTimeout` after the click resolves
      and stabilization completes).
- [ ] A click that triggers `getUserMedia` / geolocation still surfaces
      `<non_dom kind="permission">` (integration test against the manual page).
- [ ] `grep` shows no remaining fixed-interval permission poll.

### Slice 2 — Trust the interception event; delete speculative resolve (#2)

- Delete the `resolveFileInputTarget`-on-every-click branch
  (`interaction-tools.ts:602`).
- Keep **only** the cheap direct-input fast path: when the clicked node's
  snapshot attributes already say `input_type === 'file'`, build the picker
  surface without dispatching a real click (no native picker, no CDP walk).
- All indirect triggers (styled button, label, dropzone, hidden input) are
  caught by `Page.fileChooserOpened` after the click — the same flag read added
  in Slice 1, now covering choosers too.

**Acceptance**
- [ ] A plain button click issues **no** `DOM.resolveNode` / `DOM.describeNode`
      (assert against the CDP mock call log).
- [ ] Manual tests 1a–1e (direct, styled button, label, dropzone, multi) still
      produce the file-picker surface.
- [ ] Direct `input[type=file]` click still returns the surface without firing a
      real picker.

### Slice 3 — Give the safety net an owner and a caller (#3)

- Move `applyDefaultPolicy` onto `NonDomChannel`.
- Invoke it from the transaction when an agent issues a **page action while a
  blocking dialog is pending** (i.e., they acted on the page instead of the
  `nd-*` control) and on page-close / hard-navigation cleanup.

**Acceptance**
- [ ] A DOM action attempted while a dialog is pending auto-dismisses the dialog
      (default policy) and returns a fresh state, rather than hanging.
- [ ] `applyDefaultPolicy` has at least one production caller (no dead code).
- [ ] Closing a page with a pending dialog does not leak a blocked renderer.

### Slice 4 — Introduce `NonDomChannel`, retire the scattered accessors

- Fold `DialogManager`, `PermissionDetector`, and the `getSurface/setSurface/
  clearSurface` calls behind `NonDomChannel`. Detectors become private handlers
  that settle the shared signal.
- `interaction-tools` and `observation-tools` talk only to the channel.

**Acceptance**
- [ ] One `surfaceSignal()` race replaces the serial dialog/chooser/permission
      branches in `clickElementWithNonDomDetection`.
- [ ] `getOrCreateDialogManager` / `getOrCreatePermissionDetector` are no longer
      called from tool handlers.
- [ ] The lifecycle is tested at the channel seam; the old per-detector unit
      tests that duplicated routing logic can retire.

## Non-goals

- No change to the **agent-facing contract**: `nd-*` eids, `<non_dom>` XML, and
  the click/type resolution flow stay identical. This is an internal seam move.
- No new surface kinds. Basic-auth / download-destination prompts are future
  work and slot into `NonDomChannel` without re-touching the transaction.

## Risk & validation

- **Permission requested after stabilization completes** (timer-driven, not
  click-driven) is intentionally *not* blocked on — it surfaces on the next
  action or `snapshot`. This is correct: such a request is not an outcome of the
  click being reported.
- Validate end-to-end with `tests/manual/non-dom-channel.html` (all of upload,
  dialog, permission allow/deny) plus a fake-timer unit asserting the no-surface
  click pays no extra wait.
