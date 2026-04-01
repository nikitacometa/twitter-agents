import type { Logger } from 'pino';
import type { ScoredTweet } from '../monitor/tweet-scorer.js';
import type { ProviderManager } from '../agent/provider-manager.js';
import type { ReplyGuyCandidateRepository } from './reply-guy-candidate.repository.js';
import type { EvaluatedCandidate } from './types.js';
import { getErrorMessage } from '../common/utils/error.util.js';
import { TIER_SCORES } from '../monitor/monitor-targets.js';

/** Skip automated deploy/mint tweets — no opinion to attack */
const DEPLOY_BOT_PATTERNS = [
  /\b(deployed|created|minted|spawned)\s+\$/i,
  /\bnew token\s+(deployed|created|live)\b/i,
  /\btoken deployed\b/i,
];

interface EvalResponseItem {
  tweetId: string;
  roastability: number;
  angle?: string;
  reasoning: string;
}

export interface SelectorConfig {
  minScore: number;
  maxAgeMinutes: number;
  dailyCap: number;
  minRoastability: number;
  maxPerCycle: number;
}

export class ReplyGuySelector {
  constructor(
    private readonly provider: ProviderManager,
    private readonly candidateRepo: ReplyGuyCandidateRepository,
    private readonly logger: Logger,
  ) {}

