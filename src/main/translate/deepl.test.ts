import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepLError, fetchUsage, translate, withRetries } from './deepl';

const FAKE_KEY = 'fake-key:fx';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function translationsBody(texts: string[]): { translations: Array<{ text: string }> } {
  return { translations: texts.map((t) => ({ text: `${t}-fr` })) };
}

const noSleep = (_ms: number) => Promise.resolve();

describe('fetchUsage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed usage on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { character_count: 100, character_limit: 500_000 }));
    const u = await fetchUsage(FAKE_KEY);
    expect(u).toEqual({ charactersUsed: 100, characterLimit: 500_000 });
  });

  it('throws invalid_key on 403', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, {}));
    await expect(fetchUsage(FAKE_KEY)).rejects.toMatchObject({ kind: 'invalid_key' });
  });

  it('uses free endpoint when key ends in :fx', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { character_count: 0, character_limit: 0 }));
    await fetchUsage('abc:fx');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api-free.deepl.com'),
      expect.anything(),
    );
  });

  it('uses pro endpoint when key does not end in :fx', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { character_count: 0, character_limit: 0 }));
    await fetchUsage('pro-key-without-suffix');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('://api.deepl.com'),
      expect.anything(),
    );
  });
});

describe('translate', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('translates a single batch in one request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, translationsBody(['a', 'b', 'c'])));
    const result = await translate(FAKE_KEY, ['a', 'b', 'c'], {
      targetLang: 'FR',
      formality: 'prefer_more',
      sleep: noSleep,
    });
    expect(result).toEqual(['a-fr', 'b-fr', 'c-fr']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('splits into multiple batches at maxStrings boundary', async () => {
    const texts = Array.from({ length: 125 }, (_, i) => `t${i}`);
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body) as { text: string[] };
      return jsonResponse(200, translationsBody(body.text));
    });
    const result = await translate(FAKE_KEY, texts, { targetLang: 'FR', formality: 'prefer_more', sleep: noSleep });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.length).toBe(125);
    expect(result[0]).toBe('t0-fr');
    expect(result[124]).toBe('t124-fr');
  });

  it('retries on 429 then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(200, translationsBody(['a'])));
    const result = await translate(FAKE_KEY, ['a'], { targetLang: 'FR', formality: 'prefer_more', sleep: noSleep });
    expect(result).toEqual(['a-fr']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(502, {}))
      .mockResolvedValueOnce(jsonResponse(200, translationsBody(['a'])));
    const result = await translate(FAKE_KEY, ['a'], { targetLang: 'FR', formality: 'prefer_more', sleep: noSleep });
    expect(result).toEqual(['a-fr']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails fast on 403 (invalid_key)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, {}));
    await expect(translate(FAKE_KEY, ['a'], { targetLang: 'FR', formality: 'prefer_more', sleep: noSleep })).rejects.toMatchObject({
      kind: 'invalid_key',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast on 456 (quota_exceeded)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(456, {}));
    await expect(translate(FAKE_KEY, ['a'], { targetLang: 'FR', formality: 'prefer_more', sleep: noSleep })).rejects.toMatchObject({
      kind: 'quota_exceeded',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after 3 retries on persistent retryable error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, {}));
    await expect(translate(FAKE_KEY, ['a'], { targetLang: 'FR', formality: 'prefer_more', sleep: noSleep })).rejects.toMatchObject({
      kind: 'rate_limited',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws aborted when signal fires before next batch', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(async (_url, init) => {
      const body = JSON.parse(init.body) as { text: string[] };
      controller.abort();
      return jsonResponse(200, translationsBody(body.text));
    });
    const texts = Array.from({ length: 55 }, (_, i) => `t${i}`);
    await expect(
      translate(FAKE_KEY, texts, {
        targetLang: 'FR',
        formality: 'prefer_more',
        signal: controller.signal,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('sends the formality from opts in the request body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, translationsBody(['a'])));
    await translate(FAKE_KEY, ['a'], {
      targetLang: 'FR',
      formality: 'prefer_less',
      sleep: noSleep,
    });
    const init = fetchMock.mock.calls[0][1] as { body: string };
    const body = JSON.parse(init.body) as { formality: string };
    expect(body.formality).toBe('prefer_less');
  });

  it('calls onBatchDone once per batch', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body) as { text: string[] };
      return jsonResponse(200, translationsBody(body.text));
    });
    const texts = Array.from({ length: 75 }, (_, i) => `t${i}`);
    const onBatchDone = vi.fn();
    await translate(FAKE_KEY, texts, {
      targetLang: 'FR',
      formality: 'prefer_more',
      sleep: noSleep,
      onBatchDone,
    });
    expect(onBatchDone).toHaveBeenCalledTimes(2);
    expect(onBatchDone.mock.calls.map((c) => c[0])).toEqual([50, 25]);
  });
});

describe('withRetries', () => {
  it('returns immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetries(fn, { sleep: noSleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new DeepLError('invalid_key', 'no'));
    await expect(withRetries(fn, { sleep: noSleep })).rejects.toMatchObject({ kind: 'invalid_key' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-DeepLError throws', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('boom'));
    await expect(withRetries(fn, { sleep: noSleep })).rejects.toBeInstanceOf(TypeError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
