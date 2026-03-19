import type { Logger } from 'pino';
import type { ITwitterClient } from './twitter-client.interface.js';
import type { MentionRepository } from '@storage/repositories/mention.repository.js';
import type { UserRepository } from '@storage/repositories/user.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { QueueRepository } from '@storage/repositories/queue.repository.js';
import type { MentionRequestType } from '@common/types/index.js';
import type { MentionData } from './twitter-client.interface.js';

export interface MentionPollSummary {
  tweetId: string;
  authorName: string;
  text: string;
  requestType: MentionRequestType;
  queued: boolean;
  queueTarget?: string;
  inReplyToTweetId?: string;
  parentAuthorName?: string;
  parentTextSnippet?: string;
}

export interface PollResult {
  processed: number;
  mentions: MentionPollSummary[];
}

const ROAST_KEYWORDS = ['roast', 'beef', 'cook', 'destroy', 'grill', 'flame', 'burn'];
const CHALLENGE_KEYWORDS = ['challenge', 'cap', 'false', 'wrong', 'lie', 'fake', 'proof'];

export class MentionHandler {
  private readonly twitter: ITwitterClient;
  private readonly mentionRepo: MentionRepository;
  private readonly userRepo: UserRepository;
  private readonly configRepo: ConfigRepository;
  private readonly queueRepo: QueueRepository;
  private readonly logger: Logger;

  constructor(opts: {
    twitter: ITwitterClient;
    mentionRepo: MentionRepository;
    userRepo: UserRepository;
    configRepo: ConfigRepository;
    queueRepo: QueueRepository;
    logger: Logger;
  }) {
    this.twitter = opts.twitter;
    this.mentionRepo = opts.mentionRepo;
    this.userRepo = opts.userRepo;
    this.configRepo = opts.configRepo;
    this.queueRepo = opts.queueRepo;
    this.logger = opts.logger;
  }

  async poll(): Promise<PollResult> {
    if (!this.twitter.isConfigured) {
      this.logger.debug('Mention poll skipped — Twitter not configured');
      return { processed: 0, mentions: [] };
    }

    const runtime = this.configRepo.getRuntime();
    const sinceId = runtime.mentionSinceId ?? undefined;

    const mentions = await this.twitter.getMentions(sinceId);
    if (mentions.length === 0) {
      this.logger.debug({ sinceId }, 'No new mentions');
      return { processed: 0, mentions: [] };
    }

    let processed = 0;
    let latestId = sinceId;
    const summaries: MentionPollSummary[] = [];

    for (const m of mentions) {
      // Always advance cursor regardless of whether we've seen this mention
      if (!latestId || BigInt(m.tweetId) > BigInt(latestId)) {
        latestId = m.tweetId;
      }

      if (this.mentionRepo.exists(m.tweetId)) continue;

      const requestType = classifyMention(m.text);

      this.mentionRepo.insert({
        tweetId: m.tweetId,
        authorId: m.authorId,
        authorName: m.authorName,
        text: m.text,
        requestType,
      });

      this.userRepo.upsert({
        twitterId: m.authorId,
        username: m.authorName,
      });
      this.userRepo.incrementInteraction(m.authorId);

      let queued = false;
      let queueTarget: string | undefined;

      if (requestType === 'roast_request') {
        const target = extractTarget(m.text);
        if (target) {
          this.queueRepo.enqueue({
            targetName: target,
            targetType: 'project',
            source: 'mention',
            priority: 3,
            context: `reply_to:${m.tweetId}|by:@${m.authorName}|${m.text}`,
          });
          queued = true;
          queueTarget = target;
          this.logger.info(
            { tweetId: m.tweetId, target, author: m.authorName },
            'Roast request queued from mention',
          );
        } else if (m.inReplyToTweetId) {
          // "roast" keyword but no explicit target, under a tweet → roast parent tweet
          queueTarget = this.enqueueParentTweetRoast(m);
          queued = true;
        }
      } else if (isBareOrSimpleMention(m.text) && m.inReplyToTweetId) {
        // Bare mention under a tweet → roast that tweet
        queueTarget = this.enqueueParentTweetRoast(m);
        queued = true;
      }

      summaries.push({
        tweetId: m.tweetId,
        authorName: m.authorName,
        text: m.text,
        requestType,
        queued,
        queueTarget,
        inReplyToTweetId: m.inReplyToTweetId,
        parentAuthorName: m.parentAuthorName,
        parentTextSnippet: m.parentTweetText?.slice(0, 100),
      });

      processed++;
    }

    if (latestId && latestId !== sinceId) {
      this.configRepo.setMentionSinceId(latestId);
    }

    this.logger.info({ processed, total: mentions.length }, 'Mentions processed');
    return { processed, mentions: summaries };
  }

  private enqueueParentTweetRoast(m: MentionData): string {
    const parentAuthor = m.parentAuthorName ?? 'anon';
    const tweetSnippet = m.parentTweetText?.slice(0, 120);
    const mediaPart = m.parentMediaUrls?.length
      ? `|media:${m.parentMediaUrls.join(',')}`
      : '';
    const targetName = tweetSnippet
      ? `tweet by @${parentAuthor}: "${tweetSnippet}"`
      : `tweet by @${parentAuthor}`;
    this.queueRepo.enqueue({
      targetName,
      targetType: 'project',
      source: 'mention',
      priority: 3,
      context: `reply_to:${m.tweetId}|by:@${m.authorName}|parent:${m.inReplyToTweetId!}${mediaPart}`,
    });
    this.logger.info(
      {
        tweetId: m.tweetId,
        parentTweetId: m.inReplyToTweetId,
        parentAuthor,
        author: m.authorName,
        mediaCount: m.parentMediaUrls?.length ?? 0,
      },
      'Parent tweet roast queued from mention',
    );
    return targetName;
  }
}

function classifyMention(text: string): MentionRequestType {
  const lower = text.toLowerCase();

  if (ROAST_KEYWORDS.some((kw) => lower.includes(kw))) {
    return 'roast_request';
  }

  if (CHALLENGE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return 'challenge';
  }

  return 'reply';
}

/**
 * Detect "bare" mentions — just @handle with no meaningful text.
 * Examples: "@BeefRoastBot", "@BeefRoastBot 🔥", "@BeefRoastBot pls"
 */
function isBareOrSimpleMention(text: string): boolean {
  // Strip all @mentions, emojis (common Unicode ranges), and whitespace
  const stripped = text
    .replace(/@\w+/g, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .trim();

  // Nothing left, or very short filler words (< 10 chars: "pls", "do it", "go", etc.)
  return stripped.length < 10;
}

function extractTarget(text: string): string | null {
  // Match "roast @handle" or "roast $TOKEN" or "roast ProjectName"
  const patterns = [
    /(?:roast|beef|cook|destroy|grill|flame|burn)\s+@(\w+)/i,
    /(?:roast|beef|cook|destroy|grill|flame|burn)\s+\$(\w+)/i,
    /(?:roast|beef|cook|destroy|grill|flame|burn)\s+([A-Z][a-zA-Z0-9]{2,})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}
