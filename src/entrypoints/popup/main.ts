import { COPY_FLASH_MS, DEBOUNCE_MS } from '@shared/constants';
import { brandIcon, logoIcon, svgIcon } from '@shared/icons';
import type { ExtensionMessage, StateCurrentMessage, XPathResultMessage } from '@shared/messaging/protocol';
import { getStoreInfo } from '@shared/store-links';
import { cycleTheme, initTheme } from '@shared/theme';
import type { SerializedNode, XPathVariant } from '@shared/types';

const GITHUB_URL = 'https://github.com/nicksulkers/xpather';

type MessageKey = Parameters<typeof browser.i18n.getMessage>[0];

function getMessage(key: string): string {
  return browser.i18n.getMessage(key as MessageKey) || key;
}

// --- i18n ---
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
  const key = el.dataset.i18n;
  if (!key) continue;
  const msg = getMessage(key);
  if (msg) el.textContent = msg;
}

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
const btnCopy = document.getElementById('btn-copy')!;
const btnClear = document.getElementById('btn-clear')!;
const inputWrap = xpathInput.parentElement!;
const linkRate = document.getElementById('link-rate') as HTMLAnchorElement;
const linkGithub = document.getElementById('link-github') as HTMLAnchorElement;
const linkSponsor = document.getElementById('link-sponsor') as HTMLAnchorElement;

// --- Logo + button icons ---
document.getElementById('title-logo')!.appendChild(logoIcon(18));
btnPick.appendChild(svgIcon('cursorClick'));
btnTheme.appendChild(svgIcon('brightness'));
btnPin.appendChild(svgIcon('dockRight'));
btnCopy.appendChild(svgIcon('copy'));
btnClear.appendChild(svgIcon('close', 14));

// --- Button titles via i18n ---
btnTheme.title = getMessage('TOGGLE_THEME');
btnPin.title = getMessage('PIN_SIDE_PANEL');
btnCopy.title = getMessage('COPY_XPATH');

// --- Footer links ---
const storeInfo = getStoreInfo();
if (storeInfo) {
  linkRate.href = storeInfo.url;
  linkRate.hidden = false;
}
linkGithub.href = GITHUB_URL;
linkGithub.appendChild(brandIcon('github', 14));
linkSponsor.appendChild(brandIcon('301', 14));

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
    updateInputControls();
  }
  if (lastVariants.length > 0) {
    renderVariants(lastVariants);
  }
  setPickerState(isActive);
}

void loadState();

// --- Copy current XPath ---
btnCopy.addEventListener('click', () => {
  const xpath = xpathInput.value.trim();
  if (!xpath) return;
  void copyToClipboard(xpath, btnCopy);
});

function updateInputControls(): void {
  const hasValue = xpathInput.value.trim().length > 0;
  btnCopy.hidden = !hasValue;
  inputWrap.classList.toggle('has-value', hasValue);
}

// --- Clear input ---
btnClear.addEventListener('click', () => {
  xpathInput.value = '';
  updateInputControls();
  clearResults();
  void sendMessage({ type: 'highlight:clear' });
  xpathInput.focus();
});

// --- XPath input ---
xpathInput.addEventListener('input', () => {
  updateInputControls();
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
    showError(getMessage(result.error));
    matchCount.textContent = '0';
    matchCount.classList.remove('badge--unique');
    return;
  }

  hideError();
  matchCount.classList.toggle('badge--unique', result.count === 1);

  if (result.count === 1 && result.nodes[0]?.descendants > 0) {
    matchCount.textContent = `1 · ${result.nodes[0].descendants}`;
  } else {
    matchCount.textContent = result.truncated ? `${result.count}+` : String(result.count);
  }

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

    // Star icon for first unique match
    if (i === bestIndex) {
      const best = document.createElement('span');
      best.className = 'variant-list__best';
      best.appendChild(svgIcon('star', 12));
      best.title = browser.i18n.getMessage('BEST_VARIANT') || 'best';
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
      updateInputControls();
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
    const node = visible[i];
    if (!node) continue;
    resultTree.appendChild(createNodeElement(node, i));

    // Expand direct children for single match
    if (node.childNodes && node.childNodes.length > 0) {
      for (const child of node.childNodes) {
        resultTree.appendChild(createNodeElement(child, -1, 1));
      }
    }
  }

  if (nodes.length > limit) {
    const more = document.createElement('div');
    more.className = 'result-tree__more';
    const remaining = nodes.length - limit;
    const template = getMessage('MORE_RESULTS');
    more.textContent = template.includes('$') ? template.replace('$COUNT$', String(remaining)) : `… ${remaining} more`;
    resultTree.appendChild(more);
  }
}

function createNodeElement(node: SerializedNode, index: number, depth = 0): HTMLElement {
  const row = document.createElement('div');
  row.className = 'result-tree__node';
  if (depth > 0) {
    row.classList.add('result-tree__node--child');
    row.style.paddingLeft = `${8 + depth * 16}px`;
  }

  // Click to highlight element on page (only for top-level matched nodes)
  if (index >= 0) {
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
  }

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
    const flashClass = element.classList.contains('btn--copy') ? 'btn--copied' : 'variant-list__item--copied';
    element.classList.add(flashClass);
    setTimeout(() => element.classList.remove(flashClass), COPY_FLASH_MS);
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
