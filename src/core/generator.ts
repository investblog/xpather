import {
  ALLOWED_ATTRIBUTES,
  CLASS_MIN_LENGTH,
  DATA_ATTR_PRIORITY,
  FORBIDDEN_ATTR_PREFIXES,
  HEX_HASH_MIN_LENGTH,
  MAX_PER_STRATEGY,
  MAX_VARIANTS,
  REJECTED_CLASS_PREFIXES,
  REJECTED_UTILITY_CLASSES,
  TEXT_MAX_LENGTH,
} from '@shared/constants';
import type { Strategy, XPathVariant } from '@shared/types';
import { evaluateXPathNodes } from './evaluator';
import { findOptimizedPath } from './optimizer';

export function generateVariants(element: Element, doc: Document = document): XPathVariant[] {
  const strategies: { strategy: Strategy; xpaths: string[] }[] = [
    { strategy: 'id', xpaths: generateIdXPaths(element, doc) },
    { strategy: 'data-attr', xpaths: generateDataAttrXPaths(element, doc) },
    { strategy: 'attribute', xpaths: generateAttributeXPaths(element, doc) },
    { strategy: 'text', xpaths: generateTextXPaths(element, doc) },
    { strategy: 'class', xpaths: generateClassXPaths(element, doc) },
    { strategy: 'optimized', xpaths: generateOptimizedXPaths(element, doc) },
    { strategy: 'absolute', xpaths: [generateAbsolutePath(element)] },
  ];

  const seen = new Set<string>();
  const variants: XPathVariant[] = [];

  for (const { strategy, xpaths } of strategies) {
    let count = 0;
    for (const xpath of xpaths) {
      if (variants.length >= MAX_VARIANTS) break;
      if (count >= MAX_PER_STRATEGY) break;
      if (seen.has(xpath)) continue;
      seen.add(xpath);

      const result = evaluateXPathNodes(xpath, doc);
      variants.push({
        xpath,
        strategy,
        matchCount: result.count,
        label: `STRATEGY_${strategy.toUpperCase().replace('-', '_')}`,
      });
      count++;
    }
    if (variants.length >= MAX_VARIANTS) break;
  }

  return variants;
}

function generateIdXPaths(element: Element, doc: Document): string[] {
  const results: string[] = [];
  const tag = element.tagName.toLowerCase();

  // Direct id
  const id = element.getAttribute('id');
  if (id && isUniqueId(id, doc)) {
    results.push(`//${tag}[@id=${escapeXPathString(id)}]`);
  }

  // Ancestor id + relative path
  let ancestor = element.parentElement;
  const relativeParts: string[] = [tag];
  while (ancestor && ancestor !== doc.documentElement) {
    const ancestorId = ancestor.getAttribute('id');
    if (ancestorId && isUniqueId(ancestorId, doc)) {
      const relPath = relativeParts.reverse().join('/');
      results.push(`//*[@id=${escapeXPathString(ancestorId)}]//${relPath}`);
      break;
    }
    relativeParts.push(ancestor.tagName.toLowerCase());
    ancestor = ancestor.parentElement;
  }

  return results;
}

function generateDataAttrXPaths(element: Element, _doc: Document): string[] {
  const results: string[] = [];
  const tag = element.tagName.toLowerCase();

  for (const attr of DATA_ATTR_PRIORITY) {
    const value = element.getAttribute(attr);
    if (value) {
      results.push(`//${tag}[@${attr}=${escapeXPathString(value)}]`);
    }
  }

  return results;
}

function generateAttributeXPaths(element: Element, doc: Document): string[] {
  const results: string[] = [];
  const tag = element.tagName.toLowerCase();

  // Single-attribute selectors
  const candidates: { attr: string; value: string }[] = [];
  for (const attr of ALLOWED_ATTRIBUTES) {
    const value = element.getAttribute(attr);
    if (!value) continue;
    if (attr === 'href' && (value.length > 100 || value.startsWith('#'))) continue;
    if (isForbiddenAttr(attr)) continue;
    candidates.push({ attr, value });
  }

  // Try single attributes first
  for (const { attr, value } of candidates) {
    const xpath = `//${tag}[@${attr}=${escapeXPathString(value)}]`;
    const res = evaluateXPathNodes(xpath, doc);
    if (res.count === 1) {
      results.push(xpath);
      if (results.length >= MAX_PER_STRATEGY) return results;
    }
  }

  // Try 2-attribute combinations
  if (results.length === 0 && candidates.length >= 2) {
    for (let i = 0; i < candidates.length && results.length < MAX_PER_STRATEGY; i++) {
      for (let j = i + 1; j < candidates.length && results.length < MAX_PER_STRATEGY; j++) {
        const a = candidates[i];
        const b = candidates[j];
        const xpath = `//${tag}[@${a.attr}=${escapeXPathString(a.value)}][@${b.attr}=${escapeXPathString(b.value)}]`;
        const res = evaluateXPathNodes(xpath, doc);
        if (res.count === 1) {
          results.push(xpath);
        }
      }
    }
  }

  // If nothing is unique, emit best single-attr anyway
  if (results.length === 0 && candidates.length > 0) {
    const { attr, value } = candidates[0];
    results.push(`//${tag}[@${attr}=${escapeXPathString(value)}]`);
  }

  return results;
}

