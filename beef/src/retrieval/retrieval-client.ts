import type { Logger } from 'pino';

export interface SimilarHit {
  id: string;
  text: string;
  similarity: number;
}

export type DocumentKind = 'roast' | 'research' | 'tweet';

export interface RetrievalDocument {
  id: string;
  text: string;
  kind: DocumentKind;
  target?: string;
  score?: number;
  created_at?: string;
}

/**
 * HTTP client for the Python retrieval-service (semantic search over the
 * roast/research corpus). The service is an optional dependency: every method
 * degrades to a "service unavailable" result instead of throwing, so callers
 * can fall back to the local FTS5 lexical path without try/catch at each site.
 */
export class RetrievalClient {
  private readonly baseUrl: string;
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor(opts: { baseUrl: string; logger: Logger; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.logger = opts.logger;
    this.timeoutMs = opts.timeoutMs ?? 1_500;
  }

  /**
   * Semantic near-duplicate lookup — the embedding-based upgrade of the
   * stockpile's lexical isDuplicate(). Returns null when the service is
   * unreachable so callers can distinguish "no duplicates" from "unknown".
   *
   * Pass `kind` to scope the comparison: the corpus mixes roasts, research
   * claims, and observed tweets, and an unscoped query would reject a roast
   * for paraphrasing the research claim it was written from.
   */
  async findSimilar(
    text: string,
    opts: { threshold?: number; kind?: DocumentKind } = {},
  ): Promise<SimilarHit[] | null> {
    const body = await this.post('/similar', {
      text,
      threshold: opts.threshold ?? 0.83,
      ...(opts.kind ? { kind: opts.kind } : {}),
    });
    if (body === null) return null;
    const parsed = body as { duplicates?: SimilarHit[] };
    return Array.isArray(parsed.duplicates) ? parsed.duplicates : null;
  }

  /**
   * Idempotent batch upsert into the corpus. Returns false (never throws) on
   * failure — ingestion is best-effort and must not block the posting path.
   */
  async ingestDocuments(docs: RetrievalDocument[]): Promise<boolean> {
    if (docs.length === 0) return true;
    return (await this.post('/documents', docs)) !== null;
  }

  private async post(path: string, payload: unknown): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        this.logger.warn({ path, status: res.status }, 'Retrieval service request failed');
        return null;
      }
      const body = (await res.json()) as unknown;
      return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
    } catch (error) {
      // Unreachable service is an expected state (optional dependency) — log
      // at debug and let the caller take the lexical fallback.
      this.logger.debug({ err: error, path }, 'Retrieval service unreachable');
      return null;
    }
  }
}
