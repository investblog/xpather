import { COPY_FLASH_MS, DEBOUNCE_MS } from '@shared/constants';
import type { ExtensionMessage, StateCurrentMessage, XPathResultMessage } from '@shared/messaging/protocol';
import { cycleTheme, initTheme } from '@shared/theme';
import type { XPathVariant } from '@shared/types';

let currentTheme = initTheme();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const isSidePanel = new URLSearchParams(window.location.search).has('sidepanel');

// --- DOM references ---
const xpathInput = document.getElementById('xpath-input') as HTMLInputElement;
const matchCount = document.getElementById('match-count')!;
const resultPreview = document.getElementById('result-preview')!;
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

  const { lastInput, lastVariants } = response.state;
  if (lastInput) {
    xpathInput.value = lastInput;
  }
  if (lastVariants.length > 0) {
    renderVariants(lastVariants);
  }
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

  if (result.nodes.length > 0) {
    resultPreview.textContent = result.nodes[0];
    resultPreview.hidden = false;
  } else {
    resultPreview.textContent = '';
    resultPreview.hidden = true;
  }
}

// --- Variants ---
function renderVariants(variants: XPathVariant[]): void {
  variantList.innerHTML = '';

  if (variants.length === 0) {
    variantsSection.hidden = true;
    return;
  }

  variantsSection.hidden = false;

  for (const variant of variants) {
    const li = document.createElement('li');
    li.className = 'variant-list__item';

    const xpathSpan = document.createElement('span');
    xpathSpan.className = 'variant-list__xpath';
    xpathSpan.textContent = variant.xpath;
    xpathSpan.title = variant.xpath;

    const strategySpan = document.createElement('span');
    strategySpan.className = 'variant-list__strategy';
    strategySpan.textContent =
      browser.i18n.getMessage(variant.label as keyof typeof import('@shared/types')) || variant.strategy;

    const badge = document.createElement('span');
    badge.className = 'variant-list__badge';
    badge.textContent = String(variant.matchCount);
    if (variant.matchCount === 1) badge.classList.add('badge--unique');

    li.appendChild(xpathSpan);
    li.appendChild(strategySpan);
    li.appendChild(badge);

    // Click to copy
    li.addEventListener('click', () => {
      void copyToClipboard(variant.xpath, li);
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

// --- Pick button ---
btnPick.addEventListener('click', () => {
  void sendMessage({ type: 'picker:start' });

  if (!isSidePanel) {
    // Popup will close when user clicks page — that's expected
    window.close();
  }
});

// Listen for picker results (side panel stays open)
if (isSidePanel) {
  browser.runtime.onMessage.addListener((raw: unknown) => {
    const message = raw as ExtensionMessage;
    if (message.type === 'picker:result') {
      renderVariants(message.variants);
    }
  });
}

// --- Theme ---
btnTheme.addEventListener('click', () => {
  currentTheme = cycleTheme(currentTheme);
});

// --- Pin to side panel ---
btnPin.addEventListener('click', async () => {
  try {
    const sidePanel = (browser as unknown as Record<string, unknown>).sidePanel as
      | { open: (opts: { tabId: number }) => Promise<void> }
      | undefined;
    const sidebarAction = (browser as unknown as Record<string, unknown>).sidebarAction as
      | { open: () => Promise<void> }
      | undefined;

    if (sidePanel) {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await sidePanel.open({ tabId: tab.id });
    } else if (sidebarAction) {
      await sidebarAction.open();
    }
  } catch {
    // API not available — hide button
    btnPin.hidden = true;
  }
});

// --- Helpers ---
function clearResults(): void {
  matchCount.textContent = '0';
  matchCount.classList.remove('badge--unique');
  resultPreview.textContent = '';
  resultPreview.hidden = true;
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
