import { describe, expect, it } from 'vitest';
import { makeBatches } from './batch';

describe('makeBatches', () => {
  it('returns empty array for empty input', () => {
    expect(makeBatches([])).toEqual([]);
  });

  it('puts everything in one batch when under limits', () => {
    const result = makeBatches(['a', 'b', 'c']);
    expect(result).toEqual([['a', 'b', 'c']]);
  });

  it('caps each batch at maxStrings', () => {
    const texts = Array.from({ length: 125 }, (_, i) => `s${i}`);
    const result = makeBatches(texts, { maxStrings: 50 });
    expect(result.length).toBe(3);
    expect(result[0].length).toBe(50);
    expect(result[1].length).toBe(50);
    expect(result[2].length).toBe(25);
  });

  it('caps each batch at maxBytes', () => {
    const big = 'x'.repeat(50_000);
    const result = makeBatches([big, big, big], { maxBytes: 120_000 });
    expect(result.length).toBe(2);
    expect(result[0]).toEqual([big, big]);
    expect(result[1]).toEqual([big]);
  });

  it('always places at least one string per batch even if over maxBytes', () => {
    const huge = 'y'.repeat(200_000);
    const result = makeBatches([huge, 'small'], { maxBytes: 120_000 });
    expect(result).toEqual([[huge], ['small']]);
  });

  it('preserves order across batches', () => {
    const texts = ['a', 'b', 'c', 'd', 'e'];
    const flat = makeBatches(texts, { maxStrings: 2 }).flat();
    expect(flat).toEqual(texts);
  });
});