function generateTextXPaths(element: Element, _doc: Document): string[] {
  const results: string[] = [];
  const text = element.textContent?.trim() ?? '';

  if (text.length < 1 || text.length > TEXT_MAX_LENGTH) return results;
  if (text.includes('\n') || text.includes('\r')) return results;
  if (isTokenLike(text)) return results;

  // Exact match with normalize-space
  const escaped = escapeXPathString(text);
  results.push(`//*[normalize-space(.)=${escaped}]`);

  // Contains for shorter substring if text has spaces (multi-word)
  if (text.includes(' ') && text.length > 20) {
    const short = text.split(' ').slice(0, 3).join(' ');
    results.push(`//*[contains(normalize-space(.), ${escapeXPathString(short)})]`);
  }

  return results;
}

function generateClassXPaths(element: Element, _doc: Document): string[] {
  const results: string[] = [];
  const tag = element.tagName.toLowerCase();
  const classList = element.getAttribute('class')?.split(/\s+/).filter(Boolean) ?? [];
  const meaningful = classList.filter(isSemanticClass);

  for (const cls of meaningful) {
    if (results.length >= MAX_PER_STRATEGY) break;
    results.push(`//${tag}[contains(concat(" ", normalize-space(@class), " "), ${escapeXPathString(` ${cls} `)})]`);
  }

  return results;
}

function generateOptimizedXPaths(element: Element, doc: Document): string[] {
  const optimized = findOptimizedPath(element, doc);
  return optimized ? [optimized] : [];
}

function generateAbsolutePath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tag = current.tagName.toLowerCase();
    if (tag === 'html') {
      parts.unshift('html');
      break;
    }

    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName.toLowerCase() === tag) index++;
      sibling = sibling.previousElementSibling;
    }

    // Check if index is needed (are there siblings with same tag?)
    let needsIndex = false;
    let nextSib = current.nextElementSibling;
    while (nextSib) {
      if (nextSib.tagName.toLowerCase() === tag) {
        needsIndex = true;
        break;
      }
      nextSib = nextSib.nextElementSibling;
    }
    if (index > 1) needsIndex = true;

    parts.unshift(needsIndex ? `${tag}[${index}]` : tag);
    current = current.parentElement;
  }

  return `/${parts.join('/')}`;
}

// --- Helpers ---

function isUniqueId(id: string, doc: Document): boolean {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/([^\w-])/g, '\\$1');
  return doc.querySelectorAll(`[id="${escaped}"]`).length === 1;
}

function isForbiddenAttr(attr: string): boolean {
  return FORBIDDEN_ATTR_PREFIXES.some((prefix) => attr.startsWith(prefix));
}

function isSemanticClass(cls: string): boolean {
  if (cls.length < CLASS_MIN_LENGTH) return false;
  if (REJECTED_UTILITY_CLASSES.has(cls)) return false;
  if (REJECTED_CLASS_PREFIXES.some((prefix) => cls.startsWith(prefix))) return false;
  // Reject tailwind-style utility classes (e.g., mt-4, px-2, py-3)
  if (/^[a-z]{1,3}-\d+$/.test(cls)) return false;
  // Reject hash-like tokens (e.g., css-1a2b3c4)
  if (new RegExp(`[0-9a-f]{${HEX_HASH_MIN_LENGTH},}`, 'i').test(cls)) return false;
  return true;
}

function isTokenLike(text: string): boolean {
  // Password-like or token-like: long strings without spaces, lots of special chars
  if (text.length > 20 && !text.includes(' ')) return true;
  if (/^[A-Za-z0-9+/=_-]{20,}$/.test(text)) return true;
  return false;
}

export function escapeXPathString(str: string): string {
  if (!str.includes('"')) return `"${str}"`;
  if (!str.includes("'")) return `'${str}'`;

  const parts = str.split('"');
  const literals: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) {
      literals.push(`"${parts[i]}"`);
    }
    if (i < parts.length - 1) {
      literals.push(`'"'`);
    }
  }

  if (literals.length === 0) {
    return '""';
  }

  return literals.length === 1 ? literals[0] : `concat(${literals.join(', ')})`;
}
