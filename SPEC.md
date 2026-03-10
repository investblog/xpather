# XPath Helper — Specification

Browser extension for finding, generating, and testing XPath expressions. Built on the CookiePeek stack (WXT + TypeScript + Vanilla DOM). Target audience: ZennoPoster template developers, automation engineers, QA engineers.

## Motivation

The original XPath Helper Wizard was removed from Chrome Store (never updated to MV3). XPath Helper 2.0 exists but has broken layout, Chrome-only, not in stores, abandoned. No lightweight, fast, multi-browser tool exists that generates multiple ranked XPath variants for a picked element.

## Architecture: Popup + Side Panel

Follows the same pattern as CookiePeek: popup is the primary UI, pinnable to a side panel for persistent use. Content script handles only DOM interaction (picker, highlighting, XPath evaluation).

### Runtime ownership

- **background** (service worker)
  - owns `browser.commands` handling
  - message router between popup/sidepanel and content script
  - manages content script injection
  - holds per-tab ephemeral state (picked variants, last input, picker status)
  - updates extension badge
  - does NOT evaluate XPath — all DOM logic lives in content script

- **content script**
  - owns all DOM access
  - owns element picker (hover highlight, click capture)
  - owns XPath evaluation via `document.evaluate()`
  - owns XPath variant generation (needs live DOM)
  - owns match highlighting on page
  - stateless between messages — receives commands, returns results
  - no UI rendering (no overlay, no Shadow DOM)

- **popup**
  - main UI: XPath input, variant list, result preview, match count
  - "Pick element" button (activates picker via background → content script)
  - copy to clipboard
  - theme toggle (dark/light/system)
  - pin to side panel button
  - reuses `popup.html?sidepanel=1` for side panel (same as CookiePeek)

### Picker workflow

The popup closes when the user clicks on the page. Two paths:

**Via popup (acceptable UX):**
1. User clicks "Pick" in popup
2. Popup sends `picker:start` to background, then closes
3. Background relays to content script, sets tab state `pickerActive: true`
4. Content script activates picker mode (hover highlights, Alt+click capture)
5. User Alt+clicks an element
6. Content script generates variants, evaluates match counts
7. Content script sends `picker:result` with `XPathVariant[]` to background
8. Background stores variants in per-tab state, updates badge
9. User reopens popup — popup loads stored variants from background

**Via side panel (optimal UX):**
1. User clicks "Pick" in side panel
2. Side panel sends `picker:start` to background
3. Same flow, but side panel stays open
4. Variants appear immediately in the panel — no context loss

The side panel is the recommended workflow for active XPath work. The popup works as a quick-access entry point.

### Data flow

```
Manual XPath input (popup/sidepanel):
  user types xpath
  → popup sends { type: 'xpath:evaluate', xpath } to background
  → background relays to content script
  → content script runs document.evaluate()
  → content script highlights matches on page
  → content script replies { nodes: [...], count, error, truncated }
  → background relays to popup
  → popup shows count badge + first result text

Element pick:
  user clicks "Pick" button
  → popup sends { type: 'picker:start' } to background
  → background relays to content script
  → content script enters picker mode
  → user Alt+clicks element
  → content script calls generateVariants(element)
  → content script evaluates each variant for match count
  → content script sends { type: 'picker:result', variants: XPathVariant[] }
  → background stores in tab state, relays to popup/sidepanel
  → UI renders variant list

Variant hover preview (side panel only):
  user hovers over a variant row
  → sidepanel sends { type: 'highlight:preview', xpath }
  → content script highlights matching elements
  → on mouse leave: content script clears preview highlights
```

## Features

### v1.0 (MVP)

1. **XPath input with live evaluation**
   - Input field for XPath expression
   - Match count badge (green when unique, i.e. count = 1)
   - First match text content preview
   - Live validation — error state with localized message on invalid XPath
   - Debounced evaluation (150ms)

2. **Element picker**
   - Activated via "Pick" button in popup/sidepanel
   - `Alt + hover` — green outline on element under cursor
   - `Alt + click` — capture element, generate variants, deactivate picker
   - Picker listeners attached on activation, removed on deactivation or tab navigation
   - Capture phase event handling: `preventDefault()` + `stopPropagation()` only on the pick click itself
   - Does not block unrelated page interactions outside active pick gestures

