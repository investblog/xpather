import { evaluateXPathNodes } from './evaluator';
import { escapeXPathString } from './generator';

export function findOptimizedPath(element: Element, doc: Document = document): string | null {
  // Try shortest selectors first, then prepend ancestors
  const steps: string[] = [];
  let current: Element | null = element;

  while (current && current !== doc.documentElement && current !== doc.body) {
    const step = buildBestStep(current, doc);
    steps.unshift(step);

    // Test if current path is unique
    const xpath = `//${steps.join('/')}`;
    const result = evaluateXPathNodes(xpath, doc);
    if (result.count === 1 && !result.error) {
      return xpath;
    }

    current = current.parentElement;
  }

  return null;
}

function buildBestStep(element: Element, doc: Document): string {
  const tag = element.tagName.toLowerCase();

  // 1. Try unique attribute (most stable)
  const attrStep = tryAttributeStep(element, tag, doc);
  if (attrStep) return attrStep;

  // 2. Try semantic class token
  const classStep = tryClassStep(element, tag, doc);
  if (classStep) return classStep;

  // 3. Fall back to positional index
  return buildPositionalStep(element, tag);
}

function tryAttributeStep(element: Element, tag: string, doc: Document): string | null {
  const priority = ['id', 'name', 'data-testid', 'data-test', 'data-qa', 'type', 'role', 'aria-label'];

  for (const attr of priority) {
    const value = element.getAttribute(attr);
    if (!value) continue;

    const step = `${tag}[@${attr}=${escapeXPathString(value)}]`;
    const xpath = `//${step}`;
    const result = evaluateXPathNodes(xpath, doc);
    if (result.count === 1) return step;
  }

  return null;
}

function tryClassStep(element: Element, tag: string, _doc: Document): string | null {
  const classList = element.getAttribute('class')?.split(/\s+/).filter(Boolean) ?? [];

  for (const cls of classList) {
    if (cls.length < 3) continue;
    if (/[0-9a-f]{6,}/i.test(cls)) continue;
    if (/^[a-z]{1,3}-\d+$/.test(cls)) continue;

    return `${tag}[contains(concat(" ", normalize-space(@class), " "), ${escapeXPathString(` ${cls} `)})]`;
  }

  return null;
}

function buildPositionalStep(element: Element, tag: string): string {
  let index = 1;
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (sibling.tagName.toLowerCase() === tag) index++;
    sibling = sibling.previousElementSibling;
  }

  // Check if indexing is needed
  let hasFollowingSameTag = false;
  let next = element.nextElementSibling;
  while (next) {
    if (next.tagName.toLowerCase() === tag) {
      hasFollowingSameTag = true;
      break;
    }
    next = next.nextElementSibling;
  }

  if (index === 1 && !hasFollowingSameTag) return tag;
  return `${tag}[${index}]`;
}
