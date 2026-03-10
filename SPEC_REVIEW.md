# XPath Helper Specification Review

## Purpose

This document reviews [`SPEC.md`](./SPEC.md) from an implementation perspective and converts product intent into stricter engineering requirements. The goal is to reduce ambiguity so the extension can be implemented once, pass lint/test gates, and behave consistently across Chrome MV3, Firefox, Edge, and Opera.

This is not a replacement for the product spec. It is a technical clarification layer.

## Overall Assessment

The product direction is sound:

- `content-script-first` architecture is the correct choice for an overlay-style XPath tool.
- The feature set matches the actual user workflow better than a popup-only model.
- Reusing the `CookiePeek` stack is reasonable and lowers delivery risk.

The main issue in `SPEC.md` is not product scope. It is implementation ambiguity. Several sections describe user intent well, but leave enough room for incompatible interpretations:

- overlay lifecycle and single-instance rules are underspecified;
- XPath evaluation semantics are not strict enough;
- generated variant ordering and deduplication rules are not fully defined;
- hotkey ownership between `commands`, content script, and page focus is ambiguous;
- persistence rules are inconsistent (`sessionStorage` is mentioned, but ownership is not defined);
- linting, typechecking, and test gates are not defined as release blockers.

Without tightening these points, two competent implementations could still diverge materially.

## Required Clarifications

### 1. Define the runtime ownership model explicitly

Recommended ownership:

- `background`
  - owns browser command handling;
  - injects or contacts the content script for the active tab;
  - does not evaluate XPath;
  - does not own overlay UI state.
- `content script`
  - owns all DOM access;
  - owns overlay lifecycle;
  - owns picker state;
  - owns XPath evaluation and highlighting;
  - owns per-tab ephemeral state.
- `popup`
  - optional and settings-only in v1.0;
  - must not duplicate overlay functionality.

Implementation rule:

- XPath evaluation must always happen in the page context available to the content script, never in `background`.

Reason:

- DOM-dependent logic in `background` creates unnecessary serialization, race conditions, and cross-browser inconsistency.

### 2. Define a strict single-overlay invariant

Current spec says the overlay is toggled, but it does not define singleton behavior.

Required invariant:

- At most one overlay instance may exist per document.
- Repeated toggle requests must reuse the existing instance.
- Repeated content script injection must be idempotent.

Required behavior:

- if overlay is closed: create and mount;
- if overlay is open: hide and cleanup transient highlights;
- if overlay host exists but internal state is stale: rebuild in place.

Implementation note:

- use a deterministic DOM marker, for example `data-xpath-helper-root="1"` on the host element;
- keep a module-level controller singleton in the content script.

### 3. Specify iframe behavior now

The current spec does not define whether iframes are supported.

This must be explicit in v1.0:

- support only the current document in v1.0;
- do not traverse into cross-origin iframes;
- do not promise global page-wide matching across nested frames;
- if the picked node is inside a same-origin frame where the content script is running, evaluate relative to that frame document only;
- show a visible warning when the user is interacting with a frame context and results are frame-local.

Reason:

- iframe semantics are one of the easiest places for XPath tools to become misleading.

### 4. Tighten XPath evaluation semantics

`evaluateXPath(xpath: string, context?: Node)` is too loose as currently phrased.

Recommended contract:

```ts
export interface XPathEvaluationResult {
  nodes: Node[];
  count: number;
  error: string | null;
  truncated: boolean;
}

export function evaluateXPath(
  xpath: string,
  options?: {
    contextNode?: Node;
    documentNode?: Document;
    maxResults?: number;
  },
): XPathEvaluationResult;
```

Required rules:

- default `documentNode` is `document`;
- default `contextNode` is `documentNode`;
- always use `XPathResult.ORDERED_NODE_SNAPSHOT_TYPE`;
- `count` is the number of collected nodes, capped by `maxResults`;
- `truncated` is `true` if actual matches exceed the cap;
- on parser/runtime failure, return `error` and an empty `nodes` array;
- scalar XPath results (`string`, `number`, `boolean`) are out of scope for v1.0 and must be treated as unsupported input with a clear error.

