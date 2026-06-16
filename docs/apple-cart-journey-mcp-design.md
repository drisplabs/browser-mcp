# Apple Cart Journey: Why Agent Web Interface Works for LLM Agents

A walkthrough of adding an iPhone to Apple's shopping bag, used to show what makes AWI a stronger MCP design for browser-using agents than raw DOM or screenshot-only workflows.

**Task:** Add `iPhone 17 256GB Lavender` (unlocked, no AppleCare) to the bag and verify. Stop before checkout.

**Result:** Configured item added successfully at $829.00. Verified on the bag page.

Apple's buy flow is a good stress test — repeated product copy, gated configuration, dynamic recommendations, soft navigations, cart validation. DOM dumps and screenshots burn the context budget on UI discovery instead of reasoning.

## The journey: calls and responses in order

The sequence below is what matters. AWI's value shows up in the *pairing* of each call with the shape of its response — how the next available action becomes visible, how state changes are surfaced, and how the agent knows what to do next.

### 1. Land on the iPhone page with semantic regions

```text
navigate({ url: "https://www.apple.com/iphone/" })
```

Response partitions the page into named regions and exposes the buy path as a labeled link:

```xml
<region name="nav">...</region>
<region name="main">...</region>
<link id="47a7d77ecbfa" href="/us/shop/goto/buy_iphone">Shop iPhone</link>
```

No parsing thousands of nodes or guessing which "Shop iPhone" instance is meaningful.

### 2. Click into the buy path, then fall back to direct navigation

```text
click({ eid: "47a7d77ecbfa", page_id: "..." })
navigate({ url: "https://www.apple.com/us/shop/goto/buy_iphone", page_id: "..." })
```

Because clicks through marketing redirects can be fragile, the agent falls back to `navigate` using the href it already captured — a pattern that recurs throughout the run.

### 3. `find` by intent, not CSS

```text
find({ label: "iPhone 17", region: "main", limit: 20, include_readable: true })
```

Returns both an accessible selector and the destination URL:

```xml
<match eid="6c726203c0e8" kind="link" label="Buy - iPhone 17"
       selector="role=link[name=&quot;Buy - iPhone 17&quot;]"
       href="https://www.apple.com/shop/buy-iphone/iphone-17" />
```

### 4. Scan radios to see what's enabled — and what isn't

```text
navigate({ url: "https://www.apple.com/shop/buy-iphone/iphone-17", page_id: "..." })
find({ kind: "radio", region: "main", limit: 30, include_readable: true })
```

Apple's configurator gates storage until color is chosen. AWI surfaces that as state directly:

```xml
<match kind="radio" label="Lavender" enabled="true" />
<match kind="radio" label="256GB ..." enabled="false" />
<match kind="radio" label="No trade-in" enabled="false" />
<match kind="radio" label="Connect to any carrier later" enabled="false" />
<match kind="radio" label="No AppleCare coverage ..." enabled="false" />
```

The agent reads `enabled="false"` and works backward to the prerequisite.

### 5. Click color — default click misses, `get_element` recovers

```text
click({ eid: "995c309fb0e8", page_id: "..." })
```

Default click didn't advance the page. `get_element` returns geometry and fallback selectors:

```text
get_element({ eid: "995c309fb0e8", page_id: "..." })
```

```xml
<node eid="995c309fb0e8" kind="radio" x="1049" y="684" w="36" h="36">
  Lavender
  <selector primary='role=radio[name="Lavender"]'
            alternates='[name="dimensionColor"];input.colornav-value' />
</node>
```

A targeted click inside the radio bounds succeeds:

```text
click({ eid: "995c309fb0e8", page_id: "...", x: 18, y: 18 })
```

Next snapshot shows storage now enabled — the gate released:

```xml
<rad id="995c309fb0e8" checked="true" val="lavender">Lavender</rad>
<rad id="87d12aeb2810" val="256gb">256GB ...</rad>
<rad id="e1f1e837396c" val="512gb">512GB ...</rad>
```

### 6. Walk the gated sequence — each choice unlocks the next

