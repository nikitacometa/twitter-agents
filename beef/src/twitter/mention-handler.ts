import type { Logger } from 'pino';
import type { ITwitterClient } from './twitter-client.interface.js';
import type { MentionRepository } from '@storage/repositories/mention.repository.js';
import type { UserRepository } from '@storage/repositories/user.repository.js';
import type { ConfigRepository } from '@storage/repositories/config.repository.js';
import type { QueueRepository } from '@storage/repositories/queue.repository.js';
import type { TweetRepository } from '@storage/repositories/tweet.repository.js';
import type { RoastRepository } from '@storage/repositories/roast.repository.js';
import type { MentionRequestType } from '@common/types/index.js';
import type { MentionData } from './twitter-client.interface.js';
import type { ActivityLogger } from '../activity/activity-logger.js';

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

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class MentionHandler {
  private readonly twitter: ITwitterClient;
  private readonly mentionRepo: MentionRepository;
  private readonly userRepo: UserRepository;
  private readonly configRepo: ConfigRepository;
  private readonly queueRepo: QueueRepository;
  private readonly tweetRepo?: TweetRepository;
  private readonly roastRepo?: RoastRepository;
  private readonly logger: Logger;
  private readonly botUsername: string;
  private readonly activityLogger?: ActivityLogger;
  private isPolling = false;

  constructor(opts: {
    twitter: ITwitterClient;
    mentionRepo: MentionRepository;
    userRepo: UserRepository;
    configRepo: ConfigRepository;
    queueRepo: QueueRepository;
    tweetRepo?: TweetRepository;
    roastRepo?: RoastRepository;
    logger: Logger;
    botUsername?: string;
    activityLogger?: ActivityLogger;
  }) {
    this.twitter = opts.twitter;
    this.mentionRepo = opts.mentionRepo;
    this.userRepo = opts.userRepo;
    this.configRepo = opts.configRepo;
    this.queueRepo = opts.queueRepo;
    this.tweetRepo = opts.tweetRepo;
    this.roastRepo = opts.roastRepo;
    this.logger = opts.logger;
    this.botUsername = opts.botUsername?.trim() || '0xBeefer';
    this.activityLogger = opts.activityLogger;
  }

  async poll(): Promise<PollResult> {
    if (this.isPolling) {
      this.logger.debug('Mention poll skipped — already polling');
      return { processed: 0, mentions: [] };
    }
    if (!this.twitter.isConfigured) {
      this.logger.debug('Mention poll skipped — Twitter not configured');
      return { processed: 0, mentions: [] };
    }

    this.isPolling = true;
    try {
      return await this.doPoll();
    } finally {
      this.isPolling = false;
    }
  }

  private async doPoll(): Promise<PollResult> {

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

      const requestType = classifyMention(m.text, this.botUsername);

      this.mentionRepo.insert({
        tweetId: m.tweetId,
        authorId: m.authorId,
        authorName: m.authorName,
        text: m.text,
        requestType,
        conversationId: m.conversationId,
      });

      this.userRepo.upsert({
        twitterId: m.authorId,
        username: m.authorName,
      });
      this.userRepo.incrementInteraction(m.authorId);

      // Persist observed tweets for corpus building
      if (this.tweetRepo) {
        this.tweetRepo.insert({
          tweetId: m.tweetId,
          authorId: m.authorId,
          authorName: m.authorName,
          text: m.text,
          source: 'mention_poll',
          createdAt: new Date().toISOString(),
        });
        if (m.inReplyToTweetId && m.parentTweetText && m.parentAuthorName) {
          this.tweetRepo.insert({
            tweetId: m.inReplyToTweetId,
            authorId: 'unknown',
            authorName: m.parentAuthorName,
            text: m.parentTweetText,
            source: 'mention_poll',
            createdAt: new Date().toISOString(),
          });
        }
      }

      // Thread-aware filtering: skip chatter in threads where bot already participated
      if (this.shouldSkipThreadMention(m, requestType)) {
        this.logger.info(
          { tweetId: m.tweetId, author: m.authorName, conversationId: m.conversationId, requestType },
          'Mention skipped — thread chatter (bot already in conversation)',
        );
        summaries.push({
          tweetId: m.tweetId,
          authorName: m.authorName,
          text: m.text,
          requestType,
          queued: false,
          inReplyToTweetId: m.inReplyToTweetId,
          parentAuthorName: m.parentAuthorName,
          parentTextSnippet: m.parentTweetText?.slice(0, 100),
        });
        processed++;
        continue;
      }

      let queued = false;
      let queueTarget: string | undefined;

      if (requestType === 'roast_request') {
        const target = extractTarget(m.text);
        if (target) {
          // Scenario 1: explicit "roast @X" / "roast $TOKEN"
          const replyTarget = m.inReplyToTweetId ?? m.tweetId;
          const convPart = m.conversationId ? `|conversation:${m.conversationId}` : '';
          this.queueRepo.enqueue({
            targetName: target,
            targetType: 'project',
            source: 'mention',
            priority: 3,
            context: `reply_to:${replyTarget}|by:@${m.authorName}|mention:${m.tweetId}${convPart}`,
          });
          queued = true;
          queueTarget = target;
          this.logger.info(
            { tweetId: m.tweetId, target, author: m.authorName },
            'Roast request queued from mention',
          );
        } else if (isRoastMe(m.text, this.botUsername)) {
          // "roast me" / "@0xBeefer roast me gango" → target = the author
          queueTarget = this.enqueueHandleRoast(m, m.authorName, { roastMe: true });
          queued = true;
          this.logger.info(
            { tweetId: m.tweetId, author: m.authorName },
            '"Roast me" request — targeting author',
          );
        } else {
          const tagged = extractTaggedHandle(m.text, this.botUsername);
          if (tagged && !this.isBotOrParentAuthor(tagged, m)) {
            // Scenario 3: roast keyword + tagged handle (non-adjacent)
            queueTarget = this.enqueueHandleRoast(m, tagged);
            queued = true;
          } else if (m.inReplyToTweetId && !this.isParentByBot(m)) {
            // Scenario 2: roast keyword under someone's tweet (not bot's own)
            queueTarget = this.enqueueParentTweetRoast(m);
            queued = true;
          } else {
            // Roast request but no valid target — casual reply instead
            queueTarget = this.enqueueCasualReply(m);
            queued = true;
          }
        }
      } else {
        const tagged = extractTaggedHandle(m.text, this.botUsername);
        if (tagged && !this.isBotOrParentAuthor(tagged, m)) {
          // Scenario 3: "@0xBeefer @elonmusk" or "@0xBeefer check this @user"
          queueTarget = this.enqueueHandleRoast(m, tagged);
          queued = true;
        } else if (isBareOrSimpleMention(m.text) && m.inReplyToTweetId && !this.isParentByBot(m)) {
          // Scenario 2: bare "@0xBeefer" under a tweet (not bot's own)
          queueTarget = this.enqueueParentTweetRoast(m);
          queued = true;
        } else {
          // Casual reply — bot was mentioned but no roast target identifiable
          queueTarget = this.enqueueCasualReply(m);
          queued = true;
        }
      }

      if (queued) {
        this.activityLogger?.emit({
          type: 'mention',
          data: { author: m.authorName, target: queueTarget ?? m.authorName, requestType },
        });
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
    const convPart = m.conversationId ? `|conversation:${m.conversationId}` : '';
    const targetName = tweetSnippet
      ? `tweet by @${parentAuthor}: "${tweetSnippet}"`
      : `tweet by @${parentAuthor}`;
    this.queueRepo.enqueue({
      targetName,
      targetType: 'project',
      source: 'mention',
      priority: 3,
      context: `reply_to:${m.inReplyToTweetId!}|by:@${m.authorName}|mention:${m.tweetId}${mediaPart}${convPart}`,
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

  private enqueueCasualReply(m: MentionData): string {
    const targetName = `@${m.authorName}`;
    const textSnippet = m.text.slice(0, 200);
    const convPart = m.conversationId ? `|conversation:${m.conversationId}` : '';
    this.queueRepo.enqueue({
      targetName,
      targetType: 'person',
      source: 'casual_reply',
      priority: 5,
      context: `reply_to:${m.tweetId}|by:@${m.authorName}${convPart}|text:${textSnippet}`,
    });
    this.logger.info(
      { tweetId: m.tweetId, author: m.authorName },
      'Casual reply queued from mention',
    );
    return targetName;
  }

  private shouldSkipThreadMention(m: MentionData, requestType: MentionRequestType): boolean {
    const hasRepliedInConversation = m.conversationId
      ? (this.roastRepo?.hasRepliedInConversation(m.conversationId) ?? false)
      : false;
    return shouldSkipThreadMention(m, requestType, this.botUsername, hasRepliedInConversation);
  }

  /** Check if the parent tweet was authored by the bot itself. */
  private isParentByBot(m: MentionData): boolean {
    return !!m.parentAuthorName
      && m.parentAuthorName.toLowerCase() === this.botUsername.toLowerCase();
  }

  /** Check if a tagged handle is the bot or the parent tweet's author (not a roast target). */
  private isBotOrParentAuthor(handle: string, m: MentionData): boolean {
    const lower = handle.toLowerCase();
    if (lower === this.botUsername.toLowerCase()) return true;
    if (m.parentAuthorName && lower === m.parentAuthorName.toLowerCase()) return true;
    return false;
  }

  private enqueueHandleRoast(m: MentionData, handle: string, opts?: { roastMe?: boolean }): string {
    const targetName = `@${handle}`;
    // Reply to parent tweet (if under someone's tweet) so the roast appears in that thread
    const replyTarget = m.inReplyToTweetId ?? m.tweetId;
    const roastMeFlag = opts?.roastMe ? '|roast_me:1' : '';
    const convPart = m.conversationId ? `|conversation:${m.conversationId}` : '';
    this.queueRepo.enqueue({
      targetName,
      targetType: opts?.roastMe ? 'person' : 'project',
      source: 'mention',
      priority: 3,
      context: `reply_to:${replyTarget}|by:@${m.authorName}|mention:${m.tweetId}|handle:@${handle}${roastMeFlag}${convPart}`,
    });
    this.logger.info(
      { tweetId: m.tweetId, handle, author: m.authorName, roastMe: !!opts?.roastMe },
      'Handle roast queued from mention',
    );
    return targetName;
  }
}

export function classifyMention(text: string, botUsername = '0xBeefer'): MentionRequestType {
  // Strip bot's own mention so that "BeefThis" containing "beef" doesn't
  // force every mention into roast_request.
  const stripped = text.replace(new RegExp(`@${escapeRegExp(botUsername)}`, 'gi'), '');
  const lower = stripped.toLowerCase();

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
 * Examples: "@BeefThis", "@BeefThis 🔥", "@BeefThis pls"
 */
export function isBareOrSimpleMention(text: string): boolean {
  // Strip all @mentions, emojis (common Unicode ranges), and whitespace
  const stripped = text
    .replace(/@\w+/g, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .trim();

  // Nothing left, or very short filler words (< 10 chars: "pls", "do it", "go", etc.)
  return stripped.length < 10;
}

export function extractTaggedHandle(text: string, botUsername: string): string | null {
  // Strip bot's own mention (case-insensitive), then find first remaining @handle
  const stripped = text.replace(new RegExp(`@${escapeRegExp(botUsername)}`, 'gi'), '');
  const match = stripped.match(/@(\w+)/);
  return match?.[1] ?? null;
}

/**
 * Detect "roast me" patterns — user wants to be roasted themselves.
 * Examples: "roast me", "roast me gango", "@0xBeefer roast me bro"
 */
export function isRoastMe(text: string, botUsername: string): boolean {
  const stripped = text.replace(new RegExp(`@${escapeRegExp(botUsername)}`, 'gi'), '').trim();
  return /(?:roast|beef|cook|destroy|grill|flame|burn)\s+me\b/i.test(stripped);
}

export function extractTarget(text: string): string | null {
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

/**
 * Determine whether a mention in a thread should be skipped.
 *
 * Skip when the bot has already participated in the conversation (via conversation_id)
 * OR the mention is a direct reply to a bot tweet — UNLESS the mention contains an
 * explicit roast command ("roast @X", "roast me", "roast $TOKEN").
 */
export function shouldSkipThreadMention(
  m: MentionData,
  requestType: MentionRequestType,
  botUsername: string,
  hasRepliedInConversation: boolean,
): boolean {
  if (!m.inReplyToTweetId) return false;

  const replyingToBot = !!m.parentAuthorName
    && m.parentAuthorName.toLowerCase() === botUsername.toLowerCase();

  if (!hasRepliedInConversation && !replyingToBot) return false;

  // Direct replies to bot's tweets are engagement, not spam — always let through as casual replies
  if (replyingToBot) return false;

  if (requestType === 'roast_request') {
    if (extractTarget(m.text)) return false;
    if (isRoastMe(m.text, botUsername)) return false;
  }

  // Challenges must always get through — they dispute a bot roast in the same thread
  if (requestType === 'challenge') return false;

  return true;
}
