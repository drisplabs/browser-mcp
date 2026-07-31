# Tool Overlap & Duplication Review

A review of the 25 MCP tools exposed by this server, focused on finding
duplicate and overlapping functionality. Sources reviewed: `src/tools/tool-schemas.ts`,
`src/tools/tool-registration.ts`, and the handler modules
(`observation-tools.ts`, `network-tools.ts`, `form-tools.ts`, `readability-tools.ts`,
`viewport-tools.ts`, `interaction-tools.ts`).

## Tool inventory (25)

| Category | Tools |
| --- | --- |
| Session | `list_pages`, `close_page` |
| Navigation | `navigate`, `go_back`, `go_forward`, `reload` |
| Observation | `snapshot`, `find`, `get_element`, `screenshot` |
| Interaction | `click`, `type`, `press`, `select`, `hover`, `scroll_to`, `scroll`, `drag`, `wheel` |
| Canvas | `inspect_canvas` |
| Form Understanding | `get_form`, `get_field` |
| Content | `read_page` |
| Network | `list_network_calls`, `search_network_calls` |

## Summary of findings

Ranked by strength of overlap (how redundant the tools actually are):

| # | Tools | Overlap | Severity |
| --- | --- | --- | --- |
| 1 | `list_network_calls` / `search_network_calls` | Near-identical filter surface; one is a superset of the other | **High** |
| 2 | `scroll` / `wheel` / `scroll_to` | Three scrolling primitives; `wheel` subsumes `scroll` | **High** |
| 3 | `find` (`include_readable`) / `read_page` / `snapshot` | Three ways to pull page text | Medium |
| 4 | `get_element` / `get_field` | Both return single-element detail by `eid`; `get_field` is a form-aware superset | Medium |
| 5 | `find` (`kind=textbox…`) / `get_form` | Both enumerate form fields with `eid`s | Medium |
| 6 | `click` / `drag` / `wheel` coordinate modes | Shared coordinate+`eid`+`modifiers` targeting convention | Low |

---

## 1. `list_network_calls` vs `search_network_calls` — High

These are the most redundant pair. Their input schemas are almost the same:

| Param | `list_network_calls` | `search_network_calls` |
| --- | --- | --- |
| `page_id` | ✅ | ✅ |
| `resource_type` | ✅ | ✅ |
| `method` | ✅ | ✅ |
| `status_min` / `status_max` | ✅ | ✅ |
| `limit` | ✅ | ✅ |
| `url_pattern` | ✅ (substring) | ✅ (**required**, substring or regex) |
| `url_regex` | ❌ | ✅ |
| `failed_only` | ✅ | ❌ |
| `include_headers` / `include_body` | ❌ | ✅ |
| `offset` (pagination) | ✅ | ❌ |

The substring-URL-filter capability exists in **both** tools, so
`search_network_calls` in its default (`url_regex=false`) mode is functionally a
subset of `list_network_calls` plus header/body detail. The only genuinely unique
capabilities are scattered across the two:

- `list` only: `failed_only`, `offset` pagination.
- `search` only: `url_regex`, `include_headers`, `include_body`.

**Recommendation:** collapse into a single `network_calls` tool. Make `url_pattern`
optional; add `url_regex`, `include_headers`, `include_body`, `failed_only`, and
`offset`. This removes the "which network tool do I use?" ambiguity for the agent
and eliminates a duplicated filter/render path. If two tools must remain for
prompt-clarity reasons, at least remove the duplicated `url_pattern` substring
matching from one of them so their responsibilities don't overlap.

## 2. `scroll` vs `wheel` vs `scroll_to` — High

Three tools cover scrolling:

- `scroll` — viewport up/down by a pixel `amount`.
- `wheel` — dispatches a wheel event at `x`/`y` with `deltaX`/`deltaY` (+ modifiers).
- `scroll_to` — scrolls a specific `eid` into view.

`wheel` is a strict superset of `scroll` for vertical scrolling: `scroll(down, 500)`
is `wheel(deltaY: 500)` at the viewport center, and `wheel` additionally supports
horizontal scrolling and ctrl-zoom. The two share the same underlying intent
("move the viewport by a delta") with `scroll` being the constrained, semantic
variant and `wheel` the low-level one.