```text
click({ eid: "87d12aeb2810" })   // 256GB
click({ eid: "94cc4cbcf0f1" })   // No trade-in
click({ eid: "067a237c5e5a" })   // Buy full price
click({ eid: "bce6fc042f7b" })   // Connect to any carrier later
```

Response diffs expose what changed at each step. After no-trade-in:

```xml
<rad id="94cc4cbcf0f1" checked="true" val="noTradeIn">No trade-in</rad>
<rad id="067a237c5e5a" val="fullprice">Buy From $799.00 ...</rad>
<rad id="b036e3106556" val="finance">Finance ...</rad>
```

After full-price payment:

```xml
<rad id="067a237c5e5a" checked="true" val="fullprice">Buy ...</rad>
<rad id="bce6fc042f7b" val="UNLOCKED/US">Connect to any carrier later $829.00</rad>
```

Current state, next available actions, recognizable labels — nothing more.

### 7. A navigation baseline flags state reset

Selecting the unlocked carrier changes the URL to the fully configured product page. The response includes:

```xml
<baseline reason="navigation" />
```

That's the signal: old eids are stale. Re-query before acting.

```text
find({ kind: "radio", label: "No AppleCare", limit: 5, include_readable: true })
click({ eid: "a5e5a0b7c633" })
```

### 8. Add to Bag fails — the failure is legible, so recovery works

```text
click({ eid: "31f426071430", page_id: "..." })
```

Click routed to a `#` URL and Apple's 404:

```xml
<state title="Page Not Found - Apple">
  <region name="main">
    <link href="https://www.apple.com/sitemap">Or see our site map</link>
  </region>
</state>
```

Agent detects the wrong state from title and regions, then navigates back using the configured product URL it captured earlier:

```text
navigate({ url: "https://www.apple.com/shop/buy-iphone/iphone-17/6.3-inch-display-256gb-lavender-unlocked" })
```

After re-selecting AppleCare and re-clicking Add to Bag with coordinates, the form advances and exposes a `Review Bag` button:

```xml
<region name="form">
  <btn id="71950a065996" val="proceed">Review Bag</btn>
</region>
```

### 9. Verify the cart without checking out

```text
click({ eid: "71950a065996" })
find({ label: "iPhone 17", region: "main", limit: 20, include_readable: true })
```

Bag page exposes the configured item and controls directly:

```xml
<match kind="heading" label="iPhone 17 256GB Lavender" />
<match kind="link" label="iPhone 17 256GB Lavender"
       href="/shop/product/mg494ll/a/6.3-inch-display-256gb-lavender?cppart=UNLOCKED/US" />
<match kind="button" label="Remove iPhone 17 256GB Lavender" />
```

Completion is provable by querying cart state.

## Why this matters

AWI changes the unit of interaction from browser internals to UI meaning:

- Semantic regions trim tokens while preserving what matters
- `find` queries by user-facing intent, not brittle CSS
- Every actionable element carries eid, kind, label, selector, visibility, enabled state, and href/value
- Diffs expose what changed; baselines separate full navigation from in-page mutation
- `get_element` supplies geometry and Playwright-compatible selectors when needed
- Verification reads resulting state instead of inferring from the previous click

## Improvement investigation

The journey surfaced rough edges worth productizing. I checked them against the current implementation so this section is grounded in code, not just the transcript.

### Bind actions to the snapshot that produced the eid

The recovery path showed a stale-eid hazard: after navigation, an old eid can still be present in the transcript and the action tool accepts only `page_id` plus `eid`. `SessionController.resolveElementByEid()` resolves against the page's current `ElementRegistry` and latest stored snapshot, not against the snapshot that originally produced the eid.

Relevant code:

- `src/session/session-controller.ts:271` resolves by `pageId + eid + latest snapshot`
- `src/state/element-registry.ts:56` increments the registry step for every snapshot update
- `src/state/element-registry.ts:93` overwrites `byEid` when the same eid appears in a newer snapshot
- `src/state/element-registry.ts:99` keeps removed eids for staleness detection instead of deleting them immediately

