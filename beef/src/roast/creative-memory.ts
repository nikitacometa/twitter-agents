import type { Logger } from 'pino';
import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { ExternalExampleRepository } from '@storage/repositories/external-example.repository.js';
import type { RoastPatternRepository } from '@storage/repositories/roast-pattern.repository.js';
import type { StockpileRepository } from '@storage/repositories/stockpile.repository.js';
import type { FarmAttemptRepository } from '@storage/repositories/farm-attempt.repository.js';
import type { AngleWeight, CreativeMemory, FireExample, RejectExample } from '@common/types/index.js';
import { DEFAULT_ANGLE_WEIGHTS } from './prompt-builder.js';

export interface CreativeMemorySourcesOptions {
  targetName: string;
  logger: Logger;
  feedbackRepo?: FeedbackRepository;
  configRepo?: ConfigRepository;
  exampleRepo?: ExternalExampleRepository;
  patternRepo?: RoastPatternRepository;
  stockpileRepo?: StockpileRepository;
  farmAttemptRepo?: FarmAttemptRepository;
}

/**
 * Unified CreativeMemory builder — merges data from all available sources.
 *
 * Sources (all optional):
 * 1. feedbackRepo  — fire examples, reject patterns, target history, angle weights
 * 2. configRepo    — style supplement (computed by /analyze)
 * 3. exampleRepo   — external curated roast examples
 * 4. patternRepo   — learned roast techniques
 * 5. stockpileRepo — high-scoring stockpile roasts as fire examples
 * 6. farmAttemptRepo — worst-evaluated attempts as reject examples
 */
export function buildCreativeMemory(opts: CreativeMemorySourcesOptions): CreativeMemory | undefined {
  const {
    targetName, logger,
    feedbackRepo, configRepo, exampleRepo, patternRepo,
    stockpileRepo, farmAttemptRepo,
  } = opts;

  try {
    const fireExamples: FireExample[] = [];
    const rejectExamples: RejectExample[] = [];
    let angleWeights: AngleWeight[] | undefined;

    // --- Feedback repo: human-rated examples, target history, angle performance ---
    if (feedbackRepo) {
      const targetFire = feedbackRepo.getFireExamplesForTarget(targetName, 1);
      const otherFire = feedbackRepo
        .getFireExamples(5)
        .filter((ex) => ex.target.toLowerCase() !== targetName.toLowerCase())
        .slice(0, 2 - targetFire.length);
      fireExamples.push(...targetFire, ...otherFire);

      const allRejects = feedbackRepo.getRejectExamples(5);
      if (allRejects.length >= 5) {
        rejectExamples.push(...allRejects.slice(0, 3));
      }

      const anglePerf = feedbackRepo.getAnglePerformance();
      const perfWeights = anglePerf
        .filter((a) => a.total >= 3)
        .map((a) => ({
          angle: a.angle,
          weight: Math.max(0.3, Math.min(2.0, a.fireCount / a.total)),
        }));
      if (perfWeights.length > 0) {
        angleWeights = perfWeights;
      }
    }

    // --- Stockpile repo: top-scoring roasts as additional fire examples ---
    if (stockpileRepo) {
      const topRoasts = stockpileRepo.getTopScored(4.0, 5);
      const stockpileFire = topRoasts.map((r) => ({
        text: r.tweetText,
        angle: r.angle ?? 'UNKNOWN',
        target: r.targetName,
      }));
      // Deduplicate against existing fire examples
      for (const sf of stockpileFire) {
        if (!fireExamples.some((f) => f.text === sf.text)) {
          fireExamples.push(sf);
        }
      }

      // Compute inverse-frequency angle weights from stockpile distribution
      if (!angleWeights) {
        const angleDist = stockpileRepo.getAngleDistribution();
        angleWeights = computeAngleWeights(angleDist);
      }
    }

    // --- Farm attempt repo: worst-evaluated as additional reject examples ---
    if (farmAttemptRepo) {
      const worstAttempts = farmAttemptRepo.getWorstEvaluated(2.5, 3);
      const farmRejects = worstAttempts.map((a) => ({
        text: a.tweetText,
        angle: a.angle ?? 'UNKNOWN',
        target: a.targetName,
      }));
      for (const fr of farmRejects) {
        if (!rejectExamples.some((r) => r.text === fr.text)) {
          rejectExamples.push(fr);
        }
      }
    }

    // --- Target history (from feedback repo) ---
    let targetHistory: CreativeMemory['targetHistory'];
    if (feedbackRepo) {
      const roastCount = feedbackRepo.getTargetSessionCount(targetName);
      if (roastCount >= 3) {
        targetHistory = { roastCount, angles: feedbackRepo.getTargetAngleHistory(targetName) };
      }
    }

    // --- Style supplement (from config repo, computed by /analyze) ---
    const styleSupplement = configRepo?.getStyleSupplement()?.text;

    // --- External curated examples ---
    let externalExamples: FireExample[] | undefined;
    if (exampleRepo) {
      const topExternal = exampleRepo.getForPrompt(3);
      if (topExternal.length > 0) {
        externalExamples = topExternal.map((ex) => ({
          text: ex.roastText,
          angle: ex.classifiedAngle ?? 'DATA_BOMB',
          target: ex.originalAuthor ?? 'unknown',
        }));
        for (const ex of topExternal) {
          exampleRepo.incrementUsage(ex.id);
        }
      }
    }

    // --- Learned techniques from pattern repo ---
    let learnedTechniques: string[] | undefined;
    if (patternRepo) {
      const topPatterns = patternRepo.getTop(5);
      if (topPatterns.length > 0) {
        learnedTechniques = topPatterns.map((p) => p.description);
      }
    }

    // Return undefined if no meaningful data
    if (
      fireExamples.length === 0 &&
      rejectExamples.length === 0 &&
      !angleWeights &&
      !styleSupplement &&
      !externalExamples &&
      !learnedTechniques
    ) {
      return undefined;
    }

    return {
      fireExamples,
      targetHistory,
      rejectExamples: rejectExamples.length > 0 ? rejectExamples : undefined,
      angleWeights,
      styleSupplement,
      externalExamples,
      learnedTechniques,
    };
  } catch (err) {
    logger.warn({ err }, 'Failed to build creative memory');
    return undefined;
  }
}

/**
 * Compute angle weights from stockpile distribution — inverse frequency × quality weight.
 * Underused angles get higher weight. Unused angles get a 2x diversity boost.
 */
function computeAngleWeights(
  angleDist: Array<{ angle: string; count: number }>,
): AngleWeight[] | undefined {
  if (angleDist.length === 0) return undefined;

  const maxCount = Math.max(...angleDist.map((a) => a.count));
  const usedAngles = new Set(angleDist.map((a) => a.angle));

  const allAngles = [
    'DATA_BOMB', 'TIMELINE', 'COMPARISON', 'FAKE_COMPLIMENT',
    'RHETORICAL', 'SELF_AWARE', 'QUOTE_FLIP', 'UNDERSTATEMENT', 'RULE_OF_THREE',
  ];

  return allAngles.map((angle) => {
    const qualityWeight = DEFAULT_ANGLE_WEIGHTS[angle] ?? 1.0;
    if (!usedAngles.has(angle)) {
      return { angle, weight: 2.0 * qualityWeight };
    }
    const count = angleDist.find((a) => a.angle === angle)?.count ?? 0;
    return { angle, weight: (1 + (maxCount - count) / maxCount) * qualityWeight };
  });
}