`scroll_to` is distinct in *interface* (element-targeted, not delta-targeted) but
serves the same user goal — "reveal something off-screen" — that `scroll` is also
used for (the `scroll` description literally says "use `scroll_to` when you know the
target element").

**Recommendation:** keep `scroll_to` (semantically valuable, element-first). Consider
whether `scroll` and `wheel` should both exist. Options: (a) keep `scroll` as the
ergonomic default and drop `wheel`'s vertical overlap, documenting `wheel` as
"zoom / horizontal / precise-coordinate only"; or (b) merge them, giving `scroll` an
optional `direction: 'left'|'right'` and an optional coordinate anchor. At minimum,
the descriptions should draw a hard line so the agent isn't choosing between three
tools for a plain "scroll down".

## 3. `find` (`include_readable`) vs `read_page` vs `snapshot` — Medium

Three tools return page text content:

- `snapshot` — full structured page state; renders readable regions (`trimRegions: true`).
- `find` with `include_readable: true` (**default true**) — tags text nodes with `rd-*` ids.
- `read_page` — Mozilla Readability article extraction (title/byline/text).

`find` and `read_page` overlap on the "give me the page's text" intent, though they
use different engines (semantic snapshot vs Readability) and produce different
shapes. Because `include_readable` defaults to `true`, a plain `find` call already
returns readable content, blurring the line between "find an element" and "read the
page". `snapshot` also surfaces readable regions, so all three can answer "what does
this page say?".

**Recommendation:** these are defensibly distinct (structured vs article-clean vs
targeted), so this is about disambiguation, not deletion. Consider defaulting
`find`'s `include_readable` to `false` so `find` means "locate elements" and
`read_page`/`snapshot` own content extraction. Sharpen the descriptions to state the
one-line "use X when…" for each.

## 4. `get_element` vs `get_field` — Medium

Both take a single `eid` and return detailed information about that one element:

- `get_element` — geometry (`bbox`), `state`, `attributes`, locators.
- `get_field` — form-field `purpose`, `constraints`, `options`, `dependencies`,
  validation, suggested next action.

For any element that is a form field, both tools apply, and `get_field` is
effectively a richer, form-aware superset of the state/attribute data
`get_element` returns. An agent inspecting an input has two overlapping choices.

**Recommendation:** keep both (the form-domain data in `get_field` is genuinely
different from raw geometry), but make the boundary explicit in the descriptions:
`get_element` = "geometry/attributes for any element"; `get_field` = "form semantics
for an input". Alternatively, fold field context into `get_element` behind an
optional `include_form_context` flag to avoid two entry points.

## 5. `find` (`kind=textbox/checkbox/…`) vs `get_form` — Medium

`find` with `kind: 'textbox' | 'checkbox' | 'radio' | 'combobox'` enumerates form
inputs and returns each with an `eid`, `state`, and some attributes. `get_form`
also enumerates the page's form fields with `eid`s, plus constraints, dependencies,
completion state, and a suggested next field.

Both answer "what inputs are on this page and how do I target them?". `get_form` is
the richer, form-structured view; `find` is the flat, filter-driven view. Overlap is
partial (field discovery) rather than total.

**Recommendation:** acceptable as-is given the different altitude, but the tool
descriptions should steer: use `get_form` for filling forms (planning order,
constraints), use `find` for locating an individual control. Worth confirming the
`eid`s returned by the two paths are identical for the same field so results are
interchangeable (the code resolves both through the same `ElementRegistry`, which is
good — keep it that way).

## 6. Coordinate targeting: `click` / `drag` / `wheel` — Low (consistency note)

`click`, `drag`, and `wheel` all accept an optional `eid` that reinterprets `x`/`y`
as element-relative coordinates, plus a shared `modifiers` array. This is
convention reuse, not duplication — but it's worth noting as a shared pattern that
should stay consistent (same semantics for "coords relative to element top-left"
across all three). No change recommended.

---

## Recommendations at a glance

1. **Merge the two network tools** (or de-duplicate their `url_pattern` handling) —
   highest-value, lowest-risk consolidation.
2. **Rationalize the three scroll tools** — at minimum disambiguate `scroll` vs
   `wheel`; ideally merge their vertical-scroll overlap.
3. **Default `find`'s `include_readable` to `false`** so content extraction clearly
   belongs to `read_page`/`snapshot`.
4. **Tighten tool descriptions** for the `get_element`/`get_field` and
   `find`/`get_form` pairs so the agent has an unambiguous "use X when…" rule; these
   pairs are legitimately distinct in altitude and don't need to be removed.

None of the overlaps are outright bugs — the tool set is coherent — but items 1 and 2
are real duplication that increase the agent's tool-selection burden and maintain two
code paths for one capability.
