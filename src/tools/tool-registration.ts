/**
 * Tool Registration
 *
 * Extracts all 25 MCP tool registrations into a reusable function.
 * Used by both stdio (index.ts) and HTTP (http-gateway.ts) entry points.
 */

import type { ToolContext } from './tool-context.types.js';
import type { ToolRegistrar } from '../server/tool-registrar.types.js';

export type { ToolRegistrar } from '../server/tool-registrar.types.js';

// Import all tool handlers
import { listPages, closePage } from './navigation-tools.js';
import { navigate, goBack, goForward, reload } from './navigation-tools.js';
import {
  captureSnapshot,
  findElements,
  getNodeDetails,
  scrollElementIntoView,
  scrollPage,
} from './observation-tools.js';
import { click, type, press, select, hover } from './interaction-tools.js';
import { drag, wheel, takeScreenshot } from './viewport-tools.js';
import { inspectCanvas } from './canvas-tools.js';
import { getFormUnderstanding, getFieldContext } from './form-tools.js';
import { readPage } from './readability-tools.js';
import { listNetworkCalls, searchNetworkCalls } from './network-tools.js';

// Import all input schemas
import {
  ListPagesInputSchema,
  ClosePageInputSchema,
  NavigateInputSchema,
  GoBackInputSchema,
  GoForwardInputSchema,
  ReloadInputSchema,
  CaptureSnapshotInputSchema,
  FindElementsInputSchema,
  GetNodeDetailsInputSchema,
  ScrollElementIntoViewInputSchemaBase,
  ScrollPageInputSchema,
  ClickInputSchemaBase,
  TypeInputSchemaBase,
  PressInputSchema,
  SelectInputSchemaBase,
  HoverInputSchemaBase,
  DragInputSchemaBase,
  WheelInputSchemaBase,
  TakeScreenshotInputSchemaBase,
  InspectCanvasInputSchemaBase,
  ReadPageInputSchema,
} from './tool-schemas.js';
import { GetFormUnderstandingInputSchema, GetFieldContextInputSchema } from './form-tools.js';
import { ListNetworkCallsInputSchema, SearchNetworkCallsInputSchema } from './tool-schemas.js';

/**
 * Context resolver function type.
 * Returns a ToolContext for the current request.
 */
export type ContextResolver = () => ToolContext | Promise<ToolContext>;

/** Tools that should not trigger lazy browser initialization */
const SKIP_BROWSER_INIT = new Set(['close_page', 'list_pages']);

/**
 * Register all browser automation tools on an MCP server.
 *
 * Browser initialization is session-scoped: each ToolContext owns its own
 * SessionManager and lazily launches/connects via ctx.ensureBrowser().
 *
 * @param server - The MCP server instance
 * @param resolveCtx - Function that returns the ToolContext for the current request
 */
