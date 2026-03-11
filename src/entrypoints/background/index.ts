import type { ExtensionMessage, PickerResultMessage } from '@shared/messaging/protocol';
import type { TabState } from '@shared/types';

export default defineBackground(() => {
  const tabStates = new Map<number, TabState>();
  const injectedTabs = new Set<number>();

  function getTabState(tabId: number): TabState {
    let state = tabStates.get(tabId);
    if (!state) {
      state = { pickerActive: false, lastInput: '', lastVariants: [] };
      tabStates.set(tabId, state);
    }
    return state;
  }

  function isScriptableUrl(url: string | undefined): boolean {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://');
  }

  async function ensureContentScript(tabId: number): Promise<boolean> {
    if (injectedTabs.has(tabId)) return true;
    try {
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/content.js'] as unknown as string[],
      });
      injectedTabs.add(tabId);
      return true;
    } catch {
      return false;
    }
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
    if (!tab?.id || !isScriptableUrl(tab.url)) {
      sendResponse({ ok: false, error: 'TAB_NOT_SCRIPTABLE' });
      return;
    }

    const tabId = tab.id;

    switch (message.type) {
      case 'picker:start': {
        const state = getTabState(tabId);
        state.pickerActive = true;
        await sendToTab(tabId, message);
        sendResponse({ ok: true });
        break;
      }

      case 'picker:stop': {
        const state = getTabState(tabId);
        state.pickerActive = false;
        await sendToTab(tabId, message);
        sendResponse({ ok: true });
        break;
      }

      case 'xpath:evaluate': {
        const state = getTabState(tabId);
        state.lastInput = message.xpath;
        const result = (await sendToTab(tabId, message)) as { result?: { count: number } } | null;
        sendResponse(result);

        // Update toolbar badge with match count
        const evalCount = result?.result?.count ?? 0;
        void browser.action.setBadgeText({ text: evalCount > 0 ? String(evalCount) : '', tabId });
        void browser.action.setBadgeBackgroundColor({
          color: evalCount === 1 ? '#22c55e' : '#eab308',
          tabId,
        });
        break;
      }

      case 'highlight:preview': {
        await sendToTab(tabId, message);
        sendResponse({ ok: true });
        break;
      }

      case 'highlight:clear': {
        await sendToTab(tabId, message);
        void browser.action.setBadgeText({ text: '', tabId });
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

      const count = state.lastVariants.length;
      void browser.action.setBadgeText({ text: count > 0 ? String(count) : '', tabId });
      void browser.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });

      // Relay to popup/side panel
      void browser.runtime.sendMessage(message).catch(() => {});
    }
  }

  async function sendToTab(tabId: number, message: ExtensionMessage): Promise<unknown> {
    if (!(await ensureContentScript(tabId))) return null;
    try {
      return await browser.tabs.sendMessage(tabId, message);
    } catch {
      return null;
    }
  }

  // Handle keyboard command
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-picker') return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isScriptableUrl(tab.url)) return;

    const state = getTabState(tab.id);
    if (state.pickerActive) {
      state.pickerActive = false;
      await sendToTab(tab.id, { type: 'picker:stop' });
    } else {
      state.pickerActive = true;
      await sendToTab(tab.id, { type: 'picker:start' });
    }
  });

  // Cleanup on tab close
  browser.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
    injectedTabs.delete(tabId);
  });

  // Cleanup on navigation
  browser.webNavigation?.onCommitted.addListener(({ tabId, frameId }) => {
    if (frameId === 0) {
      tabStates.delete(tabId);
      injectedTabs.delete(tabId);
      void browser.action.setBadgeText({ text: '', tabId });
    }
  });
});
