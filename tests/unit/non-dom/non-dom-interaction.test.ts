/**
 * Non-DOM surface interaction routing unit tests
 *
 * Tests that click() routes nd-* EIDs to the correct dialog/file-picker action
 * and that type() updates surface input values correctly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockHandle,
  mockSnapshotStore,
  mockDialogManager,
  mockDialogSurface,
  mockPickerSurface,
  mockSetSurface,
  mockGetSurface,
  mockClearSurface,
  mockUpdateInputValue,
  mockBuildDialogSurface,
  mockBuildFilePickerSurface,
  mockBuildFilePickerSurfaceForInput,
  mockIsNonDomEid,
  mockRenderNonDomSurface,
  mockStabilizeAfterAction,
  mockCaptureNavigationState,
  mockClickByBackendNodeId,
} = vi.hoisted(() => {
  const mockDialogSurface = {
    kind: 'dialog' as const,
    blocking: true as const,
    dialogType: 'confirm',
    dialogMessage: 'Are you sure?',
    controls: [
      { eid: 'nd-dialog-ok', kind: 'button' as const, label: 'Accept' },
      { eid: 'nd-dialog-dismiss', kind: 'button' as const, label: 'Dismiss' },
    ],
  };

  const mockPickerSurface = {
    kind: 'file-picker' as const,
    blocking: true as const,
    pickerMode: 'selectSingle',
    pickerBackendNodeId: 42,
    controls: [
      {
        eid: 'nd-picker-path',
        kind: 'input' as const,
        label: 'File path',
        value: '',
        placeholder: 'Absolute path',
      },
      { eid: 'nd-picker-choose', kind: 'button' as const, label: 'Choose' },
      { eid: 'nd-picker-cancel', kind: 'button' as const, label: 'Cancel' },
    ],
  };

  const mockDialogManager = {
    attach: vi.fn().mockResolvedValue(undefined),
    getPendingDialog: vi.fn().mockReturnValue(null),
    wasFileChooserOpenedSince: vi.fn().mockReturnValue(false),
    getFileChooserState: vi.fn().mockReturnValue({ opened: false, timestamp: 0 }),
    clearFileChooser: vi.fn(),
    resolveDialog: vi.fn().mockResolvedValue(undefined),
  };

  const mockSnapshotStore = {
    store: vi.fn(),
    getByPageId: vi.fn().mockReturnValue({
      snapshot_id: 'snap-pre',
      nodes: [],
      meta: { node_count: 0, interactive_count: 0 },
    }),
    removeByPageId: vi.fn(),
    clear: vi.fn(),
  };

  const mockHandle = {
    page_id: 'test-page',
    page: {
      url: vi.fn().mockReturnValue('https://example.com'),
      bringToFront: vi.fn().mockResolvedValue(undefined),
    },
    cdp: {},
    created_at: new Date(),
  };

  const mockSetSurface = vi.fn();
  const mockGetSurface = vi.fn().mockReturnValue(null);
  const mockClearSurface = vi.fn();
  const mockUpdateInputValue = vi.fn().mockReturnValue(true);
  const mockBuildDialogSurface = vi.fn().mockReturnValue(mockDialogSurface);
  const mockBuildFilePickerSurface = vi.fn().mockReturnValue(mockPickerSurface);
  const mockBuildFilePickerSurfaceForInput = vi.fn().mockReturnValue(mockPickerSurface);
  const mockIsNonDomEid = vi.fn().mockReturnValue(false);
  const mockRenderNonDomSurface = vi.fn().mockReturnValue('<non_dom />');
  const mockStabilizeAfterAction = vi.fn().mockResolvedValue({ status: 'stable' });
  const mockCaptureNavigationState = vi.fn().mockResolvedValue({ url: 'https://example.com' });
  const mockClickByBackendNodeId = vi.fn().mockResolvedValue(undefined);

  return {
    mockHandle,
    mockSnapshotStore,
    mockDialogManager,
    mockDialogSurface,
    mockPickerSurface,
    mockSetSurface,
    mockGetSurface,
    mockClearSurface,
    mockUpdateInputValue,
    mockBuildDialogSurface,
    mockBuildFilePickerSurface,
    mockBuildFilePickerSurfaceForInput,
    mockIsNonDomEid,
    mockRenderNonDomSurface,
    mockStabilizeAfterAction,
    mockCaptureNavigationState,
    mockClickByBackendNodeId,
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../src/snapshot/index.js', () => ({
  clickByBackendNodeId: mockClickByBackendNodeId,
  clickAtCoordinates: vi.fn().mockResolvedValue(undefined),
  clickAtElementOffset: vi.fn().mockResolvedValue(undefined),
  typeByBackendNodeId: vi.fn().mockResolvedValue(undefined),
  pressKey: vi.fn().mockResolvedValue(undefined),
  selectOption: vi.fn().mockResolvedValue(undefined),
  hoverByBackendNodeId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/tools/execute-action.js', () => ({
  executeAction: vi
    .fn()
    .mockResolvedValue({ snapshot: { snapshot_id: 'snap', meta: {} }, state_response: '<state/>' }),
  executeActionWithRetry: vi
    .fn()
    .mockResolvedValue({ snapshot: { snapshot_id: 'snap', meta: {} }, state_response: '<state/>' }),
  executeActionWithOutcome: vi.fn(),
}));

vi.mock('../../../src/tools/action-stabilization.js', () => ({
  stabilizeAfterAction: mockStabilizeAfterAction,
  stabilizeAfterNavigation: vi.fn(),
  captureSnapshotFallback: vi.fn(),
}));

vi.mock('../../../src/tools/navigation-detection.js', () => ({
  captureNavigationState: mockCaptureNavigationState,
  checkNavigationOccurred: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/non-dom/dialog-manager.js', () => ({
  getOrCreateDialogManager: vi.fn(() => mockDialogManager),
}));

vi.mock('../../../src/non-dom/surface-store.js', () => ({
  getSurface: mockGetSurface,
  setSurface: mockSetSurface,
  clearSurface: mockClearSurface,
  updateInputValue: mockUpdateInputValue,
  buildDialogSurface: mockBuildDialogSurface,
  buildFilePickerSurface: mockBuildFilePickerSurface,
  buildFilePickerSurfaceForInput: mockBuildFilePickerSurfaceForInput,
  isNonDomEid: mockIsNonDomEid,
  getSurfaceControl: vi.fn(),
}));

vi.mock('../../../src/non-dom/surface-xml.js', () => ({
  renderNonDomSurface: mockRenderNonDomSurface,
  renderNonDomControlDetails: vi.fn().mockReturnValue('<node synthetic="true" />'),
}));

vi.mock('../../../src/snapshot/snapshot-health.js', () => ({
  captureWithStabilization: vi.fn().mockResolvedValue({
    snapshot: {
      snapshot_id: 'snap-1',
      url: 'https://example.com',
      title: '',
      captured_at: '',
      viewport: { width: 1280, height: 720 },
      nodes: [],
      meta: { node_count: 0, interactive_count: 0 },
    },
    health: { valid: true, message: '' },
    attempts: 1,
  }),
  determineHealthCode: vi.fn().mockReturnValue('HEALTHY'),
}));

vi.mock('../../../src/state/health.types.js', () => ({
  createHealthyRuntime: vi.fn().mockReturnValue({
    cdp: { ok: true, recovered: false },
    snapshot: { ok: true, code: 'HEALTHY', attempts: 1, message: '' },
  }),
  createRecoveredCdpRuntime: vi.fn(),
}));

vi.mock('../../../src/non-dom/file-path-validator.js', () => ({
  validateFilePaths: vi.fn().mockReturnValue({ paths: ['/tmp/file.txt'] }),
  FileValidationError: class extends Error {},
}));

vi.mock('../../../src/non-dom/file-input-resolver.js', () => {
  class FileInputNotFoundError extends Error {}
  return {
    resolveAndUploadFiles: vi.fn().mockResolvedValue(undefined),
    resolveFileInputTarget: vi.fn().mockRejectedValue(new FileInputNotFoundError()),
    resolveFileInputBackendNodeId: vi.fn().mockRejectedValue(new FileInputNotFoundError()),
    FileInputNotFoundError,
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { click, type } from '../../../src/tools/interaction-tools.js';
import { resolveAndUploadFiles } from '../../../src/non-dom/file-input-resolver.js';
import { validateFilePaths } from '../../../src/non-dom/file-path-validator.js';
import { createTestToolContext } from '../../helpers/test-tool-context.js';
import type { ToolContext } from '../../../src/tools/tool-context.types.js';

// ── Shared test setup ────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return createTestToolContext({
    getSnapshotStore: vi.fn().mockReturnValue(mockSnapshotStore),
    resolveExistingPage: vi.fn().mockReturnValue(mockHandle),
    ensureCdpSession: vi.fn().mockResolvedValue({
      handle: mockHandle,
      recovered: false,
      runtime_health: {
        cdp: { ok: true, recovered: false },
        snapshot: { ok: true, code: 'HEALTHY', attempts: 1, message: '' },
      },
    }),
    requireSnapshot: vi.fn().mockReturnValue({ nodes: [] }),
    resolveElementByEid: vi.fn().mockReturnValue({
      node_id: 'n1',
      backend_node_id: 123,
      kind: 'button',
      label: 'Submit',
      attributes: {},
    }),
    ...overrides,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('click — nd-* EID routing (dialog controls)', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNonDomEid.mockReturnValue(true);
    mockGetSurface.mockReturnValue(mockDialogSurface);
    mockDialogManager.resolveDialog.mockResolvedValue(undefined);
    mockSnapshotStore.getByPageId.mockReturnValue({
      snapshot_id: 'snap-pre',
      nodes: [],
      meta: {},
    });
    ctx = makeCtx();
  });

  it('nd-dialog-ok calls resolveDialog("accept") and clears the surface', async () => {
    await click({ page_id: 'test-page', eid: 'nd-dialog-ok' }, ctx);

    expect(mockDialogManager.resolveDialog).toHaveBeenCalledWith('accept', undefined);
    expect(mockClearSurface).toHaveBeenCalled();
  });

  it('nd-dialog-dismiss calls resolveDialog("dismiss") and clears the surface', async () => {
    await click({ page_id: 'test-page', eid: 'nd-dialog-dismiss' }, ctx);

    expect(mockDialogManager.resolveDialog).toHaveBeenCalledWith('dismiss');
    expect(mockClearSurface).toHaveBeenCalled();
  });

  it('nd-dialog-ok on prompt surface passes the typed text', async () => {
    const promptSurface = {
      ...mockDialogSurface,
      dialogType: 'prompt',
      controls: [
        { eid: 'nd-dialog-input', kind: 'input' as const, label: 'Response', value: 'my answer' },
        { eid: 'nd-dialog-ok', kind: 'button' as const, label: 'Submit' },
      ],
    };
    mockGetSurface.mockReturnValue(promptSurface);

    await click({ page_id: 'test-page', eid: 'nd-dialog-ok' }, ctx);

    expect(mockDialogManager.resolveDialog).toHaveBeenCalledWith('accept', 'my answer');
  });

  it('throws when no active surface exists for nd-* click', async () => {
    mockGetSurface.mockReturnValue(null);

    await expect(click({ page_id: 'test-page', eid: 'nd-dialog-ok' }, ctx)).rejects.toThrow(
      'No active non-DOM surface'
    );
  });

  it('throws for unknown nd-* EID', async () => {
    await expect(click({ page_id: 'test-page', eid: 'nd-unknown-control' }, ctx)).rejects.toThrow(
      'Unknown non-DOM control'
    );
  });
});

describe('click — nd-* EID routing (file picker)', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNonDomEid.mockReturnValue(true);
    mockGetSurface.mockReturnValue({
      ...mockPickerSurface,
      controls: [
        {
          eid: 'nd-picker-path',
          kind: 'input' as const,
          label: 'File path',
          value: '/tmp/file.txt',
        },
        { eid: 'nd-picker-choose', kind: 'button' as const, label: 'Choose' },
        { eid: 'nd-picker-cancel', kind: 'button' as const, label: 'Cancel' },
      ],
    });
    ctx = makeCtx();
  });

  it('nd-picker-cancel clears the surface and returns state', async () => {
    await click({ page_id: 'test-page', eid: 'nd-picker-cancel' }, ctx);

    expect(mockClearSurface).toHaveBeenCalled();
    expect(mockDialogManager.resolveDialog).not.toHaveBeenCalled();
  });

  it('nd-picker-choose with empty path throws', async () => {
    mockGetSurface.mockReturnValue({
      ...mockPickerSurface,
      controls: [
        { eid: 'nd-picker-path', kind: 'input' as const, label: 'File path', value: '' },
        { eid: 'nd-picker-choose', kind: 'button' as const, label: 'Choose' },
        { eid: 'nd-picker-cancel', kind: 'button' as const, label: 'Cancel' },
      ],
    });

    await expect(click({ page_id: 'test-page', eid: 'nd-picker-choose' }, ctx)).rejects.toThrow(
      'File path is empty'
    );
  });

  it('nd-picker-choose uploads a single file via the typed path (click+type flow)', async () => {
    // beforeEach surface: selectSingle, backendNodeId 42, nd-picker-path = "/tmp/file.txt"
    vi.mocked(validateFilePaths).mockReturnValueOnce({ paths: ['/tmp/file.txt'] });

    await click({ page_id: 'test-page', eid: 'nd-picker-choose' }, ctx);

    expect(resolveAndUploadFiles).toHaveBeenCalledWith(mockHandle.cdp, 42, ['/tmp/file.txt']);
    expect(mockClearSurface).toHaveBeenCalled();
  });

  it('nd-picker-choose uploads multiple newline-separated files for a selectMultiple picker', async () => {
    mockGetSurface.mockReturnValue({
      ...mockPickerSurface,
      pickerMode: 'selectMultiple',
      pickerBackendNodeId: 99,
      controls: [
        {
          eid: 'nd-picker-path',
          kind: 'input' as const,
          label: 'File paths (one per line)',
          value: '/tmp/a.txt\n/tmp/b.txt',
        },
        { eid: 'nd-picker-choose', kind: 'button' as const, label: 'Choose' },
        { eid: 'nd-picker-cancel', kind: 'button' as const, label: 'Cancel' },
      ],
    });
    vi.mocked(validateFilePaths).mockReturnValueOnce({ paths: ['/tmp/a.txt', '/tmp/b.txt'] });

    await click({ page_id: 'test-page', eid: 'nd-picker-choose' }, ctx);

    expect(validateFilePaths).toHaveBeenCalledWith(['/tmp/a.txt', '/tmp/b.txt'], expect.anything());
    expect(resolveAndUploadFiles).toHaveBeenCalledWith(mockHandle.cdp, 99, [
      '/tmp/a.txt',
      '/tmp/b.txt',
    ]);
    expect(mockClearSurface).toHaveBeenCalled();
  });
});

describe('click — DOM element: dialog detection post-click', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNonDomEid.mockReturnValue(false);
    mockGetSurface.mockReturnValue(null);
    mockDialogManager.getPendingDialog.mockReturnValue(null);
    mockDialogManager.wasFileChooserOpenedSince.mockReturnValue(false);
    ctx = makeCtx();
  });

  it('detects a dialog after a DOM click and returns surface XML without stabilizing', async () => {
    mockDialogManager.getPendingDialog.mockReturnValue({
      type: 'alert',
      message: 'Hello',
      defaultValue: '',
      url: 'https://example.com',
    });

    const result = await click({ page_id: 'test-page', eid: 'e1' }, ctx);

    // Must NOT call stabilizeAfterAction (would hang with dialog open)
    expect(mockStabilizeAfterAction).not.toHaveBeenCalled();
    // Must build and set the surface
    expect(mockBuildDialogSurface).toHaveBeenCalled();
    expect(mockSetSurface).toHaveBeenCalled();
    // Result includes surface XML
    expect(result).toContain('<non_dom />');
  });

  it('returns dialog surface without waiting for a hung click command', async () => {
    const pendingDialog = {
      type: 'alert',
      message: 'Hello',
      defaultValue: '',
      url: 'https://example.com',
    };
    let pendingChecks = 0;
    mockDialogManager.getPendingDialog.mockImplementation(() => {
      pendingChecks += 1;
      return pendingChecks >= 2 ? pendingDialog : null;
    });
    mockClickByBackendNodeId.mockImplementationOnce(() => new Promise(() => undefined));

    const startedAt = Date.now();
    const result = await click({ page_id: 'test-page', eid: 'e1' }, ctx);

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result).toContain('<non_dom />');
    expect(mockStabilizeAfterAction).not.toHaveBeenCalled();
  });

  it('detects a file chooser after a DOM click and builds a file-picker surface', async () => {
    mockDialogManager.wasFileChooserOpenedSince.mockReturnValue(true);
    mockDialogManager.getFileChooserState.mockReturnValue({
      opened: true,
      timestamp: Date.now(),
      backendNodeId: 99,
      mode: 'selectSingle',
    });

    const result = await click({ page_id: 'test-page', eid: 'e1' }, ctx);

    expect(mockBuildFilePickerSurface).toHaveBeenCalledWith(99, 'selectSingle');
    expect(mockSetSurface).toHaveBeenCalled();
    expect(result).toContain('<non_dom />');
  });

  it('takes the normal DOM path when no non-DOM surface is opened', async () => {
    const result = await click({ page_id: 'test-page', eid: 'e1' }, ctx);

    expect(mockStabilizeAfterAction).toHaveBeenCalled();
    expect(mockClickByBackendNodeId).toHaveBeenCalledWith({}, 123, undefined);
    expect(result).toBeDefined();
  });
});

describe('click — file input: builds file-picker surface immediately', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNonDomEid.mockReturnValue(false);
    mockGetSurface.mockReturnValue(null);
    ctx = makeCtx({
      resolveElementByEid: vi.fn().mockReturnValue({
        node_id: 'n-file',
        backend_node_id: 55,
        kind: 'input',
        label: 'Upload file',
        attributes: { input_type: 'file' },
      }),
    });
  });

  it('does not click the file input but returns a file-picker surface', async () => {
    const result = await click({ page_id: 'test-page', eid: 'file-eid' }, ctx);

    expect(mockClickByBackendNodeId).not.toHaveBeenCalled();
    expect(mockBuildFilePickerSurfaceForInput).toHaveBeenCalled();
    expect(mockSetSurface).toHaveBeenCalled();
    expect(result).toContain('<non_dom />');
  });
});

describe('type — nd-* EID routing', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNonDomEid.mockImplementation((eid: string) => eid.startsWith('nd-'));
    mockSnapshotStore.getByPageId.mockReturnValue({
      snapshot_id: 'snap-pre',
      nodes: [],
      meta: {},
    });
    ctx = makeCtx();
  });

  it('updates the surface input value and returns state + surface XML', async () => {
    mockGetSurface.mockReturnValue(mockDialogSurface);
    // Pretend nd-dialog-ok is a valid input (for simplicity, override the mock surface)
    const promptSurface = {
      ...mockDialogSurface,
      controls: [
        {
          eid: 'nd-dialog-input',
          kind: 'input' as const,
          label: 'Prompt response',
          value: '',
        },
      ],
    };
    mockGetSurface.mockReturnValue(promptSurface);
    mockUpdateInputValue.mockReturnValue(true);

    const result = await type({ page_id: 'test-page', eid: 'nd-dialog-input', text: 'hello' }, ctx);

    expect(mockUpdateInputValue).toHaveBeenCalledWith(
      mockHandle.page,
      'nd-dialog-input',
      'hello',
      false
    );
    expect(result).toContain('<non_dom />');
  });

  it('throws when the targeted nd-* EID is a button, not an input', async () => {
    mockGetSurface.mockReturnValue(mockDialogSurface); // has nd-dialog-ok as button

    await expect(
      type({ page_id: 'test-page', eid: 'nd-dialog-ok', text: 'x' }, ctx)
    ).rejects.toThrow('not an input');
  });

  it('throws when no active surface exists for nd-* type', async () => {
    mockGetSurface.mockReturnValue(null);

    await expect(
      type({ page_id: 'test-page', eid: 'nd-dialog-input', text: 'x' }, ctx)
    ).rejects.toThrow('No active non-DOM surface');
  });

  it('passes through to executeActionWithRetry for non-nd EIDs', async () => {
    const { executeActionWithRetry } = await import('../../../src/tools/execute-action.js');

    await type({ page_id: 'test-page', eid: 'dom-eid', text: 'hello' }, ctx);

    expect(executeActionWithRetry).toHaveBeenCalled();
  });
});
