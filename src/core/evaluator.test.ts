import { describe, expect, it } from 'vitest';
import { evaluateXPath } from './evaluator';

describe('evaluateXPath', () => {
  it('returns empty result for empty string', () => {
    const result = evaluateXPath('');
    expect(result.nodes).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.error).toBeNull();
    expect(result.truncated).toBe(false);
  });

  it('returns error for invalid xpath', () => {
    const result = evaluateXPath('///invalid[[[');
    expect(result.error).toBe('INVALID_XPATH');
    expect(result.nodes).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('finds matching elements', () => {
    document.body.innerHTML = '<div id="test">Hello</div>';
    const result = evaluateXPath('//div[@id="test"]');
    expect(result.error).toBeNull();
    expect(result.count).toBe(1);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toEqual({
      tag: 'div',
      attrs: [['id', 'test']],
      text: 'Hello',
      children: 0,
    });
    expect(result.truncated).toBe(false);
  });

  it('returns count 0 for no matches', () => {
    document.body.innerHTML = '<div>Hello</div>';
    const result = evaluateXPath('//span[@id="nonexistent"]');
    expect(result.error).toBeNull();
    expect(result.count).toBe(0);
    expect(result.nodes).toEqual([]);
  });

  it('respects maxResults cap', () => {
    document.body.innerHTML = Array.from({ length: 10 }, (_, i) => `<span class="item">${i}</span>`).join('');
    const result = evaluateXPath('//span[@class="item"]', { maxResults: 3 });
    expect(result.count).toBe(3);
    expect(result.nodes).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('does not truncate when under cap', () => {
    document.body.innerHTML = '<p>A</p><p>B</p>';
    const result = evaluateXPath('//p', { maxResults: 100 });
    expect(result.count).toBe(2);
    expect(result.truncated).toBe(false);
  });
});