Potential improvement: require action calls to include the source `snapshot_id` or state `step`, or encode that generation into the eid. Reject or warn when the eid was produced before the latest baseline/navigation. A lighter version would emit a warning when `ElementRef.snapshot_id` differs from the current snapshot id.

### Classify suspicious post-click navigations

The first `Add to Bag` click navigated to a configured product URL with a trailing `#` and rendered Apple's 404 page. AWI surfaced the failure clearly, but the click outcome still looked like a successful navigation because the URL changed and a page state was captured.

Relevant code:

- `src/tools/execute-action.ts:328` captures the pre-click navigation state
- `src/tools/execute-action.ts:335` checks immediate navigation after the action
- `src/tools/execute-action.ts:405` performs late navigation detection after stabilization
- `src/tools/execute-action.ts:424` renders the resulting state, trimming when navigation occurred

Potential improvement: add a conservative anomaly hint when a submit-like click lands on an error-like page. For example, if a click label contains `Add to Bag`, `Checkout`, `Continue`, or `Submit`, and the resulting title/heading contains `Page Not Found`, `Error`, or `Access Denied`, the response could include:

```xml
<warning type="unexpected-navigation" after="Add to Bag">
  Click navigated to Page Not Found; target may require a different activation path.
</warning>
```

That keeps the normal state snapshot intact while giving the agent a clear recovery cue.

### Prefer viewport-near elements when trimming large regions

After the iPhone was configured, Apple showed many accessory recommendations with repeated `Add to Bag` controls. Current trimming is predictable but simple: keep the head and tail of each region.

Relevant code:

- `src/state/state-renderer.ts:26` defines per-region head/tail limits
- `src/state/state-renderer.ts:46` implements `trimRegionElements()`
- `src/state/state-renderer.ts:53` keeps `elements.slice(0, head)`
- `src/state/state-renderer.ts:54` keeps `elements.slice(-tail)`
- `src/state/state-renderer.ts:158` only trims when `trimRegions` is passed

Potential improvement: make trimming viewport-aware and mutation-aware. Keep focused elements, changed elements, viewport-near controls, a few structural anchors, and relevant proceed/checkout actions. The trim comment could say what policy was used:

```xml
<!-- trimmed 86 items; kept focused, changed, and viewport-near controls. Use find with region=main to see all -->
```

### Add explicit step semantics for configurators

Apple's flow is a gated configurator: color, storage, trade-in, payment, carrier, AppleCare, then bag/recommendations. The snapshots expose enabled/disabled state well, but the form model still treats every pattern as `single_page`.

Relevant code:

- `src/form/input-clustering.ts:42` clusters fields by vertical proximity
- `src/form/input-clustering.ts:59` uses a configured pixel distance as the split point
- `src/form/form-detector.ts:415` currently returns `single_page` for every form pattern

Potential improvement: detect configurator steps from headings, radio groups, enabled-state transitions, and observed dependency effects. Then expose step status directly:

```xml
<step name="Storage" status="available" complete="false">
  <rad id="..." val="256gb">256GB</rad>
</step>
<step name="Trade In" status="locked" reason="Choose storage first" />
```

That would let the agent understand the path through the funnel, not just the controls currently visible.

### Already addressed in this branch

Some obvious concerns from the Apple journey are already fixed in code:

- Clicks send `mouseMoved` before press/release in `src/snapshot/element-resolver.ts:265`.
- Tiny custom radio/checkbox inputs can redirect to larger ancestors in `src/snapshot/element-resolver.ts:235`.
- Stale retry scores candidates by label, kind, region, heading, and group context in `src/tools/stale-element-retry.ts`.
- Select changes dispatch both `input` and `change` events in `src/snapshot/element-resolver.ts`.
- Radio grouping uses the HTML `name` attribute in `src/form/constraint-extraction.ts`.

These are the reasons semantic state, selectors, geometry, navigation markers, and generation-aware ids all need to coexist. The agent could recover precisely because every layer was available; the improvements above would make that recovery less manual.
