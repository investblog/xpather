<p align="center">
  <img src="src/public/icons/logo.svg" width="80" height="80" alt="Xpather logo">
</p>

# Xpather

Find, generate and test XPath expressions. Browser extension with smart variants, element picker, and zero telemetry.

[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)

## Features

- **Element picker** — hold Alt + hover to highlight, Alt + click to capture. Works without blocking page interactions
- **7 generation strategies** — by ID, data-* attributes, aria/name/role, text content, class, shortest unique path, absolute path
- **Smart ranking** — best variant marked automatically, duplicates removed, max 8 variants capped at 2 per strategy
- **Live evaluation** — type any XPath, see match count and highlighted results in real time
- **Side panel mode** — pin to side panel for continuous workflow without popup closing
- **Result preview** — first match summary with node description, expandable result tree
- **Dark & light theme** — follows system preference or toggle manually
- **Fully local** — no accounts, no analytics, no network requests, no data leaves your browser

## How it works

Click the toolbar icon or use the keyboard shortcut — Xpather opens as a popup or side panel. Type an XPath expression to evaluate it against the current page, or use the element picker to generate variants automatically.

The picker activates with Alt + hover to highlight elements and Alt + click to select. Generated XPath variants are ranked by specificity — unique matches are marked as best. Click any variant to copy and evaluate.

Everything runs locally. No data is stored, transmitted, or logged.

## Development

```bash
git clone https://github.com/investblog/xpather.git
cd xpather
npm install

npm run dev            # Chrome MV3 dev server with HMR
npm run dev:firefox    # Firefox MV2 dev server
npm run build          # Chrome production build
npm run build:firefox  # Firefox production build
npm run zip:all        # Build all platforms
npm run check          # Typecheck + lint + test
```

## Tech stack

- [WXT](https://wxt.dev) — web extension framework with HMR
- TypeScript strict mode
- Vanilla DOM + CSS custom properties (no framework)
- Chrome MV3 + Firefox MV2 + Edge MV3 builds
- Zero runtime dependencies

## Privacy

Xpather makes zero network requests. No analytics, no telemetry, no remote code. XPath evaluation happens in the page context via content script and results are never persisted. The only local data is your theme preference.

Full privacy policy: [PRIVACY.md](PRIVACY.md)

## License

[Apache 2.0](LICENSE)

---

Built by [investblog](https://github.com/investblog) at [301.st](https://301.st) with [Claude](https://claude.ai)
