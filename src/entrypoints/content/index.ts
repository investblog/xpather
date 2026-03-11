import { evaluateXPath } from '@core/evaluator';
import type { ExtensionMessage } from '@shared/messaging/protocol';
import { clearAllHighlights, clearChannel, highlightMatches, refreshPositions } from '@/content/highlighter';
import { isPickerActive, startPicker, stopPicker } from '@/content/picker';

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  runAt: 'document_idle',

  main() {
    // Guard against double-injection via scripting.executeScript.
    const win = window as unknown as { __xpather_loaded?: boolean };
    if (win.__xpather_loaded) return;
    win.__xpather_loaded = true;

    const onMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (raw, _sender, sendResponse) => {
      const message = raw as ExtensionMessage;
      switch (message.type) {
        case 'picker:start':
          startPicker((variants) => {
            void browser.runtime.sendMessage({ type: 'picker:result', variants });
          });
          sendResponse({ ok: true });
          break;

        case 'picker:stop':
          stopPicker();
          clearAllHighlights();
          sendResponse({ ok: true });
          break;

        case 'xpath:evaluate': {
          const result = evaluateXPath(message.xpath);
          highlightMatches(message.xpath, 'matches');
          sendResponse({ type: 'xpath:result', result });
          break;
        }

        case 'highlight:preview':
          clearChannel('preview');
          highlightMatches(message.xpath, 'preview', message.index);
          sendResponse({ ok: true });
          break;

        case 'highlight:clear-preview':
          clearChannel('preview');
          sendResponse({ ok: true });
          break;

        case 'highlight:clear':
          clearChannel('preview');
          clearChannel('matches');
          sendResponse({ ok: true });
          break;

        default:
          break;
      }

      return true as const;
    };

    browser.runtime.onMessage.addListener(onMessage);

    // Refresh highlight positions on scroll/resize.
    let rafId = 0;
    const scheduleRefresh = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(refreshPositions);
    };
    window.addEventListener('scroll', scheduleRefresh, { passive: true });
    window.addEventListener('resize', scheduleRefresh, { passive: true });

    // Cleanup on unload.
    window.addEventListener('beforeunload', () => {
      if (isPickerActive()) stopPicker();
      clearAllHighlights();
    });
  },
});
