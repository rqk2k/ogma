export interface BatchOptions {
  maxStrings?: number;
  maxBytes?: number;
}

const DEFAULT_MAX_STRINGS = 50;
const DEFAULT_MAX_BYTES = 120_000;
const OVERHEAD_PER_ITEM = 10;

export function makeBatches(texts: string[], opts: BatchOptions = {}): string[][] {
  const maxStrings = opts.maxStrings ?? DEFAULT_MAX_STRINGS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const batches: string[][] = [];
  let current: string[] = [];
  let currentBytes = 0;

  for (const text of texts) {
    const itemBytes = Buffer.byteLength(text, 'utf8') + OVERHEAD_PER_ITEM;
    if (current.length === 0) {
      current.push(text);
      currentBytes = itemBytes;
      continue;
    }
    if (current.length >= maxStrings || currentBytes + itemBytes > maxBytes) {
      batches.push(current);
      current = [text];
      currentBytes = itemBytes;
    } else {
      current.push(text);
      currentBytes += itemBytes;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
