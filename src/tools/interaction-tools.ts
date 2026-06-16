/**
 * Interaction Tools
 *
 * MCP tool handlers for element interaction: click, type, press, select, hover.
 *
 * Non-DOM surface support:
 * - click on a synthetic "nd-*" EID routes to the active surface's action handler
 * - click on a DOM element checks for dialog/file-picker events before stabilizing
 * - type on a synthetic "nd-*" EID updates the surface input's value in-place
 */

import {
  clickByBackendNodeId,
  clickAtCoordinates,
  clickAtElementOffset,
  typeByBackendNodeId,
  pressKey,
  selectOption,
  hoverByBackendNodeId,
  type ReadableNode,
} from '../snapshot/index.js';
import {
  ClickInputSchema,
  TypeInputSchema,
  PressInputSchema,
  SelectInputSchema,
  HoverInputSchema,
} from './tool-schemas.js';
import { executeAction, executeActionWithRetry, type CaptureSnapshotFn } from './execute-action.js';
import { createActionCapture, prepareActionContext } from './action-context.js';
import type { ToolContext } from './tool-context.types.js';
import { getOrCreateDialogManager } from '../non-dom/dialog-manager.js';
import { getOrCreatePermissionDetector } from '../non-dom/permission-detector.js';
import { setPermissions } from '../non-dom/permission-manager.js';
import {
  getSurface,
  setSurface,
  clearSurface,
  updateInputValue,
  buildDialogSurface,
  buildFilePickerSurface,
  buildFilePickerSurfaceForInput,
  buildPermissionSurface,
  isNonDomEid,
  type NonDomSurface,
} from '../non-dom/surface-store.js';
import { renderNonDomSurface } from '../non-dom/surface-xml.js';
import { stabilizeAfterAction } from './action-stabilization.js';
import { captureNavigationState } from './navigation-detection.js';
import { ATTACHMENT_SIGNIFICANCE_THRESHOLD } from '../observation/observation.types.js';
import { validateFilePaths, FileValidationError } from '../non-dom/file-path-validator.js';
import { resolveAndUploadFiles } from '../non-dom/file-input-resolver.js';
import type { PageHandle } from '../browser/page-registry.js';

/** Configured allowed roots for file uploads. Empty = no restriction. */
const ALLOWED_ROOTS: string[] = process.env.UPLOAD_ALLOWED_ROOTS
  ? process.env.UPLOAD_ALLOWED_ROOTS.split(':').filter(Boolean)
  : [];

const DIALOG_CLICK_RACE_TIMEOUT_MS = 1500;

// ============================================================================
// Non-DOM Click Handler
// ============================================================================

/**
 * Handle a click on a synthetic "nd-*" EID (dialog or file-picker control).
 * Routes to the appropriate resolution action and returns a fresh state response.
 */
async function handleNonDomClick(
  eid: string,
  handle: PageHandle,
  pageId: string,
  ctx: ToolContext,
  captureSnapshot: CaptureSnapshotFn
): Promise<string> {
  const surface = getSurface(handle.page);
  if (!surface) {
    throw new Error(
      `No active non-DOM surface. The synthetic control "${eid}" is not available. ` +
        'Take a snapshot to see the current page state.'
    );
  }

  if (surface.kind === 'permission') {
    return handlePermissionResolution(eid, surface, handle, pageId, ctx, captureSnapshot);
  }

  const dialogManager = getOrCreateDialogManager(handle.page);
  if (surface.kind !== 'dialog') {
    await dialogManager.attach(handle.cdp);
  }

  if (eid === 'nd-dialog-ok') {
    const promptInput = surface.controls.find((c) => c.eid === 'nd-dialog-input');
    const promptText = promptInput?.value ?? undefined;
    await dialogManager.resolveDialog('accept', promptText);
    clearSurface(handle.page);
    return afterNonDomResolution(handle, pageId, ctx, captureSnapshot);
  }

  if (eid === 'nd-dialog-dismiss') {
    await dialogManager.resolveDialog('dismiss');
    clearSurface(handle.page);
    return afterNonDomResolution(handle, pageId, ctx, captureSnapshot);
  }

  if (eid === 'nd-picker-choose') {
    return handlePickerChoose(surface, handle, pageId, ctx, captureSnapshot);
  }

  if (eid === 'nd-picker-cancel') {
    // Send an empty file list to cancel the intercepted file chooser. Without this, Chrome
    // may leave the chooser in a pending state and block subsequent page interactions.
    if (surface.kind === 'file-picker' && surface.pickerBackendNodeId !== undefined) {
      try {
        await handle.cdp.send('DOM.setFileInputFiles', {
          files: [],
          backendNodeId: surface.pickerBackendNodeId,
        });
      } catch {
        // Best-effort: chooser may have already closed
      }
    }
    clearSurface(handle.page);
    const captureResult = await captureSnapshot();
    ctx.getSnapshotStore().store(pageId, captureResult.snapshot);
    return ctx.getStateManager(pageId).generateResponse(captureResult.snapshot);
  }

  throw new Error(
    `Unknown non-DOM control: "${eid}". ` +
      `Active surface kind is "${surface.kind}". ` +
      'Check the non_dom section of the state response for valid controls.'
  );
}

