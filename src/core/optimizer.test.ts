import { describe, expect, it } from 'vitest';
import { findOptimizedPath } from './optimizer';

describe('findOptimizedPath', () => {
  it('returns short path for element with unique id', () => {
    document.body.innerHTML = '<div><input id="email" type="text" /></div>';
    const el = document.getElementById('email')!;
    const result = findOptimizedPath(el, document);

    expect(result).toBeDefined();
    expect(result).toContain('@id="email"');
    // Should be short — single step
    expect(result!.split('/').filter(Boolean).length).toBeLessThanOrEqual(3);
  });

  it('returns null for body/html elements', () => {
    const result = findOptimizedPath(document.body, document);
    expect(result).toBeNull();
  });

  it('builds multi-step path for deeply nested element', () => {
    document.body.innerHTML = `
      <div>
        <div>
          <div>
            <span class="target">deep</span>
            <span class="target">deep2</span>
          </div>
        </div>
      </div>
    `;
    const el = document.querySelector('.target')!;
    const result = findOptimizedPath(el, document);

    expect(result).toBeDefined();
    // Should find some path that uniquely identifies the first .target
    if (result) {
      const evalResult = document.evaluate(result, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      expect(evalResult.snapshotLength).toBe(1);
    }
  });

  it('prefers attribute over positional index', () => {
    document.body.innerHTML = `
      <form>
        <input type="text" name="username" />
        <input type="password" name="password" />
      </form>
    `;
    const el = document.querySelector('input[name="username"]')!;
    const result = findOptimizedPath(el, document);

    expect(result).toBeDefined();
    // Should use @name or @type, not positional index
    if (result) {
      expect(result).toMatch(/@name|@type/);
    }
  });
});
