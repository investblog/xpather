import { generateVariants } from '@core/generator';
import type { XPathVariant } from '@shared/types';

let active = false;
let currentHighlight: HTMLElement | null = null;
let onPick: ((variants: XPathVariant[]) => void) | null = null;

const HIGHLIGHT_STYLE = '2px solid #22c55e';
const HIGHLIGHT_ATTR = 'data-xh-picker-highlight';

export function startPicker(callback: (variants: XPathVariant[]) => void): void {
  if (active) return;
  active = true;
  onPick = callback;
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.body.style.cursor = 'crosshair';
}

export function stopPicker(): void {
  if (!active) return;
  active = false;
  onPick = null;
  clearPickerHighlight();
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  document.body.style.cursor = '';
}

export function isPickerActive(): boolean {
  return active;
}

function handleMouseMove(e: MouseEvent): void {
  if (!active || !e.altKey) {
    clearPickerHighlight();
    return;
  }

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

function clearPickerHighlight(): void {
  if (currentHighlight) {
    currentHighlight.style.outline = '';
    currentHighlight.style.outlineOffset = '';
    currentHighlight.removeAttribute(HIGHLIGHT_ATTR);
    currentHighlight = null;
  }
}