/** Stabilize, capture snapshot, and return state response after resolving a non-DOM surface. */
async function afterNonDomResolution(
  handle: PageHandle,
  pageId: string,
  ctx: ToolContext,
  captureSnapshot: CaptureSnapshotFn
): Promise<string> {
  await stabilizeAfterAction(handle.page);

  const observations = await ctx
    .getObservationAccumulator()
    .getAccumulatedObservations(handle.page);

  const captureResult = await captureSnapshot();
  const snapshot = captureResult.snapshot;

  const filtered = ctx
    .getObservationAccumulator()
    .filterBySignificance(observations, ATTACHMENT_SIGNIFICANCE_THRESHOLD);

  if (filtered.sincePrevious.length > 0 || filtered.duringAction.length > 0) {
    snapshot.observations = filtered;
  }

  ctx.getSnapshotStore().store(pageId, snapshot);
  return ctx.getStateManager(pageId).generateResponse(snapshot);
}

/** Handle the Choose/Save button on a file-picker surface. */
async function handlePickerChoose(
  surface: NonDomSurface,
  handle: PageHandle,
  pageId: string,
  ctx: ToolContext,
  captureSnapshot: CaptureSnapshotFn
): Promise<string> {
  if (surface.kind !== 'file-picker') {
    throw new Error('nd-picker-choose requires an active file-picker surface.');
  }

  const pathCtrl = surface.controls.find((c) => c.eid === 'nd-picker-path');
  const rawValue = pathCtrl?.value?.trim() ?? '';

  if (!rawValue) {
    throw new Error(
      'File path is empty. Type an absolute browser-host path into nd-picker-path first.'
    );
  }

  // Split newline-separated paths for multi-file pickers
  const rawPaths = rawValue
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  // Validate paths
  let validatedPaths: string[];
  try {
    const result = validateFilePaths(rawPaths, ALLOWED_ROOTS);
    validatedPaths = result.paths;
  } catch (err) {
    if (err instanceof FileValidationError) {
      throw new Error(`File path validation failed: ${err.message}`);
    }
    throw err;
  }

  // Enforce single-file constraint
  if (surface.pickerMode !== 'selectMultiple' && validatedPaths.length > 1) {
    throw new Error(
      `This file picker does not allow multiple files (mode: ${surface.pickerMode ?? 'selectSingle'}). ` +
        'Provide exactly one file path, or use a multi-file picker.'
    );
  }

  // Set the files via CDP
  if (surface.pickerBackendNodeId !== undefined) {
    await resolveAndUploadFiles(handle.cdp, surface.pickerBackendNodeId, validatedPaths);
  }

  clearSurface(handle.page);
  return afterNonDomResolution(handle, pageId, ctx, captureSnapshot);
}

/**
 * Read deterministic geolocation coordinates from env. Used so an allowed
 * geolocation permission resolves to fixed coords (no real device GPS).
 * Defaults to 0/0 with 100m accuracy when unset — still deterministic.
 */
function getConfiguredGeolocation(): { latitude: number; longitude: number; accuracy: number } {
  const parse = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined || raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    latitude: parse(process.env.AWI_GEOLOCATION_LAT, 0),
    longitude: parse(process.env.AWI_GEOLOCATION_LON, 0),
    accuracy: parse(process.env.AWI_GEOLOCATION_ACCURACY, 100),
  };
}

