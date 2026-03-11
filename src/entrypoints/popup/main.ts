import { COPY_FLASH_MS, DEBOUNCE_MS } from '@shared/constants';
import { brandIcon, logoIcon, svgIcon } from '@shared/icons';
import type { ExtensionMessage, StateCurrentMessage, XPathResultMessage } from '@shared/messaging/protocol';
import { getStoreInfo } from '@shared/store-links';
import { cycleTheme, initTheme } from '@shared/theme';
import type { SerializedNode, XPathVariant } from '@shared/types';

const GITHUB_URL = 'https://github.com/nicksulkers/xpather';
const NODE_TEXT_MAX_LENGTH = 40;
const ATTR_VALUE_MAX_LENGTH = 24;

type MessageKey = Parameters<typeof browser.i18n.getMessage>[0];
type MessageSubstitutions = Parameters<typeof browser.i18n.getMessage>[1];

function getMessage(key: string, substitutions?: MessageSubstitutions): string {
  return browser.i18n.getMessage(key as MessageKey, substitutions) || key;
}

function applyI18n(): void {
  document.title = getMessage('EXTENSION_NAME');

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (!key) continue;
    el.textContent = getMessage(key);
  }

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = el.dataset.i18nTitle;
    if (!key) continue;
    el.title = getMessage(key);
  }

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    const key = el.dataset.i18nAriaLabel;
    if (!key) continue;
    el.setAttribute('aria-label', getMessage(key));
  }

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]')) {
    const key = el.dataset.i18nPlaceholder;
    if (!key) continue;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.placeholder = getMessage(key);
    }
  }
}

applyI18n();

let currentTheme = initTheme();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let currentXPath = '';
let selectedTreeIndex = -1;
let pickerActive = false;
const isSidePanel = new URLSearchParams(window.location.search).has('sidepanel');

// --- DOM references ---
const xpathInput = document.getElementById('xpath-input') as HTMLInputElement;
const matchCount = document.getElementById('match-count') as HTMLElement;
const resultSummary = document.getElementById('result-summary') as HTMLElement;
const resultTree = document.getElementById('result-tree') as HTMLElement;
const errorMessage = document.getElementById('error-message') as HTMLElement;
const variantsSection = document.getElementById('variants-section') as HTMLElement;
const variantList = document.getElementById('variant-list') as HTMLElement;
const btnPick = document.getElementById('btn-pick') as HTMLButtonElement;
const btnTheme = document.getElementById('btn-theme') as HTMLButtonElement;
const btnPin = document.getElementById('btn-pin') as HTMLButtonElement;
const btnCopy = document.getElementById('btn-copy') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const inputWrap = xpathInput.parentElement as HTMLElement;
const linkRate = document.getElementById('link-rate') as HTMLAnchorElement;
const linkGithub = document.getElementById('link-github') as HTMLAnchorElement;
const linkSponsor = document.getElementById('link-sponsor') as HTMLAnchorElement;

// --- Logo + button icons ---
document.getElementById('title-logo')?.appendChild(logoIcon(18));
btnPick.appendChild(svgIcon('cursorClick'));
btnTheme.appendChild(svgIcon('brightness'));
btnPin.appendChild(svgIcon('dockRight'));
btnCopy.appendChild(svgIcon('copy'));
btnClear.appendChild(svgIcon('close', 14));

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

setPickerState(false);
updateInputControls();
window.addEventListener('pagehide', () => {
  void clearAllHighlights();
});

// --- Init: load state from background ---
async function loadState(): Promise<void> {
  const response = (await browser.runtime.sendMessage({ type: 'state:get' })) as StateCurrentMessage;
  if (!response?.state) return;

  const { lastInput, lastVariants, pickerActive: isActive } = response.state;
  if (lastInput) {
    xpathInput.value = lastInput;
    currentXPath = lastInput;
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
  currentXPath = '';
  updateInputControls();
  clearResults();
  void clearAllHighlights();
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
      currentXPath = '';
      updateInputControls();
      clearResults();
      void clearAllHighlights();
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
    await clearAllHighlights();
    return;
  }

  await clearPreviewHighlights();
  const response = (await sendMessage({ type: 'xpath:evaluate', xpath })) as XPathResultMessage | null;
  if (!response?.result) return;

  const { result } = response;

  if (result.error) {
    clearResultPreview();
    showError(getMessage(result.error));
    matchCount.textContent = '0';
    matchCount.classList.remove('badge--unique');
    await clearAllHighlights();
    return;
  }

  hideError();
  matchCount.classList.toggle('badge--unique', result.count === 1);
  matchCount.textContent = result.truncated ? `${result.count}+` : String(result.count);

  renderResultSummary(result.nodes, result.count, result.truncated);
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

    if (i === bestIndex) {
      const best = document.createElement('span');
      best.className = 'variant-list__best';
      best.appendChild(svgIcon('star', 12));
      best.title = getMessage('BEST_VARIANT');
      li.appendChild(best);
    }

    const strategySpan = document.createElement('span');
    strategySpan.className = 'variant-list__strategy';
    strategySpan.textContent = getMessage(variant.label);

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

    li.addEventListener('click', () => {
      void copyToClipboard(variant.xpath, li);
      xpathInput.value = variant.xpath;
      currentXPath = variant.xpath;
      updateInputControls();
      void clearPreviewHighlights();
      void evaluateInput();
    });

    if (isSidePanel) {
      li.addEventListener('mouseenter', () => {
        void sendMessage({ type: 'highlight:preview', xpath: variant.xpath });
      });
      li.addEventListener('mouseleave', () => {
        void clearPreviewHighlights();
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
      window.close();
    }
  }
});

