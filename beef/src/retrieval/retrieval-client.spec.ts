import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Logger } from 'pino';
import { RetrievalClient } from './retrieval-client.js';

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('RetrievalClient', () => {
  let logger: Logger;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = createMockLogger();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeClient(): RetrievalClient {
    return new RetrievalClient({ baseUrl: 'http://localhost:8100/', logger });
  }

  describe('findSimilar', () => {
    it('returns duplicate hits and strips the trailing slash from the base url', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ duplicates: [{ id: 'stockpile:7', text: 'same roast', similarity: 0.91 }] }),
      );

      const hits = await makeClient().findSimilar('same roast but new');

      expect(hits).toEqual([{ id: 'stockpile:7', text: 'same roast', similarity: 0.91 }]);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8100/similar',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('passes a custom threshold through to the service', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ duplicates: [] }));

      await makeClient().findSimilar('text', 0.95);

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as {
        threshold: number;
      };
      expect(body.threshold).toBe(0.95);
    });

    it('returns null on a non-200 response', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ detail: 'boom' }, 500));

      expect(await makeClient().findSimilar('text')).toBeNull();
    });

    it('returns null when the service is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      expect(await makeClient().findSimilar('text')).toBeNull();
    });

    it('returns null on a malformed response body', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));

      expect(await makeClient().findSimilar('text')).toBeNull();
    });
  });

  describe('ingestDocuments', () => {
    it('posts the batch and reports success', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ingested: 1, skipped: 0 }));

      const ok = await makeClient().ingestDocuments([
        { id: 'stockpile:1', text: 'roast', kind: 'roast', target: 'Solana' },
      ]);

      expect(ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8100/documents',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('skips the network round-trip for an empty batch', async () => {
      const ok = await makeClient().ingestDocuments([]);

      expect(ok).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports failure without throwing when the service errors', async () => {
      fetchMock.mockRejectedValue(new Error('socket hang up'));

      const ok = await makeClient().ingestDocuments([
        { id: 'stockpile:1', text: 'roast', kind: 'roast' },
      ]);

      expect(ok).toBe(false);
    });
  });
});