/** Handle the Allow/Block buttons on a permission-request surface. */
async function handlePermissionResolution(
  eid: string,
  surface: NonDomSurface,
  handle: PageHandle,
  pageId: string,
  ctx: ToolContext,
  captureSnapshot: CaptureSnapshotFn
): Promise<string> {
  if (eid !== 'nd-permission-allow' && eid !== 'nd-permission-deny') {
    throw new Error(
      `Unknown non-DOM control: "${eid}". ` +
        'Active surface kind is "permission". Use nd-permission-allow or nd-permission-deny.'
    );
  }

  const granted = eid === 'nd-permission-allow';
  const permissions = surface.permissionTypes ?? [];
  const origin = surface.permissionOrigin ?? new URL(handle.page.url()).origin;
  const requestId = surface.permissionRequestId;

  // 1) Set the CDP permission state for the origin so the replayed native call
  //    resolves deterministically (granted → success, denied → error).
  await setPermissions(handle.cdp, permissions, origin, granted);

  // 2) For an allowed geolocation request, install deterministic coordinates.
  if (granted && permissions.includes('geolocation')) {
    try {
      await handle.cdp.send('Emulation.setGeolocationOverride', getConfiguredGeolocation());
    } catch {
      // Non-fatal: some targets may not support the override.
    }
  }

  // 3) Replay the page-side native call now that CDP state is decided.
  if (requestId) {
    const detector = getOrCreatePermissionDetector(handle.page);
    try {
      await detector.resolvePermission(requestId);
    } catch {
      // Best-effort: the page context may have navigated away.
    }
  }

  clearSurface(handle.page);
  return afterNonDomResolution(handle, pageId, ctx, captureSnapshot);
}

// ============================================================================
// Element Click with Non-DOM Detection
// ============================================================================

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

async function waitForPendingDialog(
  dialogManager: ReturnType<typeof getOrCreateDialogManager>,
  timeoutMs = DIALOG_CLICK_RACE_TIMEOUT_MS
): Promise<boolean> {
  if (dialogManager.getPendingDialog()) return true;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (dialogManager.getPendingDialog()) return true;
  }

  return false;
}

async function clickWithEarlyDialogDetection(
  clickAction: () => Promise<void>,
  dialogManager: ReturnType<typeof getOrCreateDialogManager>
): Promise<{ clickSucceeded: boolean; dialogOpened: boolean }> {
  let clickSucceeded = true;
  let clickError: unknown;

  const clickPromise = clickAction().catch((err: unknown) => {
    clickSucceeded = false;
    clickError = err;
  });

  const dialogOpened = await Promise.race([
    waitForPendingDialog(dialogManager),
    clickPromise.then(() => false),
  ]);

  if (dialogOpened) {
    clickPromise.catch(() => undefined);
    return { clickSucceeded, dialogOpened: true };
  }

  await clickPromise;
  if (clickError && !dialogManager.getPendingDialog()) {
    throw toError(clickError);
  }

  return { clickSucceeded, dialogOpened: false };
}

/**
 * Execute a DOM element click, checking for dialog/file-picker events before
 * running DOM stabilization.  Dialogs block the renderer, so stabilization must
 * be skipped entirely when one is detected.
 *
 * Returns a state response string — either:
 * - A non-DOM surface response (dialog or file-picker detected)
 * - A normal state response (no non-DOM surface, standard flow)
 */
