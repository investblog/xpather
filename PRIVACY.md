# Privacy Policy — Xpather

**Effective date:** 2026-03-13
**Extension:** Xpather (Browser Extension)
**Developer:** [investblog](https://github.com/investblog)

## Summary

Xpather does not collect, store, transmit, or sell any user data. The extension operates entirely on your device with zero network requests.

## Data Collection

Xpather does **not** collect:

- Personal information (name, email, account details)
- Browsing history or page content
- Analytics, telemetry, or usage statistics
- Cookies or tracking identifiers
- XPath expressions you enter or generate

## How It Works

- XPath evaluation runs locally in the browser tab via a content script.
- Generated XPath variants exist only in memory for the duration of the browser session and are discarded when the tab is closed or navigated away.
- Theme preference (dark/light/system) is stored locally using the browser's built-in storage and is never transmitted.

## Network Requests

Xpather makes **zero** network requests. There is no analytics endpoint, no CDN, no remote code loading. The Content Security Policy enforces this at the browser level.

## Permissions

| Permission | Why it's needed |
|------------|-----------------|
| `activeTab` | Access the current tab's DOM when you activate the picker or evaluate an XPath |
| `scripting` | Inject the content script on demand (Chrome/Edge/Opera) |
| `webNavigation` | Detect page navigation to reset picker state |
| `sidePanel` | Open the side panel UI (Chrome/Edge) |

No `<all_urls>` or broad host permissions are requested on Chromium browsers. Firefox MV2 uses content script auto-injection with `http://*/*` and `https://*/*` matches solely for sidebar compatibility.

## Third Parties

Xpather has no third-party dependencies at runtime, no embedded SDKs, and no server-side components.

## Children's Privacy

Xpather does not knowingly collect any information from anyone, including children under the age of 13.

## Changes

If this policy changes, the updated version will be published in the extension's GitHub repository with a new effective date.

## Contact

Questions or concerns: [open an issue](https://github.com/investblog/xpather/issues) on GitHub.
