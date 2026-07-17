/**
 * Backfill the retrieval service with the existing roast corpus so semantic
 * dedup has history to match against: stockpiled roasts + posted roasts.
 * Idempotent — the service upserts by document id.
 *
 * Usage:
 *   RETRIEVAL_SERVICE_URL=http://localhost:8100 pnpm tsx scripts/backfill-retrieval.ts
 */
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { pino } from 'pino';
import { RetrievalClient, type RetrievalDocument } from '../src/retrieval/retrieval-client.js';

dotenv.config();

const BATCH_SIZE = 100;

async function main(): Promise<void> {
  const logger = pino({ level: 'info' });
  const baseUrl = process.env.RETRIEVAL_SERVICE_URL;
  if (!baseUrl) {
    logger.error('RETRIEVAL_SERVICE_URL is required');
    process.exit(1);
  }

  const dbPath = process.env.DB_PATH ?? './data/beef.db';
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const client = new RetrievalClient({ baseUrl, logger, timeoutMs: 30_000 });

  const stockpileRows = db
    .prepare('SELECT id, target_name, tweet_text, quality_score, created_at FROM roast_stockpile')
    .all() as Array<{ id: number; target_name: string; tweet_text: string; quality_score: number; created_at: string }>;

  const roastRows = db
    .prepare("SELECT id, target_name, tweet_text, created_at FROM roasts WHERE status = 'posted'")
    .all() as Array<{ id: number; target_name: string; tweet_text: string; created_at: string }>;

  const docs: RetrievalDocument[] = [
    ...stockpileRows.map((r) => ({
      id: `stockpile:${String(r.id)}`,
      text: r.tweet_text,
      kind: 'roast' as const,
      target: r.target_name,
      score: r.quality_score,
      created_at: r.created_at,
    })),
    ...roastRows.map((r) => ({
      id: `roast:${String(r.id)}`,
      text: r.tweet_text,
      kind: 'roast' as const,
      target: r.target_name,
      created_at: r.created_at,
    })),
  ];

  logger.info({ stockpile: stockpileRows.length, posted: roastRows.length }, 'Backfilling corpus');

  let ingested = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const ok = await client.ingestDocuments(batch);
    if (!ok) {
      logger.error({ offset: i }, 'Batch ingest failed — is the service running?');
      process.exit(1);
    }
    ingested += batch.length;
    logger.info({ ingested, total: docs.length }, 'Batch ingested');
  }

  db.close();
  logger.info({ ingested }, 'Backfill complete');
}

void main();
