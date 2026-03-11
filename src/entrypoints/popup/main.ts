import { COPY_FLASH_MS, DEBOUNCE_MS } from '@shared/constants';
import type { ExtensionMessage, StateCurrentMessage, XPathResultMessage } from '@shared/messaging/protocol';
import { cycleTheme, initTheme } from '@shared/theme';
import type { SerializedNode, XPathVariant } from '@shared/types';

let currentTheme = initTheme();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentXPath = '';
let selectedTreeIndex = -1;
let pickerActive = false;
const isSidePanel = new URLSearchParams(window.location.search).has('sidepanel');

// --- DOM references ---
const xpathInput = document.getElementById('xpath-input') as HTMLInputElement;
const matchCount = document.getElementById('match-count')!;
const resultTree = document.getElementById('result-tree')!;
const errorMessage = document.getElementById('error-message')!;
const variantsSection = document.getElementById('variants-section')!;
const variantList = document.getElementById('variant-list')!;
const btnPick = document.getElementById('btn-pick')!;
const btnTheme = document.getElementById('btn-theme')!;
const btnPin = document.getElementById('btn-pin')!;

// --- Side panel layout ---
if (isSidePanel) {
  document.body.classList.add('sidepanel');
  btnPin.hidden = true;
}

// --- Init: load state from background ---
async function loadState(): Promise<void> {
  const response = (await browser.runtime.sendMessage({ type: 'state:get' })) as StateCurrentMessage;
  if (!response?.state) return;

  const { lastInput, lastVariants, pickerActive: isActive } = response.state;
  if (lastInput) {
    xpathInput.value = lastInput;
  }
  if (lastVariants.length > 0) {
    renderVariants(lastVariants);
  }
  setPickerState(isActive);
}

void loadState();

// --- XPath input ---
xpathInput.addEventListener('input', () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void evaluateInput(), DEBOUNCE_MS);
});

xpathInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (xpathInput.value) {
      xpathInput.value = '';
      clearResults();
      void sendMessage({ type: 'highlight:clear' });
    } else {
      xpathInput.blur();
    }
  }
});

async function evaluateInput(): Promise<void> {
  const xpath = xpathInput.value.trim();
  currentXPath = xpath;

  if (!xpath) {
    clearResults();
    await sendMessage({ type: 'highlight:clear' });
    return;
  }

  const response = (await sendMessage({ type: 'xpath:evaluate', xpath })) as XPathResultMessage | null;
  if (!response?.result) return;

  const { result } = response;

  if (result.error) {
    showError(browser.i18n.getMessage(result.error as keyof typeof import('@shared/types')) || result.error);
    matchCount.textContent = '0';
    matchCount.classList.remove('badge--unique');
    return;
  }

  hideError();
  const countText = result.truncated ? `${result.count}+` : String(result.count);
  matchCount.textContent = countText;
  matchCount.classList.toggle('badge--unique', result.count === 1);

  renderResultTree(result.nodes);
}

// --- Variants ---
function renderVariants(variants: XPathVariant[]): void {
  variantList.innerHTML = '';

  if (variants.length === 0) {
    variantsSection.hidden = true;
    return;
  }

  variantsSection.hidden = false;
  const bestIndex = variants.findIndex((v) => v.matchCount === 1);

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const li = document.createElement('li');
    li.className = 'variant-list__item';

    // "Best" badge for first unique match
    if (i === bestIndex) {
      const best = document.createElement('span');
      best.className = 'variant-list__best';
      best.textContent = browser.i18n.getMessage('BEST_VARIANT') || 'best';
      li.appendChild(best);
    }

    const strategySpan = document.createElement('span');
    strategySpan.className = 'variant-list__strategy';
    strategySpan.textContent =
      browser.i18n.getMessage(variant.label as keyof typeof import('@shared/types')) || variant.strategy;

    const xpathSpan = document.createElement('span');
    xpathSpan.className = 'variant-list__xpath';
    xpathSpan.textContent = variant.xpath;
    xpathSpan.title = variant.xpath;

    const badge = document.createElement('span');
    badge.className = 'variant-list__badge';
    badge.textContent = String(variant.matchCount);
    if (variant.matchCount === 1) badge.classList.add('badge--unique');

    li.appendChild(strategySpan);
    li.appendChild(xpathSpan);
    li.appendChild(badge);

    // Click: copy + highlight on page
    li.addEventListener('click', () => {
      void copyToClipboard(variant.xpath, li);
      void sendMessage({ type: 'highlight:preview', xpath: variant.xpath });

      // Also put it in the input field
      xpathInput.value = variant.xpath;
      currentXPath = variant.xpath;
    });

    // Hover to preview (side panel only)
    if (isSidePanel) {
      li.addEventListener('mouseenter', () => {
        void sendMessage({ type: 'highlight:preview', xpath: variant.xpath });
      });
      li.addEventListener('mouseleave', () => {
        void sendMessage({ type: 'highlight:clear' });
      });
    }

    variantList.appendChild(li);
  }
}

// --- Pick button (toggle) ---
btnPick.addEventListener('click', () => {
  if (pickerActive) {
    void sendMessage({ type: 'picker:stop' });
    setPickerState(false);
  } else {
    void sendMessage({ type: 'picker:start' });
    setPickerState(true);

    if (!isSidePanel) {
      // Popup will close when user clicks page — that's expected
      window.close();
    }
  }
});

