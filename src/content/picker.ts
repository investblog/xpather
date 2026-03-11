import { generateVariants } from '@core/generator';
import type { XPathVariant } from '@shared/types';

let active = false;
let currentHighlight: HTMLElement | null = null;
let onPick: ((variants: XPathVariant[]) => void) | null = null;
let toastEl: HTMLElement | null = null;
let toastTimer = 0;

const HIGHLIGHT_STYLE = '2px solid #22c55e';
const HIGHLIGHT_ATTR = 'data-xh-picker-highlight';
const TOAST_TIMEOUT = 3500;

type MessageKey = Parameters<typeof browser.i18n.getMessage>[0];

function getMessage(key: string): string {
  return browser.i18n.getMessage(key as MessageKey) || key;
}

export function startPicker(callback: (variants: XPathVariant[]) => void): void {
  if (active) return;
  active = true;
  onPick = callback;
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  document.body.style.cursor = 'crosshair';
  showPickerToast();
}

export function stopPicker(): void {
  if (!active) return;
  active = false;
  onPick = null;
  clearPickerHighlight();
  dismissToast();
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('keyup', handleKeyUp, true);
  document.body.style.cursor = '';
}

export function isPickerActive(): boolean {
  return active;
}

function handleMouseMove(e: MouseEvent): void {
  if (!active) return;

  // Only highlight when Alt is held - page interactions pass through otherwise.
  if (!e.altKey) {
    if (currentHighlight) clearPickerHighlight();
    return;
  }

  if (toastEl) dismissToast();

  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  if (target === currentHighlight) return;

  clearPickerHighlight();
  currentHighlight = target;
  target.setAttribute(HIGHLIGHT_ATTR, '1');
  target.style.outline = HIGHLIGHT_STYLE;
  target.style.outlineOffset = '-1px';
}

function handleClick(e: MouseEvent): void {
  if (!active || !e.altKey) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.target;
  if (!(target instanceof Element)) return;

  clearPickerHighlight();

  const variants = generateVariants(target, document);
  const callback = onPick;
  stopPicker();
  callback?.(variants);
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && active) {
    e.preventDefault();
    e.stopPropagation();
    const callback = onPick;
    stopPicker();
    callback?.([]);
  }
}

function handleKeyUp(e: KeyboardEvent): void {
  if (e.key === 'Alt' && currentHighlight) {
    clearPickerHighlight();
  }
}

function clearPickerHighlight(): void {
  if (currentHighlight) {
    currentHighlight.style.outline = '';
    currentHighlight.style.outlineOffset = '';
    currentHighlight.removeAttribute(HIGHLIGHT_ATTR);
    currentHighlight = null;
  }
}

function showPickerToast(): void {
  dismissToast();
  const el = document.createElement('div');
  el.setAttribute('data-xh-toast', '1');
  el.style.cssText = `
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.82);
    color: #fff;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    border-radius: 8px;
    pointer-events: none;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.2s;
  `;
  el.textContent = getMessage('PICKER_TOAST');
  document.body.appendChild(el);
  el.offsetHeight;
  el.style.opacity = '1';
  toastEl = el;
  toastTimer = window.setTimeout(dismissToast, TOAST_TIMEOUT);
}

function dismissToast(): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = 0;
  }
  if (toastEl) {
    toastEl.style.opacity = '0';
    const el = toastEl;
    toastEl = null;
    setTimeout(() => el.remove(), 200);
  }
}