export function registerAllTools(server: ToolRegistrar, resolveCtx: ContextResolver): void {
  // Helper: resolve context first, then ensure browser, then run handler.
  // Context resolution is cheap (returns existing SessionController),
  // so it's safe to resolve before the browser is running.
  function wrap<T, R>(
    handler: (input: T, ctx: ToolContext) => R | Promise<R>,
    toolName?: string
  ): (input: T) => Promise<R> {
    return async (input: T) => {
      const ctx = await resolveCtx();
      if (!SKIP_BROWSER_INIT.has(toolName ?? '')) {
        await ctx.ensureBrowser();
      }
      return handler(input, ctx);
    };
  }

  // ============================================================================
  // SESSION TOOLS
  // ============================================================================

  server.registerTool(
    'list_pages',
    {
      title: 'List Pages',
      description: 'List all open browser pages with their page_id, URL, and title.',
      inputSchema: ListPagesInputSchema.shape,
    },
    wrap(listPages, 'list_pages')
  );

  server.registerTool(
    'close_page',
    {
      title: 'Close Page',
      description: 'Close a browser tab. Use list_pages first to get the page_id.',
      inputSchema: ClosePageInputSchema.shape,
    },
    wrap(closePage, 'close_page')
  );

  // ============================================================================
  // NAVIGATION TOOLS
  // ============================================================================

  server.registerTool(
    'navigate',
    {
      title: 'Navigate',
      description: 'Go to a URL. Returns page snapshot with interactive elements.',
      inputSchema: NavigateInputSchema.shape,
    },
    wrap(navigate)
  );

  server.registerTool(
    'go_back',
    {
      title: 'Go Back',
      description:
        'Go back one page in browser history. Returns a fresh page snapshot of the resulting page with its interactive elements.',
      inputSchema: GoBackInputSchema.shape,
    },
    wrap(goBack)
  );

  server.registerTool(
    'go_forward',
    {
      title: 'Go Forward',
      description:
        'Go forward one page in browser history. Returns a fresh page snapshot of the resulting page with its interactive elements.',
      inputSchema: GoForwardInputSchema.shape,
    },
    wrap(goForward)
  );

  server.registerTool(
    'reload',
    {
      title: 'Reload',
      description:
        'Refresh the current page. Use after a change that only takes effect on reload, or to recover from a stale page. Returns a fresh page snapshot with its interactive elements.',
      inputSchema: ReloadInputSchema.shape,
    },
    wrap(reload)
  );

  server.registerTool(
    'snapshot',
    {
      title: 'Snapshot',
      description:
        'Re-capture the page state without performing any action. Use when the page may have changed on its own (timers, live updates, animations).',
      inputSchema: CaptureSnapshotInputSchema.shape,
    },
    wrap(captureSnapshot)
  );

  // ============================================================================
  // OBSERVATION TOOLS
  // ============================================================================

  server.registerTool(
    'find',
    {
      title: 'Find',
      description:
        'Locate elements or read page text without acting on them. Two modes: filter by `kind`/`label`/`region` to find interactive elements (returns each match with a stable `eid` for use with click, type, select, etc.), or set `include_readable` to also get text content tagged with semantic `rd-*` ids. Best for pinpointing a target before an action or pulling specific content; use snapshot for the whole page. Returns matching elements/content as XML.',
      inputSchema: FindElementsInputSchema.shape,
    },
    wrap(findElements)
  );

  server.registerTool(
    'get_element',
    {
      title: 'Get Element',
      description:
        'Get complete details for one element: exact position, size, state, and attributes. Requires an `eid` obtained from find or snapshot. Use when you need precise geometry or full attribute/state data for a single element. Returns the element details as XML.',
      inputSchema: GetNodeDetailsInputSchema.shape,
    },
    wrap(getNodeDetails)
  );

  server.registerTool(
    'screenshot',
    {
      title: 'Screenshot',
      description:
        'Capture a screenshot of the current page or a specific element. Use for visual verification or when layout/rendering matters; prefer snapshot or find for reading structure and text. Returns the image inline, or a file path when the image is large.',
      inputSchema: TakeScreenshotInputSchemaBase.shape,
    },
    wrap(takeScreenshot)
  );

  // ============================================================================
  // INTERACTION TOOLS
  // ============================================================================

  server.registerTool(
    'scroll_to',
    {
      title: 'Scroll To',
      description:
        'Scroll until a specific element (by `eid`) is visible in the viewport. Use before clicking or reading an element that find/snapshot reports as off-screen. Returns a fresh page snapshot reflecting the new scroll position.',
      inputSchema: ScrollElementIntoViewInputSchemaBase.shape,
    },
    wrap(scrollElementIntoView)
  );

  server.registerTool(
    'scroll',
    {
      title: 'Scroll',
      description:
        'Scroll the viewport up or down by a pixel amount. Use to reveal more of a long page or trigger lazy-loaded content; use scroll_to when you know the target element. Returns a fresh page snapshot reflecting the new scroll position.',
      inputSchema: ScrollPageInputSchema.shape,
    },
    wrap(scrollPage)
  );

  server.registerTool(
    'click',
    {
      title: 'Click Element',
      description:
        'Click an element (by `eid`) or at viewport coordinates. Prefer `eid` for reliability; use coordinates only for canvas or non-semantic targets. Returns a fresh page snapshot with the changes the click produced.',
      inputSchema: ClickInputSchemaBase.shape,
    },
    wrap(click)
  );

  server.registerTool(
    'type',
    {
      title: 'Type Text',
      description:
        'Type text into an input field or text area (by `eid`). Set `clear` to replace existing content instead of appending. Returns a fresh page snapshot reflecting the updated field and any resulting changes (validation, autocomplete, etc.).',
      inputSchema: TypeInputSchemaBase.shape,
    },
    wrap(type)
  );

  server.registerTool(
    'press',
    {
      title: 'Press Key',
      description:
        'Press a single keyboard key with optional modifiers, dispatched to the focused element. Use for submitting with Enter, dismissing with Escape, or keyboard navigation (Tab, arrows); use type to enter text. Returns a fresh page snapshot with any resulting changes.',
      inputSchema: PressInputSchema.shape,
    },
    wrap(press)
  );

  server.registerTool(
    'select',
    {
      title: 'Select Option',
      description: 'Choose an option from a dropdown menu by value or visible text.',
      inputSchema: SelectInputSchemaBase.shape,
    },
    wrap(select)
  );

  server.registerTool(
    'hover',
    {
      title: 'Hover Element',
      description:
        'Move mouse over an element without clicking. Triggers hover menus and tooltips.',
      inputSchema: HoverInputSchemaBase.shape,
    },
    wrap(hover)
  );

  server.registerTool(
    'drag',
    {
      title: 'Drag',
      description:
        'Drag from a source point to a target point (optionally relative to an element via `eid`). Use for reordering lists, moving sliders/handles, or manipulating canvas objects. Returns a fresh page snapshot with any resulting changes.',
      inputSchema: DragInputSchemaBase.shape,
    },
    wrap(drag)
  );

  server.registerTool(
    'wheel',
    {
      title: 'Wheel',
      description:
        'Dispatch a mouse wheel event at specific coordinates. Use for scroll-to-zoom (with Control modifier) or horizontal scrolling.',
      inputSchema: WheelInputSchemaBase.shape,
    },
    wrap(wheel)
  );

  // ============================================================================
  // CANVAS INSPECTION TOOLS
  // ============================================================================

  server.registerTool(
    'inspect_canvas',
    {
      title: 'Inspect Canvas',
      description:
        'Analyze a canvas element: auto-detect the rendering library, query its scene graph, and return an annotated screenshot with coordinate grid overlay.',
      inputSchema: InspectCanvasInputSchemaBase.shape,
    },
    wrap(inspectCanvas)
  );

  // ============================================================================
  // FORM UNDERSTANDING TOOLS
  // ============================================================================

  server.registerTool(
    'get_form',
    {
      title: 'Get Form',
      description:
        'Analyze all forms on the page: fields, required inputs, validation rules, and field dependencies. Call this first on any multi-field or multi-step form to plan the fill order, instead of scrolling and screenshotting. Returns each form as XML with per-field eids, state, constraints, and the suggested next field to fill.',
      inputSchema: GetFormUnderstandingInputSchema.shape,
    },
    wrap(getFormUnderstanding)
  );

  server.registerTool(
    'get_field',
    {
      title: 'Get Field',
      description:
        'Get detailed info about one form field (by `eid`): purpose, valid input formats, dependencies, and suggested values. Use to resolve a field get_form flagged as ambiguous or invalid before typing into it. Returns the field context as XML including constraints, options, and dependencies.',
      inputSchema: GetFieldContextInputSchema.shape,
    },
    wrap(getFieldContext)
  );

  // ============================================================================
  // READABILITY TOOLS
  // ============================================================================

  server.registerTool(
    'read_page',
    {
      title: 'Read Page',
      description:
        'Extract the main readable content from the page, removing navigation, ads, and clutter. Uses Mozilla Readability (Firefox Reader View engine). Best for articles, blog posts, documentation, and content-heavy pages.',
      inputSchema: ReadPageInputSchema.shape,
    },
    wrap(readPage)
  );

  // ============================================================================
  // NETWORK TOOLS
  // ============================================================================

  server.registerTool(
    'list_network_calls',
    {
      title: 'List Network Calls',
      description:
        'List HTTP requests and responses made by the page. Filter by resource type, method, status code, or URL pattern; supports pagination. Use after navigate or an action to inspect API traffic, confirm a request fired, or find failing calls (e.g. status_min=400). Returns request/response summaries as XML.',
      inputSchema: ListNetworkCallsInputSchema.shape,
    },
    wrap(listNetworkCalls)
  );

  server.registerTool(
    'search_network_calls',
    {
      title: 'Search Network Calls',
      description:
        'Search network calls by URL pattern (substring or regex). Use when you know part of the endpoint URL and want just those calls, optionally with headers and request body; use list_network_calls to browse all traffic. Returns matching requests as XML with optional headers and body details.',
      inputSchema: SearchNetworkCallsInputSchema.shape,
    },
    wrap(searchNetworkCalls)
  );
}