3. **Variant generation** — after picking an element, a ranked list of XPath expressions:
   - Each variant shows: XPath string, strategy label, match count badge
   - Variants with count = 1 marked as "unique" (green badge)
   - Click on variant → copies to clipboard with visual flash feedback
   - Hover on variant → highlights matching elements on page (side panel only)
   - Deterministic output order, deduplicated by normalized XPath string
   - Capped at 8 variants total, max 2 per strategy family

4. **Page highlighting**
   - Three separate visual channels:
     - Picker hover target (green outline, follows cursor)
     - Current XPath evaluation matches (yellow outline, persistent while input is active)
     - Variant hover preview (blue outline, temporary)
   - Only one preview set active at a time
   - Highlights cleared on: overlay close, invalid XPath, picker deactivation
   - Highlights capped at evaluator result limit
   - Highlight elements must not steal pointer events (`pointer-events: none`)

5. **Pin to side panel** — same mechanism as CookiePeek
   - Chrome/Edge: `browser.sidePanel.open()`
   - Firefox: `browser.sidebarAction.open()`
   - Opera: declarative `sidebar_action` only
   - Reuses `popup.html?sidepanel=1`

6. **Theme** — dark/light/system, same CSS custom properties as CookiePeek

7. **Copy to clipboard** — click any variant or the main input result

### v1.1

- CSS selector generation in parallel (XPath / CSS toggle)
- Query history (last 50, session-scoped, per tab)
- Export all variants (copy all, JSON)
- XPath input autocomplete hints (`//`, `@`, `text()`, `contains()`)
- Breadcrumb path from picked element to root

### v1.2

- Visual DOM tree with navigation
- Fuzzy search by attributes and text content
- Relative XPath between two picked elements

## XPath Variant Generator

`generateVariants(element: Element): XPathVariant[]`

### Output contract

- Output order is deterministic for the same DOM state
- Variants are deduplicated by normalized XPath string
- Labels are localization keys, not hardcoded strings
- Max 8 variants total, max 2 per strategy family
- `absolute` is always last (fallback only)

### Strategy order

1. **id** — only when `@id` value is unique in the document
   - `//tag[@id="value"]`
   - If element has no id but a close ancestor does: `//*[@id="ancestor-id"]//tag`
   - Skip if id is not unique

2. **data-attr** — QA-oriented data attributes, priority order:
   - `data-testid`, `data-test`, `data-qa`, `data-cy`, `data-automation`
   - `//tag[@data-testid="value"]`

3. **attribute** — stable semantic attributes:
   - Allowed: `name`, `placeholder`, `aria-label`, `title`, `role`, `type`, `alt`
   - `href` — only for short, non-fragment values
   - Forbidden: `style`, event handlers (`onclick`, etc.), framework internals (`_ngcontent-*`, `data-v-*`, `x-ref`)
   - Emit 1-attribute selector if unique; otherwise try 2-attribute combinations in priority order; stop once unique
   - `//input[@type="email"][@name="login"]`

4. **text** — for elements with short visible text:
   - Only for trimmed text length 1..80
   - Normalize whitespace before comparison
   - Escape quotes safely (switch `"` ↔ `'` or use `concat()`)
   - Prefer `normalize-space(.)="..."` over raw `text()="..."`
   - Emit `contains(normalize-space(.), "...")` only if exact match is not unique
   - Skip text strategy for: content with line breaks, password/token-like strings

5. **class** — semantic class tokens only:
   - Token-safe matching: `contains(concat(" ", normalize-space(@class), " "), " token ")`
   - Reject: tokens < 3 chars, tokens with 6+ consecutive hex chars, CSS-in-JS patterns (`css-*`, `jsx-*`, `sc-*`), Tailwind utility classes (`mt-*`, `px-*`, `flex`, `grid`, `block`)