function setPickerState(active: boolean): void {
  pickerActive = active;
  btnPick.classList.toggle('btn--active', active);
  const label = active ? getMessage('PICK_ELEMENT_STOP') : getMessage('PICK_ELEMENT');
  btnPick.title = label;
  btnPick.setAttribute('aria-label', label);
}

// Listen for picker results and state changes.
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
    btnPin.hidden = true;
  }
});

// --- Result preview ---
const TREE_MAX_POPUP = 3;
const TREE_MAX_SIDEPANEL = 50;

function renderResultSummary(nodes: SerializedNode[], count: number, truncated: boolean): void {
  if (nodes.length === 0) {
    resultSummary.hidden = true;
    resultSummary.textContent = '';
    return;
  }

  const descriptor = describeNode(nodes[0]);
  const countLabel = truncated ? `${count}+` : String(count);
  resultSummary.textContent =
    count > 1 || truncated
      ? getMessage('MATCHES_PREVIEW_SUMMARY', [countLabel, descriptor])
      : getMessage('FIRST_MATCH_SUMMARY', descriptor);
  resultSummary.hidden = false;
}

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

    if (node.childNodes && node.childNodes.length > 0) {
      for (const child of node.childNodes) {
        resultTree.appendChild(createNodeElement(child, -1, 1));
      }
    }
  }

  if (nodes.length > limit) {
    const more = document.createElement('div');
    more.className = 'result-tree__more';
    more.textContent = getMessage('MORE_RESULTS', String(nodes.length - limit));
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

  if (index >= 0) {
    row.addEventListener('click', () => {
      const xpath = currentXPath;
      if (!xpath) return;

      if (selectedTreeIndex === index) {
        selectedTreeIndex = -1;
        row.classList.remove('result-tree__node--selected');
        void clearPreviewHighlights();
        return;
      }

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
    text.textContent = truncateText(node.text, NODE_TEXT_MAX_LENGTH);
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
  clearResultPreview();
  hideError();
}

function clearResultPreview(): void {
  selectedTreeIndex = -1;
  resultSummary.textContent = '';
  resultSummary.hidden = true;
  resultTree.innerHTML = '';
  resultTree.hidden = true;
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

async function clearPreviewHighlights(): Promise<void> {
  await sendMessage({ type: 'highlight:clear-preview' });
}

async function clearAllHighlights(): Promise<void> {
  await sendMessage({ type: 'highlight:clear' });
}

function describeNode(node: SerializedNode): string {
  const text = normalizeWhitespace(node.text);
  if (node.tag === '#text') {
    return text ? `"${truncateText(text, NODE_TEXT_MAX_LENGTH)}"` : getMessage('NODE_NO_TEXT');
  }

  const attrs = new Map(node.attrs);
  let selector = node.tag;
  const id = attrs.get('id');
  if (id) {
    selector += `#${truncateText(id, ATTR_VALUE_MAX_LENGTH)}`;
  } else {
    const attrPriority = [
      'data-testid',
      'data-test',
      'data-qa',
      'data-cy',
      'data-automation',
      'name',
      'aria-label',
      'role',
      'type',
    ];
    for (const attr of attrPriority) {
      const value = attrs.get(attr);
      if (!value) continue;
      selector += `[${attr}="${truncateText(value, ATTR_VALUE_MAX_LENGTH)}"]`;
      break;
    }
  }

  const textPreview = text ? `"${truncateText(text, NODE_TEXT_MAX_LENGTH)}"` : getMessage('NODE_NO_TEXT');
  return `${selector} / ${textPreview}`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

async function copyToClipboard(text: string, element: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    const flashClass = element.classList.contains('btn--copy') ? 'btn--copied' : 'variant-list__item--copied';
    element.classList.add(flashClass);
    setTimeout(() => element.classList.remove(flashClass), COPY_FLASH_MS);
  } catch {
    // No fallback in v1.0 - clipboard access is expected in extension pages.
  }
}

async function sendMessage(message: ExtensionMessage): Promise<unknown> {
  try {
    return await browser.runtime.sendMessage(message);
  } catch {
    return null;
  }
}
