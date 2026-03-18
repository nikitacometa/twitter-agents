import type { Logger } from 'pino';
import type { TwitterClient } from './twitter-client.js';
import type { MentionRepository } from '@storage/repositories/mention.repository.js';
import type { UserRepository } from '@storage/repositories/user.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { QueueRepository } from '@storage/repositories/queue.repository.js';
import type { MentionRequestType } from '@common/types/index.js';

const ROAST_KEYWORDS = ['roast', 'beef', 'cook', 'destroy', 'grill', 'flame', 'burn'];
const CHALLENGE_KEYWORDS = ['challenge', 'cap', 'false', 'wrong', 'lie', 'fake', 'proof'];

export class MentionHandler {
  private readonly twitter: TwitterClient;
  private readonly mentionRepo: MentionRepository;
  private readonly userRepo: UserRepository;
  private readonly configRepo: ConfigRepository;
  private readonly queueRepo: QueueRepository;
  private readonly logger: Logger;

  constructor(opts: {
    twitter: TwitterClient;
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

  async poll(): Promise<number> {
    if (!this.twitter.isConfigured) {
      this.logger.debug('Mention poll skipped — Twitter not configured');
      return 0;
    }

    const runtime = this.configRepo.getRuntime();
    const sinceId = runtime.mentionSinceId ?? undefined;

    const mentions = await this.twitter.getMentions(sinceId);
    if (mentions.length === 0) {
      this.logger.debug({ sinceId }, 'No new mentions');
      return 0;
    }

    let processed = 0;
    let latestId = sinceId;

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
          this.logger.info(
            { tweetId: m.tweetId, target, author: m.authorName },
            'Roast request queued from mention',
          );
        }
      }

      processed++;
    }

    if (latestId && latestId !== sinceId) {
      this.configRepo.setMentionSinceId(latestId);
    }

    this.logger.info({ processed, total: mentions.length }, 'Mentions processed');
    return processed;
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