Reason:

- the UI is node-match oriented, not generic XPath-result oriented.

### 5. Define variant generation as deterministic and deduplicated

The spec lists strategies, but not the exact output rules.

Required output guarantees:

- output order must be deterministic for the same DOM;
- variants must be deduplicated by normalized XPath string;
- labels must be stable and localizable;
- max number of returned variants must be capped.

Recommended v1.0 cap:

- return up to 8 variants total;
- return at most 2 variants per strategy family where applicable.

Recommended final order:

1. `id`
2. `data-attr`
3. `attribute`
4. `text`
5. `class`
6. `optimized`
7. `absolute`

Important correction:

- `optimized` should be placed before `absolute` in the implementation output and UI, because it is a candidate recommended path;
- `absolute` should remain last as fallback only.

### 6. Formalize attribute heuristics

The spec lists useful attributes, but implementers still need exact filters.

Recommended rules:

- `id`
  - only use exact `@id="..."` when unique in the current document;
  - if not unique, do not emit the direct `id` strategy.
- `data-*`
  - priority list:
    - `data-testid`
    - `data-test`
    - `data-qa`
    - `data-cy`
    - `data-automation`
- generic attributes
  - allowed:
    - `name`
    - `placeholder`
    - `aria-label`
    - `title`
    - `role`
    - `type`
    - `alt`
    - `href` only for short non-fragment values
- forbidden as primary selectors:
  - `style`
  - event handler attrs
  - framework internals such as `_ngcontent-*`, `data-v-*`, `x-ref`

Recommended combination rule:

- emit 1-attribute selector if unique;
- otherwise try 2-attribute combinations in priority order;
- stop once uniqueness is achieved.

### 7. Define text strategy safely

Text-based XPath is useful but fragile.

Required constraints:

- only emit text strategy for visible trimmed text length `1..80`;
- normalize whitespace before comparison;
- escape quotes safely;
- prefer `normalize-space(.)="..."` over raw `text()="..."` when the element may contain nested text nodes;
- emit `contains(normalize-space(.), "...")` only if exact normalized text is not unique.

Required exclusion:

- do not generate text strategy for text containing line breaks longer than one normalized space group;
- do not generate text strategy for password-like or token-like strings.

### 8. Define class strategy more rigorously

Current class filtering is directionally correct but too vague.

Recommended class rejection heuristics:

- reject class tokens shorter than 3 chars;
- reject tokens containing 6+ consecutive hex-like chars;
- reject tokens matching hashed/CSS-in-JS patterns such as:
  - `css-*`
  - `jsx-*`
  - `sc-*`
  - `Mui*` only if obviously generated and non-semantic;
- reject utility-only tokens when they are likely positional or styling noise:
  - `mt-*`, `mb-*`, `px-*`, `py-*`, `flex`, `grid`, `block`

Required implementation detail:

- use token-safe class matching:

```xpath
contains(concat(" ", normalize-space(@class), " "), " token ")
```

not raw `contains(@class, "token")`.

### 9. Define the optimized strategy algorithm precisely

This is the most likely source of implementation drift.

Required algorithm shape for v1.0:

1. start from target element;
2. build candidate step descriptors for the current element:
   - tag;
   - unique preferred attribute;
   - filtered class token;
   - sibling position;
3. test shortest selectors first;
4. if selector is unique, stop;
5. otherwise prepend one ancestor step and repeat;
6. fall back to absolute path if uniqueness is never reached.

Required scoring preference:

- fewer steps is better;
- stable attributes beat class tokens;
- class tokens beat positional indices;
- any selector without indices beats one with indices when both are unique.

Recommended output:

- emit only one `optimized` selector in v1.0.

### 10. Define picking event precedence and page-safety