function setPickerState(active: boolean): void {
  pickerActive = active;
  btnPick.classList.toggle('btn--active', active);
  btnPick.title = active
    ? browser.i18n.getMessage('PICK_ELEMENT_STOP') || 'Stop picker'
    : browser.i18n.getMessage('PICK_ELEMENT') || 'Pick element';
}

// Listen for picker results and state changes
browser.runtime.onMessage.addListener((raw: unknown) => {
  const message = raw as ExtensionMessage;
  if (message.type === 'picker:result') {
    setPickerState(false);
    renderVariants(message.variants);
  }
});

// --- Theme ---
btnTheme.addEventListener('click', () => {
  currentTheme = cycleTheme(currentTheme);
});

// --- Pin to side panel ---
btnPin.addEventListener('click', async () => {
  try {
    // Use native chrome.sidePanel — webextension-polyfill doesn't bridge this API
    const chromeGlobal = globalThis as unknown as {
      chrome?: {
        sidePanel?: { open: (opts: { windowId: number }) => Promise<void> };
      };
    };
    const sidebarAction = (browser as unknown as Record<string, unknown>).sidebarAction as
      | { open: () => Promise<void> }
      | undefined;

    if (chromeGlobal.chrome?.sidePanel?.open) {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId != null) {
        await chromeGlobal.chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } else if (sidebarAction) {
      await sidebarAction.open();
    }
  } catch {
    // API not available — hide button
    btnPin.hidden = true;
  }
});

// --- Result tree ---
const TREE_MAX_POPUP = 3;
const TREE_MAX_SIDEPANEL = 50;

function renderResultTree(nodes: SerializedNode[]): void {
  resultTree.innerHTML = '';
  selectedTreeIndex = -1;

  if (nodes.length === 0) {
    resultTree.hidden = true;
    return;
  }

  resultTree.hidden = false;
  const limit = isSidePanel ? TREE_MAX_SIDEPANEL : TREE_MAX_POPUP;
  const visible = nodes.slice(0, limit);

  for (let i = 0; i < visible.length; i++) {
    resultTree.appendChild(createNodeElement(visible[i], i));
  }

  if (nodes.length > limit) {
    const more = document.createElement('div');
    more.className = 'result-tree__more';
    more.textContent = `… ${nodes.length - limit} more`;
    resultTree.appendChild(more);
  }
}

function createNodeElement(node: SerializedNode, index: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'result-tree__node';

  // Click to highlight element on page
  row.addEventListener('click', () => {
    const xpath = currentXPath;
    if (!xpath) return;

    // Toggle selection
    if (selectedTreeIndex === index) {
      selectedTreeIndex = -1;
      row.classList.remove('result-tree__node--selected');
      void sendMessage({ type: 'highlight:clear' });
      return;
    }

    // Deselect previous
    const prev = resultTree.querySelector('.result-tree__node--selected');
    if (prev) prev.classList.remove('result-tree__node--selected');

    selectedTreeIndex = index;
    row.classList.add('result-tree__node--selected');
    void sendMessage({ type: 'highlight:preview', xpath, index });
  });

  const tagOpen = document.createElement('span');
  tagOpen.className = 'result-tree__bracket';
  tagOpen.textContent = '<';

  const tagName = document.createElement('span');
  tagName.className = 'result-tree__tag';
  tagName.textContent = node.tag;

  row.appendChild(tagOpen);
  row.appendChild(tagName);

  for (const [name, value] of node.attrs) {
    const space = document.createTextNode(' ');
    row.appendChild(space);

    const attrName = document.createElement('span');
    attrName.className = 'result-tree__attr-name';
    attrName.textContent = name;
    row.appendChild(attrName);

    const eq = document.createElement('span');
    eq.className = 'result-tree__bracket';
    eq.textContent = '=';
    row.appendChild(eq);

    const attrVal = document.createElement('span');
    attrVal.className = 'result-tree__attr-value';
    attrVal.textContent = `"${value}"`;
    row.appendChild(attrVal);
  }

  const tagClose = document.createElement('span');
  tagClose.className = 'result-tree__bracket';
  tagClose.textContent = '>';
  row.appendChild(tagClose);

  if (node.text && node.children === 0) {
    const text = document.createElement('span');
    text.className = 'result-tree__text';
    text.textContent = node.text.length > 40 ? `${node.text.slice(0, 40)}…` : node.text;
    row.appendChild(text);
  } else if (node.children > 0) {
    const badge = document.createElement('span');
    badge.className = 'result-tree__child-badge';
    badge.textContent = String(node.children);
    row.appendChild(badge);
  }

  return row;
}

// --- Helpers ---
function clearResults(): void {
  matchCount.textContent = '0';
  matchCount.classList.remove('badge--unique');
  resultTree.innerHTML = '';
  resultTree.hidden = true;
  hideError();
}

function showError(msg: string): void {
  errorMessage.textContent = msg;
  errorMessage.hidden = false;
  xpathInput.classList.add('input--error');
}

function hideError(): void {
  errorMessage.hidden = true;
  xpathInput.classList.remove('input--error');
}

async function copyToClipboard(text: string, element: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    element.classList.add('variant-list__item--copied');
    setTimeout(() => element.classList.remove('variant-list__item--copied'), COPY_FLASH_MS);
  } catch {
    // Fallback: select text
  }
}

async function sendMessage(message: ExtensionMessage): Promise<unknown> {
  try {
    return await browser.runtime.sendMessage(message);
  } catch {
    return null;
  }
}