  filterCandidates(tweets: ScoredTweet[], config: SelectorConfig): ScoredTweet[] {
    const todayCount = this.candidateRepo.getTodayCount();
    if (todayCount >= config.dailyCap) {
      this.logger.info({ todayCount, cap: config.dailyCap }, 'Reply guy: daily cap reached');
      return [];
    }

    const remaining = config.dailyCap - todayCount;
    const rejected: Record<string, string> = {};

    const filtered = tweets
      .filter((t) => {
        if (DEPLOY_BOT_PATTERNS.some((p) => p.test(t.text))) { rejected[t.tweetId] = 'deploy-bot tweet'; return false; }
        if (t.score < config.minScore) { rejected[t.tweetId] = `score ${t.score} < ${config.minScore}`; return false; }
        if (t.ageMinutes > config.maxAgeMinutes) { rejected[t.tweetId] = `age ${t.ageMinutes}m > ${config.maxAgeMinutes}m`; return false; }
        if (t.text.length < 50) { rejected[t.tweetId] = `text too short (${t.text.length})`; return false; }
        if (this.candidateRepo.hasSeen(t.tweetId)) { rejected[t.tweetId] = 'already seen'; return false; }
        if (this.candidateRepo.hasRecentAuthor(t.authorHandle)) { rejected[t.tweetId] = `recent author @${t.authorHandle}`; return false; }
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(8, remaining));

    if (Object.keys(rejected).length > 0) {
      this.logger.info({ rejected, todayCount, remaining }, 'Reply guy: hard filter rejections');
    }

    return filtered;
  }

  async evaluateBatch(
    candidates: ScoredTweet[],
    minRoastability: number,
    maxPerCycle: number,
  ): Promise<EvaluatedCandidate[]> {
    if (candidates.length === 0) return [];

    // Insert all candidates into DB as 'pending'
    for (const c of candidates) {
      this.candidateRepo.insert(c);
    }

    const prompt = buildEvalPrompt(candidates);

    try {
      const result = await this.provider.run<EvalResponseItem[]>('reply-guy-eval', {
        prompt,
        profile: 'audit',
        timeoutMs: 90_000,
        requiresResearch: false,
      });

      const items = Array.isArray(result.data) ? result.data : [];
      const tweetMap = new Map(candidates.map((c) => [c.tweetId, c]));
      const evaluated: EvaluatedCandidate[] = [];

      for (const item of items) {
        const tweet = tweetMap.get(item.tweetId);
        if (!tweet) continue;

        const roastability = Math.min(10, Math.max(1, Math.round(item.roastability)));
        const reasoning = item.reasoning ?? '';
        const angle = item.angle ?? null;

        if (roastability >= minRoastability) {
          this.candidateRepo.markEvaluated(tweet.tweetId, roastability, reasoning, angle);
          evaluated.push({ tweet, roastability, reasoning, suggestedAngle: angle });
        } else {
          this.candidateRepo.markSkipped(tweet.tweetId, roastability, reasoning);
        }
      }

      // Mark any candidates not in LLM response as skipped
      for (const c of candidates) {
        const found = items.some((i) => i.tweetId === c.tweetId);
        if (!found) {
          this.candidateRepo.markSkipped(c.tweetId, 0, 'Not evaluated by LLM');
        }
      }

      this.logger.info(
        { candidates: candidates.length, evaluated: evaluated.length, threshold: minRoastability },
        'Reply guy: batch evaluation complete',
      );

      return evaluated
        .sort((a, b) => b.roastability - a.roastability)
        .slice(0, maxPerCycle);
    } catch (error) {
      this.logger.error(
        { err: error, candidateCount: candidates.length },
        'Reply guy: LLM evaluation failed',
      );
      // Mark all as skipped on failure
      for (const c of candidates) {
        this.candidateRepo.markSkipped(c.tweetId, 0, `Eval error: ${getErrorMessage(error)}`);
      }
      return [];
    }
  }
}

function buildEvalPrompt(candidates: ScoredTweet[]): string {
  const tweetList = candidates
    .map(
      (c) =>
        `- tweetId: "${c.tweetId}"
  author: @${c.authorHandle} (${c.tier}-tier, ${String(c.followersK)}K followers)
  score: ${String(c.score)} pts (tier=${String(TIER_SCORES[c.tier])}, age=${String(c.ageMinutes)}m)
  isReply: ${String(c.isReply)}
  text: "${c.text}"`,
    )
    .join('\n\n');

  return `You are a tweet evaluator for $BEEF, a crypto roast bot on Twitter. Your job is to rate tweets by how roastable they are — specifically, how well our bot can write a savage, funny reply.

## WHAT MAKES A TWEET ROASTABLE (high score)

1. **Quote-flippable** — their own words can be turned against them. "biggest L2 by far" → "biggest cope by far". This is our #1 weapon.
2. **Factually attackable** — they claim a number or fact that's wrong or misleading. We dunk with real data.
3. **Hypocrisy / contradiction** — they preach X but do Y. "Decentralization is the future" from a team on a centralized chain.
4. **Hot take / controversial opinion** — the tweet is getting ratio'd or debated. Our reply rides the engagement wave.
5. **Specific and concrete** — they name projects, numbers, timelines. Generic "crypto is the future" tweets give us nothing to attack.

## WHAT DISQUALIFIES A TWEET (low score)

1. **Breaking news / factual report** — no opinion to attack, just facts. "BTC hits $100K" is not roastable.
2. **Personal milestone** — "just hit 100K followers" — punching down vibes.
3. **Grief / loss / health** — never roast these. Period.
4. **Pure technical deep-dive** — too niche, audience won't get the roast.
5. **Already being ratioed hard** — we're late to the pile, our reply won't stand out.
6. **Too vague / generic** — "bullish on crypto" gives us nothing specific to flip.
7. **Reply with minimal context** — if it's a reply that only makes sense in its thread and we can't see the full context.

## TWEETS TO EVALUATE

${tweetList}

## RESPONSE FORMAT

Return a JSON array. For each tweet, provide:
- tweetId: the tweet ID
- roastability: 1-10 integer (10 = perfect roast target)
- angle: suggested roast angle — one of QUOTE_FLIP, DATA_BOMB, HYPOCRISY, TIMELINE, COMPARISON, RHETORICAL, RULE_OF_THREE (or null if score < 5)
- reasoning: 1 sentence explaining your rating

Return ONLY the JSON array, no markdown fences, no explanation.

[`;
}
