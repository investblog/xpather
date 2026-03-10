import { evaluateXPathNodes } from '@core/evaluator';
import type { HighlightChannel } from '@shared/types';

interface HighlightOverlay {
  element: HTMLDivElement;
  target: Element;
}

const channels = new Map<HighlightChannel, HighlightOverlay[]>();

const CHANNEL_COLORS: Record<HighlightChannel, string> = {
  picker: '#22c55e',
  matches: '#eab308',
  preview: '#3b82f6',
};

export function highlightMatches(xpath: string, channel: HighlightChannel): number {
  clearChannel(channel);

  if (!xpath.trim()) return 0;

  const { nodes, error } = evaluateXPathNodes(xpath, document);
  if (error) return 0;

  const overlays: HighlightOverlay[] = [];
  for (const node of nodes) {
    if (!(node instanceof Element)) continue;
    const overlay = createOverlay(node, channel);
    if (overlay) overlays.push(overlay);
  }

  channels.set(channel, overlays);
  return nodes.length;
}

export function clearChannel(channel: HighlightChannel): void {
  const overlays = channels.get(channel);
  if (!overlays) return;

  for (const { element } of overlays) {
    element.remove();
  }
  channels.delete(channel);
}

export function clearAllHighlights(): void {
  for (const channel of channels.keys()) {
    clearChannel(channel);
  }
}

function createOverlay(target: Element, channel: HighlightChannel): HighlightOverlay | null {
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  const el = document.createElement('div');
  el.setAttribute('data-xh-highlight', channel);
  el.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    outline: 2px solid ${CHANNEL_COLORS[channel]};
    outline-offset: -1px;
    background: ${CHANNEL_COLORS[channel]}1a;
    pointer-events: none;
    z-index: 2147483646;
    box-sizing: border-box;
  `;

  document.body.appendChild(el);

  return { element: el, target };
}

export function refreshPositions(): void {
  for (const overlays of channels.values()) {
    for (const { element, target } of overlays) {
      const rect = target.getBoundingClientRect();
      element.style.top = `${rect.top}px`;
      element.style.left = `${rect.left}px`;
      element.style.width = `${rect.width}px`;
      element.style.height = `${rect.height}px`;
    }
  }
}