6. **optimized** — shortest unique path, bottom-up algorithm:
   1. Start from target element
   2. Build candidate step: tag + best available discriminator (unique attribute > class token > sibling position)
   3. Test if selector is unique in document
   4. If unique → done
   5. If not → prepend one ancestor step, repeat
   6. Scoring: fewer steps > stable attributes > class tokens > positional indices
   7. Fall back to absolute if uniqueness never reached
   8. Emit one `optimized` variant

7. **absolute** — full path from `html`, always generated as last-resort fallback
   - `/html/body/div[2]/main/form/div[1]/input`

### Types

```typescript
interface XPathVariant {
  xpath: string;
  strategy: Strategy;
  matchCount: number;
  label: string; // i18n key: STRATEGY_ID, STRATEGY_TEXT, etc.
}

type Strategy = 'id' | 'data-attr' | 'attribute' | 'text' | 'class' | 'optimized' | 'absolute';
```

## XPath Evaluator

```typescript
interface XPathEvaluationResult {
  nodes: Node[];
  count: number;
  error: string | null;
  truncated: boolean;
}

function evaluateXPath(
  xpath: string,
  options?: {
    contextNode?: Node;
    documentNode?: Document;
    maxResults?: number; // default: 1000
  },
): XPathEvaluationResult;
```

### Rules

- Default `documentNode` is `document`
- Default `contextNode` is `documentNode`
- Always use `XPathResult.ORDERED_NODE_SNAPSHOT_TYPE`
- `count` is collected node count, capped by `maxResults`
- `truncated` is `true` if actual matches exceed the cap
- On parser/runtime failure: return `error` string (localized key, not raw DOMException), empty `nodes`
- Scalar XPath results (`string()`, `count()`, `boolean()`) are out of scope for v1.0 — return `UNSUPPORTED_RESULT_TYPE` error

## Iframe Behavior (v1.0)

- Content script operates on current document only
- Does not traverse into cross-origin iframes
- Does not promise page-wide matching across nested frames
- If content script runs inside a same-origin frame, evaluation is frame-local
- No explicit iframe warning in v1.0 (adds complexity for rare case)

## Popup UI Layout

```
┌──────────────────────────────────────────────────────────┐
│  XPath Helper                    [pick] [theme] [📌 pin] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  XPath: [//input[@id="email"]________________] [1] ✓    │
│  Result: user@example.com                                │
│                                                          │
│  ── Variants ──────────────────────────────────────────  │
│  ● //input[@id="email"]                       id  [1] ✓ │
│  ○ //input[@type="email"]                    attr [1] ✓ │
│  ○ //input[contains(concat(" ",...), " fo…"  class[3]   │
│  ○ //form//input[2]                          opt  [1] ✓ │
│  ○ /html/body/div/form/input[2]              abs  [1] ✓ │
│                                                          │
│  hint: click to copy · hover to preview (side panel)     │
├──────────────────────────────────────────────────────────┤
│  [⭐ rate] [github]                                      │
└──────────────────────────────────────────────────────────┘
```

Popup width: 500px (fixed). Side panel: `width: 100%; height: 100vh` (same as CookiePeek).

## Per-Tab State (background, in-memory)

```typescript
interface TabState {
  pickerActive: boolean;
  lastInput: string;
  lastVariants: XPathVariant[];
  overlayPosition: 'top' | 'bottom'; // reserved for future
}
```

- Stored in a `Map<number, TabState>` in background service worker
- Cleared on tab close (`browser.tabs.onRemoved`)
- Cleared on tab navigation (`browser.webNavigation.onCommitted`)
- No cross-tab shared state
- No persistent storage in v1.0 (no `browser.storage`)

## Keyboard Shortcuts

| Action | Default | Via |
|--------|---------|-----|
| Toggle picker mode | `Ctrl+Shift+X` | `browser.commands` |
| Copy current XPath | `Ctrl+C` (when input focused) | Standard browser behavior |
| Clear input | `Escape` (when input focused) | Popup keydown listener |

Minimal shortcut surface. `Ctrl+Shift+X` is the only registered command. Picker activation from keyboard: shortcut toggles picker on/off directly (if popup is closed, background activates picker in content script; if popup is open, popup relays).

## Permissions

```json
{
  "permissions": [
    "activeTab",
    "scripting"
  ]
}
```