The picker interaction is currently understandable but not strict enough.

Required behavior:

- picker mode is passive until modifier key is held;
- `Alt+hover` must not permanently alter page state;
- `Alt+click` must prevent page navigation and page click handlers;
- `Ctrl+click` quick pick is active only when overlay is open;
- all picker listeners must be removed on overlay close.

Required event policy:

- use capture phase for click interception;
- call `preventDefault()` and `stopPropagation()` only for the pick action itself;
- do not block unrelated page interactions outside active pick gestures.

Cross-platform note:

- on macOS, `Ctrl+click` is often interpreted as context click. If macOS support matters later, introduce a platform-specific modifier policy. For now, this should be documented as a known limitation if not addressed.

### 11. Replace "push page content" with a strict compatibility fallback

The current "push-model" requirement is risky on arbitrary pages.

Issue:

- forcibly shifting page layout is intrusive and can break fixed headers, viewport calculations, sticky elements, and app shells.

Recommended v1.0 behavior:

- default to fixed overlay without page reflow;
- optionally reserve space only if an explicit non-breaking host adjustment succeeds;
- if layout adjustment is kept as a product requirement, define an allowlist-style heuristic and a failure fallback.

Recommendation:

- change the v1.0 requirement from "must push page content" to "should avoid obscuring the page where feasible, but must never break page layout".

This is one of the few places where the current spec should be changed, not just clarified.

### 12. Define highlighting lifecycle

Required rules:

- maintain separate visual channels for:
  - picker hover target;
  - current XPath evaluation matches;
  - hovered variant preview;
- only one preview set may be active at a time;
- clear match highlights on invalid XPath or overlay close;
- cap rendered highlights to the same result cap as evaluator;
- highlight overlays must not steal pointer events.

Recommended z-index policy:

- overlay UI root above highlights;
- highlights above page content;
- all helper layers below native browser UI.

### 13. Define state model and persistence precisely

The spec mentions `sessionStorage`, but that is not enough.

Recommended v1.0 state split:

- in-memory content-script state
  - overlay open/closed;
  - current input;
  - current result set;
  - picker active/inactive;
  - currently selected element;
- `sessionStorage`
  - overlay position (`top` or `bottom`);
  - last valid XPath input for the tab;
  - theme override if user changed it within the tab session.

Do not store in v1.0:

- history longer than the current tab session;
- picked DOM snapshots;
- cross-tab shared state.

### 14. Define popup scope more narrowly

The popup is easy to overbuild.

Recommended v1.0 popup scope:

- show current shortcuts;
- open basic documentation/help;
- expose future settings placeholder only if already wired;
- no XPath evaluation UI in popup.

This keeps the product coherent.

### 15. Add explicit localization rules

The spec mentions i18n keys, but implementation should also define:

- all user-visible strings must come from `browser.i18n.getMessage`;
- strategy labels are localization keys, not hardcoded English strings;
- error text from caught `DOMException` should not be shown raw if it is browser-specific;
- normalize runtime failures into stable user-facing messages such as:
  - `INVALID_XPATH`
  - `UNSUPPORTED_RESULT_TYPE`
  - `TOO_MANY_MATCHES`

### 16. Add accessibility and keyboard rules

This is not optional for an overlay tool.

Required:

- overlay root must use semantic roles where appropriate;
- all interactive controls must be reachable by keyboard;
- visible focus ring must exist for overlay controls;
- `Escape` behavior must be deterministic:
  - first press clears picker mode;
  - second press clears input if focused and non-empty;
  - third press closes overlay, or simpler: define one strict sequence and keep it consistent.

Recommendation:

- keep `Escape` simple:
  - if picker active: deactivate picker;
  - else if input focused and non-empty: clear input;
  - else: close overlay.

## Linting, Formatting, and Quality Gates

The spec currently names tools but does not define them as blocking quality gates. That should be fixed.

Required tooling:

