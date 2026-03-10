import type { ExtensionMessage, PickerResultMessage } from '@shared/messaging/protocol';
import type { TabState } from '@shared/types';

export default defineBackground(() => {
  const tabStates = new Map<number, TabState>();

  function getTabState(tabId: number): TabState {
    let state = tabStates.get(tabId);
    if (!state) {
      state = { pickerActive: false, lastInput: '', lastVariants: [] };
      tabStates.set(tabId, state);
    }
    return state;
  }

  // Handle messages from popup/sidepanel
  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    const message = raw as ExtensionMessage;
    // Messages from content script
    if (sender.tab?.id != null) {
      handleContentMessage(message, sender.tab.id);
      return true;
    }

    // Messages from popup/sidepanel
    void handlePopupMessage(message, sendResponse);
    return true;
  });

  async function handlePopupMessage(
    message: ExtensionMessage,
    sendResponse: (response: unknown) => void,
  ): Promise<void> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const tabId = tab.id;

    switch (message.type) {
      case 'picker:start': {
        const state = getTabState(tabId);
        state.pickerActive = true;
        await ensureContentScript(tabId);
        await browser.tabs.sendMessage(tabId, message);
        sendResponse({ ok: true });
        break;
      }

      case 'picker:stop': {
        const state = getTabState(tabId);
        state.pickerActive = false;
        await browser.tabs.sendMessage(tabId, message).catch(() => {});
        sendResponse({ ok: true });
        break;
      }

      case 'xpath:evaluate': {
        const state = getTabState(tabId);
        state.lastInput = message.xpath;
        await ensureContentScript(tabId);
        const result = await browser.tabs.sendMessage(tabId, message);
        sendResponse(result);
        break;
      }

      case 'highlight:preview':
      case 'highlight:clear': {
        await browser.tabs.sendMessage(tabId, message).catch(() => {});
        sendResponse({ ok: true });
        break;
      }

      case 'state:get': {
        const state = getTabState(tabId);
        sendResponse({ type: 'state:current', state });
        break;
      }

      default:
        break;
    }
  }

  function handleContentMessage(message: ExtensionMessage, tabId: number): void {
    if (message.type === 'picker:result') {
      const state = getTabState(tabId);
      state.pickerActive = false;
      state.lastVariants = (message as PickerResultMessage).variants;

      // Update badge
      const count = state.lastVariants.length;
      void browser.action.setBadgeText({ text: count > 0 ? String(count) : '', tabId });
      void browser.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
    }
  }

  async function ensureContentScript(tabId: number): Promise<void> {
    try {
      await browser.tabs.sendMessage(tabId, { type: 'highlight:clear' });
    } catch {
      // Content script not injected yet — inject it
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/content.js'],
      });
    }
  }

  // Handle keyboard command
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-picker') return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const state = getTabState(tab.id);
    if (state.pickerActive) {
      state.pickerActive = false;
      await browser.tabs.sendMessage(tab.id, { type: 'picker:stop' }).catch(() => {});
    } else {
      state.pickerActive = true;
      await ensureContentScript(tab.id);
      await browser.tabs.sendMessage(tab.id, { type: 'picker:start' });
    }
  });

  // Cleanup on tab close
  browser.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
  });

  // Cleanup on navigation
  browser.webNavigation?.onCommitted.addListener(({ tabId, frameId }) => {
    if (frameId === 0) {
      tabStates.delete(tabId);
      void browser.action.setBadgeText({ text: '', tabId });
    }
  });
});
