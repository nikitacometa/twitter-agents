import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Logger } from 'pino';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { StockpileExportRow, FreshnessType } from './types.js';

// --- Export ---

export async function exportNdjson(
  stockpile: StockpileRepository,
  outputPath: string,
  limit: number,
  logger: Logger,
): Promise<number> {
  const roasts = stockpile.getExportable(limit);
  const stream = createWriteStream(outputPath, { encoding: 'utf-8' });

  let count = 0;
  for (const roast of roasts) {
    const row: StockpileExportRow = {
      target_name: roast.targetName,
      target_type: roast.targetType,
      tweet_text: roast.tweetText,
      angle: roast.angle,
      quality_score: roast.qualityScore,
      evaluator_output: roast.evaluatorOutput,
      research_notes: roast.researchNotes,
      freshness_type: roast.freshnessType,
      expires_at: roast.expiresAt,
    };
    stream.write(JSON.stringify(row) + '\n');
    count++;
  }

  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on('error', reject);
  });

  logger.info({ outputPath, count }, 'NDJSON export complete');
  return count;
}

// --- Import ---

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
}

export async function importNdjson(
  stockpile: StockpileRepository,
  inputPath: string,
  logger: Logger,
): Promise<ImportResult> {
  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let lineNum = 0;

  for await (const line of rl) {
    lineNum++;
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    try {
      const row = JSON.parse(trimmed) as StockpileExportRow;

      if (!isValidExportRow(row)) {
        logger.warn({ lineNum }, 'Invalid row format, skipping');
        errors++;
        continue;
      }

      // Idempotent: skip if duplicate (target_name + tweet_text)
      if (stockpile.isDuplicate(row.tweet_text, row.target_name)) {
        skipped++;
        continue;
      }

      stockpile.insert({
        targetName: row.target_name,
        targetType: row.target_type,
        tweetText: row.tweet_text,
        angle: row.angle ?? undefined,
        qualityScore: row.quality_score,
        evaluatorOutput: row.evaluator_output ?? undefined,
        researchNotes: row.research_notes ?? undefined,
        freshnessType: row.freshness_type,
        expiresAt: row.expires_at ?? undefined,
      });
      imported++;
    } catch (err) {
      logger.warn({ lineNum, err }, 'Failed to parse NDJSON line');
      errors++;
    }
  }

  logger.info({ inputPath, imported, skipped, errors }, 'NDJSON import complete');
  return { imported, skipped, errors };
}

// --- Export JSON (landing page format) ---

export interface LandingPageExport {
  generated_at: string;
  total: number;
  roasts: Array<{
    target: string;
    type: string;
    text: string;
    angle: string | null;
    score: number;
    freshness: FreshnessType;
  }>;
}

export function exportLandingJson(
  stockpile: StockpileRepository,
  limit: number,
): LandingPageExport {
  const roasts = stockpile.getExportable(limit);

  return {
    generated_at: new Date().toISOString(),
    total: roasts.length,
    roasts: roasts.map((r) => ({
      target: r.targetName,
      type: r.targetType,
      text: r.tweetText,
      angle: r.angle,
      score: r.qualityScore,
      freshness: r.freshnessType,
    })),
  };
}

// --- Validation ---

const VALID_FRESHNESS = new Set<string>(['evergreen', 'data_dependent']);
const VALID_TARGET_TYPES = new Set<string>(['project', 'token', 'trend', 'person']);

function isValidExportRow(row: unknown): row is StockpileExportRow {
  if (typeof row !== 'object' || row === null) return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r['target_name'] === 'string' &&
    typeof r['target_type'] === 'string' &&
    VALID_TARGET_TYPES.has(r['target_type']) &&
    typeof r['tweet_text'] === 'string' &&
    typeof r['quality_score'] === 'number' &&
    typeof r['freshness_type'] === 'string' &&
    VALID_FRESHNESS.has(r['freshness_type'])
  );
}
