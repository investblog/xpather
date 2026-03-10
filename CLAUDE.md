# XPath Helper — Browser Extension

Find, generate, and test XPath expressions. Popup + Side Panel architecture. Built with WXT + TypeScript + Vanilla DOM. Sibling project to [CookiePeek](https://github.com/investblog/cookiepeek) — reuses its patterns for architecture, theme system, messaging, and build pipeline.

## Commands

```
npm run dev              # Chrome MV3 dev server with HMR
npm run dev:firefox      # Firefox MV2 dev server
npm run build            # Production build (Chrome)
npm run build:firefox    # Production build (Firefox)
npm run zip:all          # .zip packages for store submission
npm run typecheck        # TypeScript strict check
npm run lint             # Biome lint + format
npm run test             # Vitest unit tests
npm run check            # All checks (typecheck + lint + test)
```

## Architecture

Popup + Side Panel model (same as CookiePeek):

- **Popup** — main UI: XPath input, variant list, pick button, theme, pin to side panel
- **Side Panel** — same `popup.html?sidepanel=1`, stays open during page interaction (optimal for picker workflow)
- **Content Script** — element picker, XPath evaluation via `document.evaluate()`, page highlighting. No UI rendering
- **Background** — message router, per-tab state, `browser.commands`, content script injection

```
src/
  entrypoints/
    background/index.ts          # Service worker: commands, message router, tab state
    content/index.ts             # Content script: picker, evaluator, highlighter
    popup/                       # Popup UI: input, variants, toolbar
  core/
    generator.ts                 # XPath variant generation (7 strategies)
    evaluator.ts                 # XPath evaluation wrapper
    optimizer.ts                 # Shortest unique path algorithm
  content/
    picker.ts                    # Element picker: hover, Alt+click capture
    highlighter.ts               # Page highlight management (3 channels)
  shared/
    types.ts                     # XPathVariant, XPathEvaluationResult, TabState
    messaging/protocol.ts        # Type-safe message definitions
    theme.ts                     # Dark/light/system theme
    constants.ts                 # MAX_RESULTS, MAX_VARIANTS, DEBOUNCE_MS
```

## Critical Rules

- **XPath evaluation in content script only** — never in background. DOM-dependent logic needs page context
- **All data is ephemeral** — per-tab state in background memory, cleared on tab close/navigation. No `browser.storage` in v1.0
- **Zero network requests** — no analytics, no CDN, no remote code. CSP blocks all external
- **Content script injected on demand** — via `browser.scripting.executeScript`, not declaratively. Requires `activeTab` + `scripting` permissions
- **Use `browser.*` API** (not `chrome.*`) — WXT polyfills for cross-browser
- **Popup speed** — no dynamic imports, no lazy loading. Measure with `performance.now()`
- **Variant generation is deterministic** — same DOM = same output. Deduplicated, capped at 8, max 2 per strategy

## XPath Generator Strategies (priority order)

1. `id` — unique `@id` in document
2. `data-attr` — `data-testid`, `data-test`, `data-qa`, `data-cy`, `data-automation`
3. `attribute` — `name`, `placeholder`, `aria-label`, `title`, `role`, `type`, `alt`
4. `text` — `normalize-space(.)` for visible text 1..80 chars
5. `class` — token-safe: `contains(concat(" ", normalize-space(@class), " "), " token ")`
6. `optimized` — shortest unique path, bottom-up algorithm
7. `absolute` — full path from `/html`, always last fallback

## Picker Workflow

Via popup: Pick → popup closes → picker active → Alt+click → variants stored in background → reopen popup
Via side panel: Pick → panel stays open → variants appear immediately (recommended)

## Three Highlight Channels

| Channel | Color | Purpose |
|---------|-------|---------|
| picker | green | Element under cursor during Alt+hover |
| matches | yellow | Current XPath evaluation results |
| preview | blue | Variant hover preview (side panel only) |

## Testing

Mock DOM in Vitest (jsdom). Test files colocated with source: `*.test.ts` in `src/core/`.

## Localization

EN + RU. `_locales/{en,ru}/messages.json`. All strings via `browser.i18n.getMessage()`. Keys: SCREAMING_SNAKE.

## Browser Targets

| Browser | Manifest | Notes |
|---------|----------|-------|
| Chrome | MV3 | Primary, min version 116 |
| Edge | MV3 | Chromium, identical build |
| Firefox | MV2 | WXT handles differences |
| Opera | MV3 | sidebar_action for side panel |