- `activeTab` — access to the current tab on user gesture (click extension icon)
- `scripting` — programmatic content script injection (`browser.scripting.executeScript`)
- No `<all_urls>` — content script injected on demand, not declaratively
- No `storage` in v1.0 — all state is ephemeral
- Side panel: `sidePanel` permission added per-browser (same gating as CookiePeek)

## Messaging Protocol

Type-safe messages (same pattern as CookiePeek `defineExtensionMessaging`):

```typescript
// popup/sidepanel → background → content script
type RequestMessages = {
  'picker:start': void;
  'picker:stop': void;
  'xpath:evaluate': { xpath: string };
  'highlight:preview': { xpath: string };
  'highlight:clear': void;
  'state:get': void;
};

// content script → background → popup/sidepanel
type ResponseMessages = {
  'picker:result': { variants: XPathVariant[] };
  'xpath:result': XPathEvaluationResult;
  'state:current': TabState;
};
```

## Project Structure

```
src/
  entrypoints/
    background/index.ts          # Service worker: commands, message router, tab state
    content/index.ts             # Content script: picker, evaluator, highlighter
    popup/
      main.ts                    # Popup UI orchestration
      index.html
      components/
        xpath-input.ts           # Input field with live validation
        variant-list.ts          # Variant rows with copy + hover preview
        toolbar.ts               # Pick button, theme toggle, pin button

  core/
    generator.ts                 # XPath variant generation (runs in content script)
    evaluator.ts                 # XPath evaluation wrapper
    optimizer.ts                 # Shortest unique path algorithm
    generator.test.ts
    evaluator.test.ts
    optimizer.test.ts

  content/
    picker.ts                    # Element picker: hover, click capture
    highlighter.ts               # Page highlight management (3 channels)

  shared/
    types.ts                     # XPathVariant, XPathEvaluationResult, TabState, Strategy
    messaging/protocol.ts        # Type-safe message definitions
    theme.ts                     # Dark/light/system (from CookiePeek)
    constants.ts                 # MAX_RESULTS, MAX_VARIANTS, DEBOUNCE_MS
    store-links.ts               # Per-browser store URLs

  assets/css/
    popup.css                    # Popup layout and components
    theme.css                    # Theme tokens (dark/light)

  public/
    icons/                       # 16, 32, 48, 128 png
    _locales/
      en/messages.json
      ru/messages.json
```

## Tech Stack

| Component | Tool | Version |
|-----------|------|---------|
| Framework | WXT | ^0.19.0 |
| Language | TypeScript strict | ^5.7 |
| UI | Vanilla DOM + CSS custom properties | — |
| Linter | Biome | ^2.3 |
| Tests | Vitest | ^4.0 |
| Runtime deps | **0** | — |

## Browser Targets

| Browser | Manifest | Status | Notes |
|---------|----------|--------|-------|
| Chrome | MV3 | Primary | `minimum_chrome_version: 116` |
| Edge | MV3 | Primary | Chromium, identical build |
| Firefox | MV2 | Primary | WXT handles MV2/MV3 differences |
| Opera | MV3 | Secondary | `sidebar_action` for side panel |

## Quality Gates

All of the following must pass before a branch is releasable:

```json
{
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "build:edge": "wxt build -b edge",
    "build:opera": "wxt build -b opera",
    "build:all": "wxt build && wxt build -b firefox && wxt build -b edge && wxt build -b opera",
    "zip:all": "wxt zip && wxt zip -b firefox && wxt zip -b edge && wxt zip -b opera",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src/ wxt.config.ts vitest.config.ts",
    "lint:fix": "biome check --write src/ wxt.config.ts vitest.config.ts",
    "test": "vitest run",
    "check": "tsc --noEmit && biome check src/ wxt.config.ts vitest.config.ts && vitest run"
  }
}
```

Rules:
- No `any` in application code (exception: browser API edge adapters that cannot be typed cleanly)
- No unused exports
- No DOM query without null handling unless guarded
- `npm run check` is the mandatory gate

## Localization

