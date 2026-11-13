import type { Formality, TargetLang, UsageInfo } from '../../shared/types';
import { makeBatches } from './batch';

export type DeepLErrorKind =
  | 'invalid_key'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'network'
  | 'aborted'
  | 'unknown';

export class DeepLError extends Error {
  constructor(
    public readonly kind: DeepLErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'DeepLError';
  }
}

function endpointBase(apiKey: string): string {
  return apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

// Payloads are text plus inline codes (see inlineCodes.ts), never raw WordprocessingML.
const INLINE_CODE_TAG_CONFIG = {
  tag_handling: 'xml',
  outline_detection: false,
  splitting_tags: [] as string[],
  non_splitting_tags: ['x', 'g', 'ph'],
};

export async function fetchUsage(apiKey: string): Promise<UsageInfo> {
  let res: Response;
  try {
    res = await fetch(`${endpointBase(apiKey)}/v2/usage`, {
      headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
    });
  } catch (e) {
    throw new DeepLError('network', (e as Error).message);
  }

  if (res.status === 403) throw new DeepLError('invalid_key', 'API key was rejected');
  if (!res.ok) throw new DeepLError('unknown', `Unexpected status ${res.status}`);

  const body = (await res.json()) as { character_count: number; character_limit: number };
  return {
    charactersUsed: body.character_count,
    characterLimit: body.character_limit,
  };
}

export interface TranslateBatchOptions {
  targetLang: TargetLang;
  formality: Formality;
  signal?: AbortSignal;
}

async function translateBatch(
  apiKey: string,
  texts: string[],
  opts: TranslateBatchOptions,
): Promise<string[]> {
  const body = JSON.stringify({
    text: texts,
    target_lang: opts.targetLang,
    formality: opts.formality,
    ...INLINE_CODE_TAG_CONFIG,
  });

  let res: Response;
  try {
    res = await fetch(`${endpointBase(apiKey)}/v2/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `DeepL-Auth-Key ${apiKey}`,
      },
      body,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new DeepLError('aborted', 'Translation cancelled');
    }
    throw new DeepLError('network', (e as Error).message);
  }

  if (res.status === 403) throw new DeepLError('invalid_key', 'API key was rejected');
  if (res.status === 456) throw new DeepLError('quota_exceeded', 'Monthly quota exceeded');
  if (res.status === 429) throw new DeepLError('rate_limited', 'Rate limit hit');
  if (res.status >= 500) throw new DeepLError('unknown', `Server error ${res.status}`);
  if (!res.ok) throw new DeepLError('unknown', `Unexpected status ${res.status}`);

  const parsed = (await res.json()) as { translations: Array<{ text: string }> };
  return parsed.translations.map((t) => t.text);
}

const RETRYABLE: ReadonlySet<DeepLErrorKind> = new Set([
  'rate_limited',
  'network',
  'unknown',
]);

export interface WithRetriesOptions {
  signal?: AbortSignal;
  maxAttempts?: number;
  /** Override for tests so we don't actually sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  opts: WithRetriesOptions = {},
): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const retryable = e instanceof DeepLError && RETRYABLE.has(e.kind);
      const isLast = attempt === max;
      if (!retryable || isLast) throw e;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      if (opts.signal?.aborted) throw new DeepLError('aborted', 'Translation cancelled');
      await sleep(delay);
    }
  }
  throw lastError;
}

export interface TranslateOptions extends TranslateBatchOptions {
  /** Called once per batch when it completes successfully. Sum across calls = total inputs. */
  onBatchDone?: (batchSize: number) => void;
  /** Test seam to avoid real backoff sleeps. */
  sleep?: (ms: number) => Promise<void>;
}

export async function translate(
  apiKey: string,
  texts: string[],
  opts: TranslateOptions,
): Promise<string[]> {
  const batches = makeBatches(texts);
  const results: string[] = [];
  for (const batch of batches) {
    if (opts.signal?.aborted) throw new DeepLError('aborted', 'Translation cancelled');
    const batchResults = await withRetries(() => translateBatch(apiKey, batch, opts), {
      signal: opts.signal,
      sleep: opts.sleep,
    });
    results.push(...batchResults);
    opts.onBatchDone?.(batch.length);
  }
  return results;
}
