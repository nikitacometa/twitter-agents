import Anthropic from '@anthropic-ai/sdk';
import type { Logger } from 'pino';

export interface MetricsAnalysisInput {
  periodDays: number;
  topTweets: Array<{ text: string; angle: string | null; impressions: number; er: number | null; likes: number }>;
  worstTweets: Array<{ text: string; angle: string | null; impressions: number; er: number | null }>;
  byAngle: Array<{ angle: string; avg_er: number; avg_impressions: number; count: number }>;
  byHour: Array<{ hour: number; avg_er: number; count: number }>;
  byType: Array<{ is_reply: number; avg_er: number; avg_impressions: number; count: number }>;
  stats: { total: number; totalImpressions: number; avgEngagementRate: number | null };
  weekTrend: {
    thisWeekImp: number;
    lastWeekImp: number;
    thisWeekER: number | null;
    lastWeekER: number | null;
    thisWeekTweets: number;
    lastWeekTweets: number;
  } | null;
  suppressed: number;
  deleted: number;
}

export interface MetricsAnalysisResult {
  summary: string;
  contentInsights: string[];
  recommendations: string[];
  angleAdjustments: Array<{ angle: string; direction: 'increase' | 'decrease' | 'keep'; reason: string }>;
  bestPostingHours: number[];
  anomalies: string[];
}

function buildPrompt(input: MetricsAnalysisInput): string {
  const pct = (n: number | null) => (n != null ? `${(n * 100).toFixed(2)}%` : 'N/A');
  const num = (n: number) => n.toLocaleString('en-US');

  let prompt = `Analyze this Twitter roast bot's performance data from the last ${input.periodDays} days.\n\n`;

  prompt += `## Overall Stats\n`;
  prompt += `- Total tweets: ${num(input.stats.total)}\n`;
  prompt += `- Total impressions: ${num(input.stats.totalImpressions)}\n`;
  prompt += `- Average engagement rate: ${pct(input.stats.avgEngagementRate)}\n`;
  prompt += `- Suppressed (possible shadowban): ${input.suppressed}\n`;
  prompt += `- Deleted by Twitter: ${input.deleted}\n\n`;

  if (input.weekTrend) {
    const t = input.weekTrend;
    const impDelta = t.lastWeekImp > 0 ? ((t.thisWeekImp - t.lastWeekImp) / t.lastWeekImp * 100).toFixed(0) : 'N/A';
    prompt += `## Week-over-Week\n`;
    prompt += `- Impressions: ${num(t.thisWeekImp)} (${impDelta}% vs prev week)\n`;
    prompt += `- Avg ER: ${pct(t.thisWeekER)} vs ${pct(t.lastWeekER)}\n`;
    prompt += `- Tweets: ${t.thisWeekTweets} vs ${t.lastWeekTweets}\n\n`;
  }

  if (input.byAngle.length > 0) {
    prompt += `## Performance by Angle (roast technique)\n`;
    prompt += `| Angle | Count | Avg ER | Avg Impressions |\n|---|---|---|---|\n`;
    for (const a of input.byAngle) {
      prompt += `| ${a.angle} | ${a.count} | ${pct(a.avg_er)} | ${Math.round(a.avg_impressions)} |\n`;
    }
    prompt += '\n';
  }

  if (input.byType.length > 0) {
    prompt += `## Performance by Content Type\n`;
    prompt += `| Type | Count | Avg ER | Avg Impressions |\n|---|---|---|---|\n`;
    for (const t of input.byType) {
      prompt += `| ${t.is_reply ? 'Reply' : 'Original'} | ${t.count} | ${pct(t.avg_er)} | ${Math.round(t.avg_impressions)} |\n`;
    }
    prompt += '\n';
  }

  if (input.byHour.length > 0) {
    prompt += `## Performance by Hour (UTC)\n`;
    prompt += `| Hour | Count | Avg ER |\n|---|---|---|\n`;
    for (const h of input.byHour.slice(0, 8)) {
      prompt += `| ${String(h.hour).padStart(2, '0')}:00 | ${h.count} | ${pct(h.avg_er)} |\n`;
    }
    prompt += '\n';
  }

  if (input.topTweets.length > 0) {
    prompt += `## Top ${input.topTweets.length} Tweets (by ER)\n`;
    for (const t of input.topTweets) {
      const preview = t.text.replace(/\n/g, ' ').slice(0, 120);
      prompt += `- [${pct(t.er)} ER, ${num(t.impressions)} imp, ${t.likes} likes, angle: ${t.angle ?? 'unknown'}] "${preview}"\n`;
    }
    prompt += '\n';
  }

  if (input.worstTweets.length > 0) {
    prompt += `## Worst ${input.worstTweets.length} Tweets (by ER)\n`;
    for (const t of input.worstTweets) {
      const preview = t.text.replace(/\n/g, ' ').slice(0, 120);
      prompt += `- [${pct(t.er)} ER, ${num(t.impressions)} imp, angle: ${t.angle ?? 'unknown'}] "${preview}"\n`;
    }
    prompt += '\n';
  }

  prompt += `## Questions\n`;
  prompt += `1. Which roast angles consistently outperform? Which underperform and should get lower weight?\n`;
  prompt += `2. What content patterns make the top tweets work? What kills the worst tweets?\n`;
  prompt += `3. What are the optimal posting hours based on this data?\n`;
  prompt += `4. Are there suppression/shadowban signals that need attention?\n`;
  prompt += `5. Give 3-5 concrete, actionable recommendations for next week.\n\n`;

  prompt += `Respond ONLY with valid JSON matching this schema:\n`;
  prompt += `{\n`;
  prompt += `  "summary": "2-3 sentence executive summary",\n`;
  prompt += `  "contentInsights": ["insight about what content works", ...],\n`;
  prompt += `  "recommendations": ["actionable recommendation", ...],\n`;
  prompt += `  "angleAdjustments": [{"angle": "ANGLE_NAME", "direction": "increase|decrease|keep", "reason": "why"}],\n`;
  prompt += `  "bestPostingHours": [14, 16, 20],\n`;
  prompt += `  "anomalies": ["any concerning patterns"]\n`;
  prompt += `}\n`;

  return prompt;
}

export async function analyzeMetrics(
  input: MetricsAnalysisInput,
  apiKey: string,
  logger: Logger,
): Promise<MetricsAnalysisResult | null> {
  const client = new Anthropic({ apiKey });
  const prompt = buildPrompt(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await client.messages.create(
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: 'You are a data-driven Twitter content strategist analyzing a crypto roast bot. Be specific and actionable. Reference actual numbers from the data.',
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal },
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(jsonMatch) as MetricsAnalysisResult;

    logger.info(
      { recommendations: result.recommendations.length, angleAdjustments: result.angleAdjustments.length },
      'LLM metrics analysis complete',
    );

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('LLM analysis timed out after 60s — skipping');
    } else {
      logger.warn({ err: error }, 'LLM analysis failed — skipping');
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
