import { describe, expect, it } from 'vitest';
import { generateVariants } from './generator';

describe('generateVariants', () => {
  it('generates id variant first when element has unique id', () => {
    document.body.innerHTML = '<input id="email" type="text" />';
    const el = document.getElementById('email')!;
    const variants = generateVariants(el, document);

    expect(variants.length).toBeGreaterThan(0);
    expect(variants[0].strategy).toBe('id');
    expect(variants[0].xpath).toContain('@id="email"');
  });

  it('generates data-testid variant', () => {
    document.body.innerHTML = '<button data-testid="submit-btn">Submit</button>';
    const el = document.querySelector('[data-testid]')!;
    const variants = generateVariants(el as Element, document);

    const dataAttrVariant = variants.find((v) => v.strategy === 'data-attr');
    expect(dataAttrVariant).toBeDefined();
    expect(dataAttrVariant!.xpath).toContain('@data-testid="submit-btn"');
  });

  it('falls back to absolute path when no attributes', () => {
    document.body.innerHTML = '<div><span></span></div>';
    const el = document.querySelector('span')!;
    const variants = generateVariants(el, document);

    const absolute = variants.find((v) => v.strategy === 'absolute');
    expect(absolute).toBeDefined();
    expect(absolute!.xpath).toMatch(/^\/html\//);
  });

  it('generates text variant for element with short text', () => {
    document.body.innerHTML = '<a href="#">Sign In</a>';
    const el = document.querySelector('a')!;
    const variants = generateVariants(el, document);

    const textVariant = variants.find((v) => v.strategy === 'text');
    expect(textVariant).toBeDefined();
    expect(textVariant!.xpath).toContain('Sign In');
  });

  it('skips text variant for long text', () => {
    document.body.innerHTML = `<p>${'a'.repeat(100)}</p>`;
    const el = document.querySelector('p')!;
    const variants = generateVariants(el, document);

    const textVariant = variants.find((v) => v.strategy === 'text');
    expect(textVariant).toBeUndefined();
  });

  it('deduplicates identical xpaths from different strategies', () => {
    document.body.innerHTML = '<input id="q" name="q" />';
    const el = document.querySelector('input')!;
    const variants = generateVariants(el, document);

    const xpaths = variants.map((v) => v.xpath);
    const unique = new Set(xpaths);
    expect(xpaths.length).toBe(unique.size);
  });

  it('caps total variants at MAX_VARIANTS', () => {
    document.body.innerHTML = `
      <input id="test" data-testid="test" data-qa="test" name="test"
             placeholder="test" type="text" title="test" aria-label="test"
             class="form-control input-lg primary-input" />
    `;
    const el = document.querySelector('input')!;
    const variants = generateVariants(el, document);

    expect(variants.length).toBeLessThanOrEqual(8);
  });

  it('filters out hash-like class tokens', () => {
    document.body.innerHTML = '<div class="css-1a2b3c4d content-wrapper">Hello</div>';
    const el = document.querySelector('div')!;
    const variants = generateVariants(el, document);

    const classVariants = variants.filter((v) => v.strategy === 'class');
    for (const v of classVariants) {
      expect(v.xpath).not.toContain('css-1a2b3c4d');
    }
  });

  it('uses token-safe class matching', () => {
    document.body.innerHTML = '<div class="content-wrapper main">Hello</div>';
    const el = document.querySelector('div')!;
    const variants = generateVariants(el, document);

    const classVariant = variants.find((v) => v.strategy === 'class');
    if (classVariant) {
      expect(classVariant.xpath).toContain('concat(" ", normalize-space(@class), " ")');
    }
  });

  it('generates valid XPath for attributes with mixed quotes', () => {
    document.body.innerHTML = `<button aria-label="He said &quot;it's ready&quot;">Go</button>`;
    const el = document.querySelector('button')!;
    const variants = generateVariants(el, document);

    const attributeVariant = variants.find((v) => v.strategy === 'attribute');
    expect(attributeVariant).toBeDefined();

    const result = document.evaluate(
      attributeVariant!.xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );

    expect(result.snapshotLength).toBe(1);
  });

  it('includes matchCount for each variant', () => {
    document.body.innerHTML = '<button id="submit">Go</button>';
    const el = document.querySelector('button')!;
    const variants = generateVariants(el, document);

    for (const v of variants) {
      expect(typeof v.matchCount).toBe('number');
      expect(v.matchCount).toBeGreaterThanOrEqual(0);
    }
  });
});