async function clickElementWithNonDomDetection(
  handle: PageHandle,
  node: ReadableNode,
  x: number | undefined,
  y: number | undefined,
  modifiers: string[] | undefined,
  ctx: ToolContext,
  pageId: string,
  captureSnapshot: CaptureSnapshotFn
): Promise<string> {
  const dialogManager = getOrCreateDialogManager(handle.page);
  await dialogManager.attach(handle.cdp);
  const beforeClickTs = Date.now();
  const actionStartTime = Date.now();

  await ctx.getObservationAccumulator().ensureInjected(handle.page);

  const preClickState = await captureNavigationState(handle);

  const { clickSucceeded } = await clickWithEarlyDialogDetection(async () => {
    if (x !== undefined && y !== undefined) {
      await clickAtElementOffset(handle.cdp, node.backend_node_id, x, y, modifiers);
    } else {
      await clickByBackendNodeId(handle.cdp, node.backend_node_id, modifiers);
    }
  }, dialogManager);

  // === Non-DOM Surface Detection (before any stabilization) ===

  // 1. JavaScript dialog?
  const pendingDialog = dialogManager.getPendingDialog();
  if (pendingDialog) {
    const surface = buildDialogSurface(pendingDialog);
    setSurface(handle.page, surface);

    // Use the existing stored snapshot (page is blocked; re-capture is unsafe)
    const storedSnapshot = ctx.getSnapshotStore().getByPageId(pageId);
    const stateManager = ctx.getStateManager(pageId);
    const stateXml = storedSnapshot ? stateManager.generateResponse(storedSnapshot) : '';
    return stateXml + '\n' + renderNonDomSurface(surface);
  }

  // 2. File chooser intercepted?
  if (dialogManager.wasFileChooserOpenedSince(beforeClickTs)) {
    const chooserState = dialogManager.getFileChooserState();
    dialogManager.clearFileChooser();
    const surface = buildFilePickerSurface(chooserState.backendNodeId, chooserState.mode);
    setSurface(handle.page, surface);

    // File chooser interception is non-blocking — stabilization is safe
    await stabilizeAfterAction(handle.page);
    const captureResult = await captureSnapshot();
    ctx.getSnapshotStore().store(pageId, captureResult.snapshot);
    const stateManager = ctx.getStateManager(pageId);
    const stateXml = stateManager.generateResponse(captureResult.snapshot);
    return stateXml + '\n' + renderNonDomSurface(surface);
  }

  // 3. Stabilization is the wait window the click already pays (network-idle +
  //    DOM render). A permission requested by the click's handler fires over the
  //    CDP binding *during* this window, so we stabilize first and then read the
  //    flag — zero added latency, no fixed-interval poll. A permission prompt
  //    does not block the renderer, so recapture afterward is safe.
  const permissionDetector = getOrCreatePermissionDetector(handle.page);
  await stabilizeAfterAction(handle.page);

  const pendingPermission = permissionDetector.getPendingPermission();
  if (pendingPermission) {
    const surface = buildPermissionSurface(
      pendingPermission.permissions,
      pendingPermission.origin,
      pendingPermission.id
    );
    setSurface(handle.page, surface);

    const captureResult = await captureSnapshot();
    ctx.getSnapshotStore().store(pageId, captureResult.snapshot);
    const stateManager = ctx.getStateManager(pageId);
    const stateXml = stateManager.generateResponse(captureResult.snapshot);
    return stateXml + '\n' + renderNonDomSurface(surface);
  }

  if (!clickSucceeded) {
    // click failed and no non-DOM surface opened — capture best-effort state
    const captureResult = await captureSnapshot();
    ctx.getSnapshotStore().store(pageId, captureResult.snapshot);
    return ctx.getStateManager(pageId).generateResponse(captureResult.snapshot);
  }

  // === Normal DOM Click Flow ===
  const observations = await ctx
    .getObservationAccumulator()
    .getObservations(handle.page, actionStartTime);

  const captureResult = await captureSnapshot();
  const snapshot = captureResult.snapshot;

  // Late navigation detection
  const postUrl = handle.page.url();
  const didNavigate = postUrl !== preClickState.url;
  if (didNavigate) ctx.getDependencyTracker().clearPage(pageId);

  const filtered = ctx
    .getObservationAccumulator()
    .filterBySignificance(observations, ATTACHMENT_SIGNIFICANCE_THRESHOLD);

  if (filtered.duringAction.length > 0 || filtered.sincePrevious.length > 0) {
    snapshot.observations = filtered;
  }

  ctx.getSnapshotStore().store(pageId, snapshot);
  const stateManager = ctx.getStateManager(pageId);
  return stateManager.generateResponse(snapshot, didNavigate ? { trimRegions: true } : undefined);
}

// ============================================================================
// Non-DOM Type Handler
// ============================================================================

/**
 * Handle type on a synthetic "nd-*" EID (dialog input or file picker path).
 * Updates the control's value on the active surface and returns the updated
 * state response with the refreshed non-DOM surface.
 */