- `TypeScript` in strict mode;
- `Biome` for linting and formatting;
- `Vitest` for unit tests;
- `WXT` for extension build targets.

Required scripts:

```json
{
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "build:edge": "wxt build -b edge",
    "build:opera": "wxt build -b opera",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/ wxt.config.ts vitest.config.ts",
    "lint:fix": "biome check --write src/ wxt.config.ts vitest.config.ts",
    "test": "vitest run",
    "check": "tsc --noEmit && biome check src/ wxt.config.ts vitest.config.ts && vitest run"
  }
}
```

Linting requirements:

- no `any` in app code except browser API edge adapters that cannot be typed cleanly;
- no unused exports unless intentional and documented;
- no default exports except WXT entrypoints where framework convention makes that reasonable;
- no DOM query without null handling unless guarded;
- no mutable shared module state without lifecycle ownership comments.

Recommended release gate:

- a branch is not releasable unless `npm run check` passes for the current target codebase.

## Test Plan Corrections

The current test plan is directionally correct but missing a few important cases.

Add these unit tests:

- generator deduplicates identical XPath strings from different heuristics;
- class strategy uses token-safe matching and not substring matching;
- text strategy escapes mixed quotes correctly;
- optimized selector prefers stable attributes over sibling index when both are unique;
- evaluator returns `truncated: true` when results exceed cap;
- evaluator rejects scalar XPath expressions cleanly;
- picker cleanup removes listeners on overlay teardown.

Add these browser-level checks:

- overlay can be opened and closed repeatedly without duplicate roots;
- invalid XPath clears previous result highlights;
- variant hover previews do not persist after mouse leave;
- same-origin iframe behavior is consistent with documented scope;
- Firefox build respects the same shortcut and overlay behavior.

## Recommended v1.0 Scope Cut

To maximize "codes correctly on the first try", v1.0 should be slightly narrower than the current wording.

Keep in v1.0:

- overlay;
- manual XPath input;
- evaluator + highlighting;
- picker;
- deterministic variant generation;
- copy to clipboard;
- top/bottom overlay position;
- theme support;
- i18n.

Move to v1.1:

- autocomplete in the XPath input;
- breadcrumb path rendering if it slows the first implementation;
- side panel pinning;
- query history;
- advanced export formats.

This is not because these features are bad. It is because they create more surface area than value for first release correctness.

## Proposed Technical Acceptance Criteria

The implementation should be considered correct only if all of the following are true:

1. `Ctrl+Shift+X` toggles exactly one overlay instance in the active document.
2. Typing a valid node-returning XPath updates count, first-result preview, and page highlights in under 100 ms on a normal page.
3. Typing an invalid XPath shows a stable localized error and clears stale highlights.
4. `Alt+click` on an element generates a deterministic, deduplicated variant list.
5. Every rendered variant displays a match count calculated by the same evaluator implementation.
6. Clicking a variant copies the exact rendered XPath to the clipboard.
7. Closing the overlay removes picker listeners and transient highlight artifacts.
8. `npm run typecheck`, `npm run lint`, and `npm run test` all pass.
9. Chrome and Firefox production builds succeed from the same codebase.

## Suggested Additions Back Into SPEC.md

If `SPEC.md` is updated later, these exact decisions should be folded into it:

- v1.0 is document-local, not full-frame recursive;
- overlay is singleton and idempotent;
- evaluator supports node results only;
- variants are deterministic, deduplicated, and capped;
- `absolute` is last-resort fallback only;
- page reflow is best-effort, not mandatory;
- `Biome`, `tsc`, and `Vitest` are mandatory quality gates.

## Conclusion

The spec is good enough to start implementation, but not yet strict enough to guarantee a single clean engineering interpretation. The biggest technical risks are:

- overlay/page interaction policy;
- optimized selector algorithm drift;
- frame semantics;
- insufficiently strict evaluator contract;
- quality gates not being treated as blocking.

If these clarifications are adopted, the project is implementation-ready.
