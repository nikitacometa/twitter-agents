import type { FeedbackRepository } from '@storage/repositories/feedback.repository.js';
import type { StyleSupplement } from '@storage/repositories/config.repository.js';

const MIN_GOLD_THRESHOLD = 10;
const MIN_ANGLE_RATINGS = 3;
const CHAR_DELTA_THRESHOLD = 30;

export function computeStyleSupplement(
  feedbackRepo: FeedbackRepository,
): StyleSupplement | null {
  const stats = feedbackRepo.getStats();
  const goldCount = stats.byVerdict['fire'] ?? 0;

  if (goldCount < MIN_GOLD_THRESHOLD) return null;

  const anglePerf = feedbackRepo.getAnglePerformance();
  const significant = anglePerf.filter((a) => a.total >= MIN_ANGLE_RATINGS);

  const parts: string[] = [];

  // Top 2 angles by fire rate (>40%)
  const topAngles = significant
    .filter((a) => a.fireCount / a.total > 0.4)
    .sort((a, b) => b.fireCount / b.total - (a.fireCount / a.total))
    .slice(0, 2);

  if (topAngles.length > 0) {
    const formatted = topAngles
      .map((a) => `${a.angle}(${String(Math.round((a.fireCount / a.total) * 100))}%)`)
      .join(', ');
    parts.push(`strongest: ${formatted}`);
  }

  // Worst angle by reject rate (>50%)
  const worstAngle = significant
    .filter((a) => a.rejectCount / a.total > 0.5)
    .sort((a, b) => b.rejectCount / b.total - (a.rejectCount / a.total))[0];

  if (worstAngle) {
    parts.push(
      `weakest: ${worstAngle.angle}(${String(Math.round((worstAngle.rejectCount / worstAngle.total) * 100))}% reject)`,
    );
  }

  // Char length stats
  const fireAvg = feedbackRepo.getFireCharStats();
  const rejectAvg = feedbackRepo.getRejectCharStats();

  if (fireAvg !== null) {
    parts.push(`gold avg ${String(Math.round(fireAvg))}ch`);
  }

  if (fireAvg !== null && rejectAvg !== null && Math.abs(fireAvg - rejectAvg) > CHAR_DELTA_THRESHOLD) {
    parts.push(`bad avg ${String(Math.round(rejectAvg))}ch`);
  }

  // Overall fire rate
  const totalRatings = anglePerf.reduce((sum, a) => sum + a.total, 0);
  if (totalRatings > 0) {
    const totalFire = anglePerf.reduce((sum, a) => sum + a.fireCount, 0);
    parts.push(`overall fire rate: ${String(Math.round((totalFire / totalRatings) * 100))}%`);
  }

  if (parts.length === 0) return null;

  const text = parts.join('. ').slice(0, 200);

  return {
    text,
    computedAt: new Date().toISOString(),
    sampleSize: goldCount,
  };
}