function handleNonDomType(
  eid: string,
  text: string,
  clear: boolean,
  handle: PageHandle,
  pageId: string,
  ctx: ToolContext
): string {
  const surface = getSurface(handle.page);
  if (!surface) {
    throw new Error(`No active non-DOM surface. The synthetic control "${eid}" is not available.`);
  }

  const ctrl = surface.controls.find((c) => c.eid === eid);
  if (!ctrl) {
    throw new Error(`Non-DOM control "${eid}" not found in the active ${surface.kind} surface.`);
  }
  if (ctrl.kind !== 'input') {
    throw new Error(`"${eid}" is a ${ctrl.kind}, not an input — it cannot receive typed text.`);
  }

  const updated = updateInputValue(handle.page, eid, text, clear);
  if (!updated) {
    throw new Error(`Failed to update non-DOM control "${eid}".`);
  }

  // Return current page state + updated surface
  const storedSnapshot = ctx.getSnapshotStore().getByPageId(pageId);
  const stateManager = ctx.getStateManager(pageId);
  const stateXml = storedSnapshot ? stateManager.generateResponse(storedSnapshot) : '';
  return stateXml + '\n' + renderNonDomSurface(surface);
}

// ============================================================================
// Public Tool Handlers
// ============================================================================

/**
 * Click an element or at viewport coordinates.
 *
 * Modes:
 * 1. eid = "nd-*"  → route to active non-DOM surface control
 * 2. eid of file input → return file-picker surface (no native picker)
 * 3. eid of other DOM element → click + detect dialog/file-chooser events
 * 4. x/y only → absolute viewport click (existing behavior)
 */
export async function click(
  rawInput: unknown,
  ctx: ToolContext
): Promise<import('./tool-schemas.js').ClickOutput> {
  const input = ClickInputSchema.parse(rawInput);
  const hasEid = input.eid !== undefined;
  const hasCoords = input.x !== undefined && input.y !== undefined;

  if (!hasEid && !hasCoords) {
    throw new Error('Either eid or both x and y coordinates must be provided.');
  }
  if ((input.x !== undefined) !== (input.y !== undefined)) {
    throw new Error('Both x and y coordinates must be provided together.');
  }

  // === Route synthetic non-DOM EIDs ===
  if (hasEid && isNonDomEid(input.eid!)) {
    const nonDomHandleRef = { current: ctx.resolveExistingPage(input.page_id) };
    const nonDomPageId = nonDomHandleRef.current.page_id;
    const nonDomCaptureSnapshot = createActionCapture(ctx, nonDomHandleRef, nonDomPageId);
    return handleNonDomClick(
      input.eid!,
      nonDomHandleRef.current,
      nonDomPageId,
      ctx,
      nonDomCaptureSnapshot
    );
  }

  const { handleRef, pageId, captureSnapshot } = await prepareActionContext(input.page_id, ctx);

  if (hasEid) {
    // DOM element click
    const snap = ctx.requireSnapshot(pageId);
    const node = ctx.resolveElementByEid(pageId, input.eid!, snap);
    const attrs = node.attributes as Record<string, unknown> | undefined;

    // Direct file-input fast path: when the snapshot already says this node is an
    // input[type=file], build the picker surface without dispatching a real click
    // (no native picker, no CDP DOM walk). Indirect triggers — a styled button, a
    // <label for>, a dropzone, a hidden input — are NOT probed speculatively here;
    // they emit Page.fileChooserOpened on the real click and are caught by the
    // wasFileChooserOpenedSince flag in clickElementWithNonDomDetection.
    if (attrs?.input_type === 'file') {
      const surface = buildFilePickerSurfaceForInput(
        node.backend_node_id,
        (attrs?.multiple as boolean | undefined) !== undefined
      );
      setSurface(handleRef.current.page, surface);

      const captureResult = await captureSnapshot();
      ctx.getSnapshotStore().store(pageId, captureResult.snapshot);
      const stateManager = ctx.getStateManager(pageId);
      const stateXml = stateManager.generateResponse(captureResult.snapshot);
      return stateXml + '\n' + renderNonDomSurface(surface);
    }

    // General DOM element click with non-DOM surface detection
    return clickElementWithNonDomDetection(
      handleRef.current,
      node,
      input.x,
      input.y,
      input.modifiers,
      ctx,
      pageId,
      captureSnapshot
    );
  }

  // Absolute viewport click (no eid) — no non-DOM surface detection needed
  const result = await executeAction(
    handleRef.current,
    async () => {
      await clickAtCoordinates(handleRef.current.cdp, input.x!, input.y!, input.modifiers);
    },
    ctx,
    captureSnapshot
  );

  ctx.getSnapshotStore().store(pageId, result.snapshot);
  return result.state_response;
}

