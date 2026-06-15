/**
 * Action tool page focus tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBringToFront,
  mockRequireSnapshot,
  mockResolveElementByEid,
  mockSnapshotStore,
  mockHandle,
  mockDialogManager,
} = vi.hoisted(() => {
  const mockBringToFront = vi.fn().mockResolvedValue(undefined);
  const mockRequireSnapshot = vi.fn();
  const mockResolveElementByEid = vi.fn();
  const mockSnapshotStore = {
    store: vi.fn(),
    getByPageId: vi.fn().mockReturnValue(undefined),
    removeByPageId: vi.fn(),
    clear: vi.fn(),
  };
  const mockDialogManager = {
    attach: vi.fn().mockResolvedValue(undefined),
    getPendingDialog: vi.fn().mockReturnValue(null),
    wasFileChooserOpenedSince: vi.fn().mockReturnValue(false),
    getFileChooserState: vi.fn(),
    clearFileChooser: vi.fn(),
    resolveDialog: vi.fn(),
  };
  const mockHandle = {
    page_id: 'page-focus',
    page: {
      bringToFront: mockBringToFront,
      url: vi.fn().mockReturnValue('http://example.com'),
    },
    cdp: {},
    created_at: new Date(),
  };

  return {
    mockBringToFront,
    mockRequireSnapshot,
    mockResolveElementByEid,
    mockSnapshotStore,
    mockHandle,
    mockDialogManager,
  };
});

const mockSessionManager = {
  syncPages: vi.fn(),
};

vi.mock('../../../src/form/index.js', () => ({
  getDependencyTracker: vi.fn(() => ({
    clearPage: vi.fn(),
    clearAll: vi.fn(),
  })),
}));

vi.mock('../../../src/snapshot/index.js', () => ({
  SnapshotStore: class {
    store = mockSnapshotStore.store;
    getByPageId = mockSnapshotStore.getByPageId;
    removeByPageId = mockSnapshotStore.removeByPageId;
    clear = mockSnapshotStore.clear;
  },
  clickByBackendNodeId: vi.fn(),
  clickAtCoordinates: vi.fn(),
  clickAtElementOffset: vi.fn(),
  dragBetweenCoordinates: vi.fn(),
  dispatchWheelEvent: vi.fn(),
  typeByBackendNodeId: vi.fn(),
  pressKey: vi.fn(),
  selectOption: vi.fn(),
  hoverByBackendNodeId: vi.fn(),
  scrollIntoView: vi.fn(),
  scrollPage: vi.fn(),
}));

vi.mock('../../../src/snapshot/snapshot-health.js', () => ({
  captureWithStabilization: vi.fn().mockResolvedValue({
    snapshot: {
      snapshot_id: 'snap-1',
      url: 'http://example.com',
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

vi.mock('../../../src/observation/index.js', () => ({
  observationAccumulator: {
    inject: vi.fn(),
    getAccumulatedObservations: vi.fn(),
    filterBySignificance: vi.fn(),
  },
}));

vi.mock('../../../src/tools/execute-action.js', () => ({
  executeAction: vi.fn(),
  executeActionWithRetry: vi.fn(),
  executeActionWithOutcome: vi.fn(),
}));

vi.mock('../../../src/tools/action-stabilization.js', () => ({
  stabilizeAfterAction: vi.fn().mockResolvedValue({ status: 'stable' }),
  stabilizeAfterNavigation: vi.fn(),
  captureSnapshotFallback: vi.fn(),
}));

vi.mock('../../../src/tools/navigation-detection.js', () => ({
  captureNavigationState: vi.fn().mockResolvedValue({ url: 'http://example.com' }),
  checkNavigationOccurred: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/non-dom/dialog-manager.js', () => ({
  getOrCreateDialogManager: vi.fn(() => mockDialogManager),
}));

vi.mock('../../../src/non-dom/surface-store.js', () => ({
  getSurface: vi.fn().mockReturnValue(null),
  setSurface: vi.fn(),
  clearSurface: vi.fn(),
  updateInputValue: vi.fn(),
  buildDialogSurface: vi.fn(),
  buildFilePickerSurface: vi.fn(),
  buildFilePickerSurfaceForInput: vi.fn(),
  isNonDomEid: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/non-dom/surface-xml.js', () => ({
  renderNonDomSurface: vi.fn().mockReturnValue(''),
  renderNonDomControlDetails: vi.fn().mockReturnValue(''),
}));

vi.mock('../../../src/state/element-identity.js', () => ({
  computeEid: vi.fn(),
}));

vi.mock('../../../src/state/health.types.js', () => ({
  createHealthyRuntime: vi.fn(),
  createRecoveredCdpRuntime: vi.fn(),
}));

vi.mock('../../../src/query/query-engine.js', () => ({
  QueryEngine: vi.fn(),
}));

vi.mock('../../../src/screenshot/index.js', () => ({
  captureScreenshot: vi.fn(),
  getElementBoundingBox: vi.fn(),
}));

vi.mock('../../../src/lib/temp-file.js', () => ({
  cleanupTempFiles: vi.fn().mockResolvedValue(undefined),
}));

import { click } from '../../../src/tools/browser-tools.js';
import { createTestToolContext } from '../../helpers/test-tool-context.js';
import type { ToolContext } from '../../../src/tools/tool-context.types.js';

describe('click page focus', () => {
  let ctx: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSnapshot.mockReturnValue({
      nodes: [],
    });
    mockResolveElementByEid.mockReturnValue({
      node_id: 'n1',
      backend_node_id: 123,
      kind: 'link',
      label: 'Learn more',
      attributes: {},
    });
    mockSnapshotStore.getByPageId.mockReturnValue({ snapshot_id: 'snap-1', nodes: [], meta: {} });
    ctx = createTestToolContext({
      getSessionManager: vi
        .fn()
        .mockReturnValue(mockSessionManager) as ToolContext['getSessionManager'],
      getSnapshotStore: vi
        .fn()
        .mockReturnValue(mockSnapshotStore) as ToolContext['getSnapshotStore'],
      resolveExistingPage: vi
        .fn()
        .mockReturnValue(mockHandle) as ToolContext['resolveExistingPage'],
      ensureCdpSession: vi.fn().mockResolvedValue({
        handle: mockHandle,
        recovered: false,
        runtime_health: {},
      }) as ToolContext['ensureCdpSession'],
      requireSnapshot: mockRequireSnapshot as ToolContext['requireSnapshot'],
      resolveElementByEid: mockResolveElementByEid as ToolContext['resolveElementByEid'],
    });
  });

  it('does not bring page to front by default', async () => {
    await click({ page_id: 'page-focus', eid: 'eid-1' }, ctx);

    expect(mockBringToFront).not.toHaveBeenCalled();
  });

  it('brings the target page to the front when BRING_TO_FRONT is true', async () => {
    process.env.BRING_TO_FRONT = 'true';
    try {
      await click({ page_id: 'page-focus', eid: 'eid-1' }, ctx);

      expect(mockBringToFront).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.BRING_TO_FRONT;
    }
  });
});
