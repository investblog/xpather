import { MAX_RESULTS } from '@shared/constants';
import type { SerializedNode, XPathEvaluationResult } from '@shared/types';

export function evaluateXPath(
  xpath: string,
  options?: {
    contextNode?: Node;
    documentNode?: Document;
    maxResults?: number;
  },
): XPathEvaluationResult {
  const doc = options?.documentNode ?? document;
  const context = options?.contextNode ?? doc;
  const cap = options?.maxResults ?? MAX_RESULTS;

  if (!xpath.trim()) {
    return { nodes: [], count: 0, error: null, truncated: false };
  }

  try {
    const result = doc.evaluate(xpath, context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const total = result.snapshotLength;
    const collected = Math.min(total, cap);
    const nodes: string[] = [];

    for (let i = 0; i < collected; i++) {
      const node = result.snapshotItem(i);
      if (node) {
        nodes.push(serializeNode(node));
      }
    }

    return {
      nodes,
      count: collected,
      error: null,
      truncated: total > cap,
    };
  } catch (e) {
    if (e instanceof DOMException && e.message.toLowerCase().includes('type')) {
      return { nodes: [], count: 0, error: 'UNSUPPORTED_RESULT_TYPE', truncated: false };
    }
    return { nodes: [], count: 0, error: 'INVALID_XPATH', truncated: false };
  }
}

export function evaluateXPathNodes(
  xpath: string,
  doc: Document = document,
  context: Node = doc,
  maxResults: number = MAX_RESULTS,
): { nodes: Node[]; count: number; truncated: boolean; error: string | null } {
  if (!xpath.trim()) {
    return { nodes: [], count: 0, truncated: false, error: null };
  }

  try {
    const result = doc.evaluate(xpath, context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const total = result.snapshotLength;
    const collected = Math.min(total, maxResults);
    const nodes: Node[] = [];

    for (let i = 0; i < collected; i++) {
      const node = result.snapshotItem(i);
      if (node) nodes.push(node);
    }

    return { nodes, count: collected, truncated: total > maxResults, error: null };
  } catch {
    return { nodes: [], count: 0, truncated: false, error: 'INVALID_XPATH' };
  }
}

function serializeNode(node: Node): SerializedNode {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const attrs: [string, string][] = [];
    for (const attr of el.attributes) {
      attrs.push([attr.name, attr.value.length > 80 ? `${attr.value.slice(0, 80)}…` : attr.value]);
    }
    return {
      tag: el.tagName.toLowerCase(),
      attrs,
      text: el.textContent?.trim().slice(0, 120) ?? '',
      children: el.childElementCount,
    };
  }
  return {
    tag: '#text',
    attrs: [],
    text: node.nodeValue?.trim().slice(0, 120) ?? '',
    children: 0,
  };
}