- EN + RU, all user-visible strings via `browser.i18n.getMessage()`
- Keys use SCREAMING_SNAKE: `EXTENSION_NAME`, `PICK_ELEMENT`, `STRATEGY_ID`, `STRATEGY_TEXT`, `STRATEGY_ATTRIBUTE`, `STRATEGY_CLASS`, `STRATEGY_OPTIMIZED`, `STRATEGY_ABSOLUTE`, `COPY_SUCCESS`, `INVALID_XPATH`, `UNSUPPORTED_RESULT_TYPE`, `TOO_MANY_MATCHES`, `MATCHES_COUNT`, `UNIQUE_MATCH`
- Strategy labels are i18n keys, not hardcoded strings
- Error messages from DOMException are not shown raw — mapped to stable localized keys

## Accessibility

- All interactive controls reachable by keyboard (Tab navigation within popup)
- Visible focus ring on all controls
- `Escape` behavior in popup:
  - If input focused and non-empty: clear input
  - If input focused and empty: blur input

## Privacy

- Zero telemetry, zero network requests
- No data persisted, no data transmitted
- CSP: `script-src 'self'; object-src 'self'`
- All data ephemeral (same policy as CookiePeek)

## Testing

### Unit tests (Vitest)

**generator.test.ts:**
- Element with unique id → first variant contains `@id`
- Element with `data-testid` → data-attr strategy takes priority
- Element with no attributes → fallback to absolute path
- Text element → variant with `normalize-space(.)` or `text()`
- Element with hashed classes → utility classes filtered out
- Deduplication: identical XPath from different heuristics → single variant
- Class strategy uses token-safe matching, not substring
- Text strategy escapes mixed quotes correctly

**evaluator.test.ts:**
- Valid path → nodes array + correct count
- Invalid path → error string, empty nodes
- No matches → count: 0, empty nodes
- Results exceeding cap → `truncated: true`, count capped at `maxResults`
- Scalar XPath expression → `UNSUPPORTED_RESULT_TYPE` error

**optimizer.test.ts:**
- Element with unique id → 1-step path via id
- Deeply nested element → minimal sufficient depth
- Prefers stable attributes over sibling index when both are unique

### Browser-level checks (Claude in Chrome)

```
"Load extension from dist/chrome-mv3, go to github.com, click extension icon,
 click Pick, Alt+click on Sign In, verify 4+ variants appear in popup"

"Open side panel, type //input[@name='q'] on google.com,
 verify search box highlights and count shows 1"

"Toggle picker on and off 5 times — verify no duplicate content script artifacts"

"Open side panel, pick element, hover variant rows — verify highlight follows hover"

"Build Firefox, verify same shortcut and popup behavior"
```

## Acceptance Criteria (v1.0)

1. `Ctrl+Shift+X` activates picker mode on the active tab
2. Clicking extension icon opens popup with XPath input field
3. Typing a valid node-returning XPath updates count, first-result preview, and page highlights in under 150ms on a normal page
4. Typing an invalid XPath shows a localized error and clears stale highlights
5. "Pick" button activates element picker; Alt+click generates deterministic, deduplicated variant list
6. Every variant displays a match count from the same evaluator
7. Clicking a variant copies the exact XPath string to clipboard
8. Closing popup removes picker listeners and clears transient highlights
9. Pin to side panel works on Chrome, Edge, and Firefox
10. `npm run check` passes (typecheck + lint + test)
11. Chrome and Firefox production builds succeed from the same codebase

## Comparison with ZennoClub Discussion

| Aspect | ZennoClub version | This project |
|--------|-------------------|-------------|
| Base | Fork of XPath Helper 2.0 | From scratch |
| Framework | None (raw MV3) | WXT |
| Language | JavaScript | TypeScript strict |
| Browsers | Chrome only | Chrome, Firefox, Edge, Opera |
| Distribution | Not in store | Chrome Store + Firefox Add-ons + Edge Add-ons |
| Tests | None | Vitest |
| Architecture | Content script overlay | Popup + Side Panel |
| XPath variants | Basic (few) | 7 strategies, ranked, deduplicated, capped |
| Theme | Light only | Dark / Light / System |
| Privacy | Unknown | Zero telemetry, zero network |