/**
 * Type text into an element.
 *
 * When the eid is a synthetic "nd-*" identifier, the typed text is stored on
 * the active non-DOM surface control (e.g. file path input, prompt response).
 */
export async function type(
  rawInput: unknown,
  ctx: ToolContext
): Promise<import('./tool-schemas.js').TypeOutput> {
  const input = TypeInputSchema.parse(rawInput);

  // Route synthetic nd-* inputs to surface value update
  if (isNonDomEid(input.eid)) {
    const handle = ctx.resolveExistingPage(input.page_id);
    const pageId = handle.page_id;
    return handleNonDomType(input.eid, input.text, input.clear, handle, pageId, ctx);
  }

  const { handleRef, pageId, captureSnapshot } = await prepareActionContext(input.page_id, ctx);

  // Normal DOM type
  const snap = ctx.requireSnapshot(pageId);
  const node = ctx.resolveElementByEid(pageId, input.eid, snap);

  const result = await executeActionWithRetry(
    handleRef.current,
    node,
    async (backendNodeId) => {
      await typeByBackendNodeId(handleRef.current.cdp, backendNodeId, input.text, {
        clear: input.clear,
      });
    },
    ctx,
    ctx.getSnapshotStore(),
    captureSnapshot
  );

  ctx.getSnapshotStore().store(pageId, result.snapshot);
  return result.state_response;
}

/**
 * Press a keyboard key.
 */
export async function press(
  rawInput: unknown,
  ctx: ToolContext
): Promise<import('./tool-schemas.js').PressOutput> {
  const input = PressInputSchema.parse(rawInput);
  const { handleRef, pageId, captureSnapshot } = await prepareActionContext(input.page_id, ctx);

  const result = await executeAction(
    handleRef.current,
    async () => {
      await pressKey(handleRef.current.cdp, input.key, input.modifiers);
    },
    ctx,
    captureSnapshot
  );

  ctx.getSnapshotStore().store(pageId, result.snapshot);
  return result.state_response;
}

/**
 * Select a dropdown option.
 */
export async function select(
  rawInput: unknown,
  ctx: ToolContext
): Promise<import('./tool-schemas.js').SelectOutput> {
  const input = SelectInputSchema.parse(rawInput);
  const { handleRef, pageId, captureSnapshot } = await prepareActionContext(input.page_id, ctx);

  const snap = ctx.requireSnapshot(pageId);
  const node = ctx.resolveElementByEid(pageId, input.eid, snap);

  const result = await executeActionWithRetry(
    handleRef.current,
    node,
    async (backendNodeId) => {
      await selectOption(handleRef.current.cdp, backendNodeId, input.value);
    },
    ctx,
    ctx.getSnapshotStore(),
    captureSnapshot
  );

  ctx.getSnapshotStore().store(pageId, result.snapshot);
  return result.state_response;
}

/**
 * Hover over an element.
 */
export async function hover(
  rawInput: unknown,
  ctx: ToolContext
): Promise<import('./tool-schemas.js').HoverOutput> {
  const input = HoverInputSchema.parse(rawInput);
  const { handleRef, pageId, captureSnapshot } = await prepareActionContext(input.page_id, ctx);

  const snap = ctx.requireSnapshot(pageId);
  const node = ctx.resolveElementByEid(pageId, input.eid, snap);

  const result = await executeActionWithRetry(
    handleRef.current,
    node,
    async (backendNodeId) => {
      await hoverByBackendNodeId(handleRef.current.cdp, backendNodeId);
    },
    ctx,
    ctx.getSnapshotStore(),
    captureSnapshot
  );

  ctx.getSnapshotStore().store(pageId, result.snapshot);
  return result.state_response;
}
